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
import type { Memory, VaultConfig, WriteOptions, SearchOptions, SearchResult } from './types.js';
export declare const DEFAULT_VAULT_PATH: string;
export declare class Vault {
    readonly config: VaultConfig;
    private bm25;
    private cache;
    private loaded;
    constructor(config?: Partial<VaultConfig>);
    /** Create vault directory structure and meta.json. Safe to call multiple times. */
    init(): void;
    isInitialized(): boolean;
    private ensureInit;
    /**
     * Load all memories from disk into BM25 index.
     * Loads cached embeddings but does NOT compute new ones (fast startup).
     * Embeddings are computed lazily in write().
     */
    load(): Promise<void>;
    private readFile;
    /** Write a memory to disk, update BM25 index, compute and cache embedding. */
    write(options: WriteOptions): Promise<Memory>;
    /** Read a single memory by id (e.g. "fact/2024-01-01_12-00-00"). */
    read(id: string): Memory | null;
    /** Delete a memory from disk and in-memory indexes. */
    delete(id: string): boolean;
    /** List all memories, optionally filtered by category. */
    list(category?: string): Promise<Memory[]>;
    /** Vault statistics — no disk I/O beyond what's already loaded. */
    stats(): {
        total: number;
        categories: Record<string, number>;
        lastWrite: string | null;
    };
    /** Hybrid BM25 + semantic search. Auto-loads if not yet loaded. */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /** Keyword heuristics for auto-categorization. */
    private autoCategory;
    private updateMeta;
}
