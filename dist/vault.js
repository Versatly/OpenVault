/**
 * OpenVault — Core vault operations
 *
 * Directory layout:
 *   <vaultPath>/
 *     .openvault/
 *       meta.json         vault metadata
 *       embeddings.json   cached embeddings
 *     fact/               category subdirectories
 *     decision/
 *     lesson/
 *     preference/
 *     entity/
 *     event/
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import matter from 'gray-matter';
import { glob } from 'glob';
import { normalizeCategory, DEFAULT_CATEGORIES } from './types.js';
import { EmbeddingCache, embed } from './embeddings.js';
import { BM25Engine, hybridSearch } from './search.js';
export const DEFAULT_VAULT_PATH = path.join(os.homedir(), '.openvault');
export class Vault {
    config;
    bm25 = new BM25Engine();
    cache;
    loaded = false;
    constructor(config) {
        this.config = {
            path: config?.path ?? DEFAULT_VAULT_PATH,
            name: config?.name ?? 'openvault',
        };
        this.cache = new EmbeddingCache(this.config.path);
    }
    /** Create vault directory structure and meta.json. Safe to call multiple times. */
    init() {
        fs.mkdirSync(this.config.path, { recursive: true });
        fs.mkdirSync(path.join(this.config.path, '.openvault'), { recursive: true });
        for (const cat of DEFAULT_CATEGORIES) {
            fs.mkdirSync(path.join(this.config.path, cat), { recursive: true });
        }
        const metaPath = path.join(this.config.path, '.openvault', 'meta.json');
        if (!fs.existsSync(metaPath)) {
            const meta = {
                name: this.config.name,
                version: '1',
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                documentCount: 0,
            };
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        }
    }
    isInitialized() {
        return fs.existsSync(path.join(this.config.path, '.openvault', 'meta.json'));
    }
    ensureInit() {
        if (!this.isInitialized())
            this.init();
    }
    /**
     * Load all memories from disk into BM25 index.
     * Loads cached embeddings but does NOT compute new ones (fast startup).
     * Embeddings are computed lazily in write().
     */
    async load() {
        this.ensureInit();
        this.bm25.clear();
        this.cache.load();
        const files = await glob('**/*.md', {
            cwd: this.config.path,
            ignore: ['.openvault/**'],
        });
        for (const file of files) {
            const memory = this.readFile(path.join(this.config.path, file));
            if (memory)
                this.bm25.add(memory);
        }
        this.loaded = true;
    }
    readFile(fullPath) {
        try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const { data, content } = matter(raw);
            const rel = path.relative(this.config.path, fullPath);
            const id = rel.replace(/\.md$/, '');
            const parts = id.split(path.sep);
            const category = parts[0] ?? 'fact';
            const stat = fs.statSync(fullPath);
            const hashTags = (content.match(/#(\w+)/g) ?? []).map(t => t.slice(1));
            const fmTags = Array.isArray(data['tags']) ? data['tags'].map(String) : [];
            const tags = [...new Set([...fmTags, ...hashTags])];
            return {
                id,
                path: fullPath,
                category,
                title: String(data['title'] ?? path.basename(id)),
                content: content.trim(),
                tags,
                modified: stat.mtime,
                frontmatter: data,
            };
        }
        catch {
            return null;
        }
    }
    /** Write a memory to disk, update BM25 index, compute and cache embedding. */
    async write(options) {
        this.ensureInit();
        const category = normalizeCategory(options.category ?? this.autoCategory(options.text));
        const catDir = path.join(this.config.path, category);
        fs.mkdirSync(catDir, { recursive: true });
        const now = new Date();
        // Slug: 2024-01-01_12-00-00 — sortable and filesystem-safe
        const slug = now.toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, 19);
        const fullPath = path.join(catDir, `${slug}.md`);
        const id = `${category}/${slug}`;
        const title = options.title ?? options.text.split('\n')[0].slice(0, 80);
        const tags = options.tags ?? [];
        const fm = {
            id,
            title,
            category,
            tags,
            created: now.toISOString(),
            modified: now.toISOString(),
        };
        fs.writeFileSync(fullPath, matter.stringify(options.text, fm), 'utf-8');
        const memory = {
            id,
            path: fullPath,
            category,
            title,
            content: options.text,
            tags,
            modified: now,
            frontmatter: fm,
        };
        this.bm25.add(memory);
        // Compute embedding immediately — model lazy-loads on first write
        const embText = [title, options.text, ...tags].join(' ');
        const emb = await embed(embText);
        this.cache.set(id, emb);
        this.cache.save();
        this.updateMeta(now);
        return memory;
    }
    /** Read a single memory by id (e.g. "fact/2024-01-01_12-00-00"). */
    read(id) {
        return this.readFile(path.join(this.config.path, `${id}.md`));
    }
    /** Delete a memory from disk and in-memory indexes. */
    delete(id) {
        const fullPath = path.join(this.config.path, `${id}.md`);
        if (!fs.existsSync(fullPath))
            return false;
        fs.unlinkSync(fullPath);
        this.bm25.remove(id);
        this.cache.delete(id);
        this.cache.save();
        return true;
    }
    /** List all memories, optionally filtered by category. */
    async list(category) {
        if (!this.loaded)
            await this.load();
        const all = this.bm25.getAllMemories();
        return category ? all.filter(m => m.category === category) : all;
    }
    /** Vault statistics — no disk I/O beyond what's already loaded. */
    stats() {
        const all = this.bm25.getAllMemories();
        const categories = {};
        let lastWrite = null;
        for (const m of all) {
            categories[m.category] = (categories[m.category] ?? 0) + 1;
            if (!lastWrite || m.modified > lastWrite)
                lastWrite = m.modified;
        }
        return { total: all.length, categories, lastWrite: lastWrite?.toISOString() ?? null };
    }
    /** Hybrid BM25 + semantic search. Auto-loads if not yet loaded. */
    async search(query, options = {}) {
        if (!this.loaded)
            await this.load();
        return hybridSearch(query, this.bm25, this.cache, options);
    }
    /** Keyword heuristics for auto-categorization. */
    autoCategory(text) {
        const lower = text.toLowerCase();
        if (/decided|chose|going with|will use|switched to|we('ll| will) use/.test(lower))
            return 'decision';
        if (/learned|lesson|mistake|gotcha|remember|realized|turns out/.test(lower))
            return 'lesson';
        if (/prefer|always use|never use|like|dislike|style guide/.test(lower))
            return 'preference';
        if (/user|person|project|service|company|team|system/.test(lower))
            return 'entity';
        if (/happened|completed|shipped|released|merged|deployed/.test(lower))
            return 'event';
        return 'fact';
    }
    updateMeta(lastUpdated) {
        const metaPath = path.join(this.config.path, '.openvault', 'meta.json');
        try {
            const existing = fs.existsSync(metaPath)
                ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                : {};
            const meta = {
                name: existing.name ?? this.config.name,
                version: existing.version ?? '1',
                created: existing.created ?? lastUpdated.toISOString(),
                lastUpdated: lastUpdated.toISOString(),
                documentCount: this.bm25.size,
            };
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        }
        catch {
            // Non-critical — meta is informational only
        }
    }
}
//# sourceMappingURL=vault.js.map