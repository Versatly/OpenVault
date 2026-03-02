/**
 * OpenVault Search — Pure BM25 + Hybrid (BM25 + Semantic) via RRF
 *
 * BM25 runs in-process on the indexed Memory objects.
 * Hybrid adds semantic embeddings (lazy-loaded) fused with RRF.
 *
 * Proven architecture from ClawVault LongMemEval benchmarks:
 *   BM25-only:  52.6% overall
 *   Hybrid RRF: 57.0% overall, 45.9% multi-session, 85.7% single-session
 */
import { semanticSearch, reciprocalRankFusion, } from './embeddings.js';
// ─── Tokenizer ────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
    'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
    'were', 'what', 'when', 'where', 'who', 'why', 'with', 'you', 'your',
]);
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}
function getText(memory) {
    return [memory.title, memory.content, ...memory.tags].join(' ');
}
// ─── BM25 Engine ──────────────────────────────────────────────────────────────
/**
 * In-memory BM25 engine.
 * k1 = 1.5, b = 0.75 — standard defaults.
 */
export class BM25Engine {
    k1 = 1.5;
    b = 0.75;
    docs = new Map();
    df = new Map(); // term → doc frequency
    add(memory) {
        if (this.docs.has(memory.id))
            this.remove(memory.id);
        const tokens = tokenize(getText(memory));
        this.docs.set(memory.id, { tokens, memory });
        for (const term of new Set(tokens)) {
            this.df.set(term, (this.df.get(term) ?? 0) + 1);
        }
    }
    remove(id) {
        const doc = this.docs.get(id);
        if (!doc)
            return;
        for (const term of new Set(doc.tokens)) {
            const count = this.df.get(term) ?? 0;
            if (count <= 1)
                this.df.delete(term);
            else
                this.df.set(term, count - 1);
        }
        this.docs.delete(id);
    }
    clear() {
        this.docs.clear();
        this.df.clear();
    }
    search(query, options = {}) {
        const { category } = options;
        const limit = options.limit ?? 10;
        const queryTerms = tokenize(query);
        if (queryTerms.length === 0 || this.docs.size === 0)
            return [];
        const N = this.docs.size;
        let totalLen = 0;
        for (const { tokens } of this.docs.values())
            totalLen += tokens.length;
        const avgdl = totalLen / N;
        const scores = [];
        for (const [id, { tokens, memory }] of this.docs) {
            if (category && memory.category !== category)
                continue;
            const tf = new Map();
            for (const t of tokens)
                tf.set(t, (tf.get(t) ?? 0) + 1);
            let score = 0;
            for (const term of queryTerms) {
                const f = tf.get(term) ?? 0;
                if (f === 0)
                    continue;
                const df = this.df.get(term) ?? 0;
                const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
                const tfNorm = (f * (this.k1 + 1)) /
                    (f + this.k1 * (1 - this.b + (this.b * tokens.length) / avgdl));
                score += idf * tfNorm;
            }
            if (score > 0)
                scores.push({ id, score });
        }
        return scores.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    getMemory(id) {
        return this.docs.get(id)?.memory;
    }
    getAllMemories() {
        return [...this.docs.values()].map(d => d.memory);
    }
    get size() { return this.docs.size; }
}
// ─── Snippet extraction ───────────────────────────────────────────────────────
/** Find the most relevant line in content given query terms. */
export function extractSnippet(content, query, maxLen = 220) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lines = content.split('\n').filter(l => l.trim());
    let best = '';
    let bestScore = -1;
    for (const line of lines) {
        const lower = line.toLowerCase();
        const score = terms.filter(t => lower.includes(t)).length;
        if (score > bestScore) {
            bestScore = score;
            best = line;
        }
    }
    return (best || content).trim().slice(0, maxLen);
}
// ─── Hybrid search ────────────────────────────────────────────────────────────
/**
 * Hybrid BM25 + semantic search via Reciprocal Rank Fusion (k=60).
 *
 * Falls back to BM25-only when embeddings are not yet cached
 * (first run before any semantic data exists).
 */
export async function hybridSearch(query, bm25, cache, options = {}) {
    const limit = options.limit ?? 10;
    const category = options.category;
    // BM25 — fetch extra candidates for fusion
    const bm25Raw = bm25.search(query, { ...options, limit: limit * 3 });
    // Semantic — may be empty on first run (no embeddings yet)
    const semanticRaw = await semanticSearch(query, cache, limit * 3);
    // Filter semantic results by category
    const filteredSemantic = category
        ? semanticRaw.filter(r => {
            const mem = bm25.getMemory(r.id);
            return mem ? mem.category === category : true;
        })
        : semanticRaw;
    // RRF fusion
    const fused = reciprocalRankFusion(bm25Raw, filteredSemantic);
    const top = fused.slice(0, limit);
    const results = [];
    for (const { id, score } of top) {
        const memory = bm25.getMemory(id);
        if (!memory)
            continue;
        results.push({
            memory,
            score,
            snippet: extractSnippet(memory.content, query),
        });
    }
    // If RRF produced nothing (empty semantic cache), fall back to pure BM25
    if (results.length === 0 && bm25Raw.length > 0) {
        for (const { id, score } of bm25Raw.slice(0, limit)) {
            const memory = bm25.getMemory(id);
            if (!memory)
                continue;
            results.push({ memory, score, snippet: extractSnippet(memory.content, query) });
        }
    }
    return results;
}
//# sourceMappingURL=search.js.map