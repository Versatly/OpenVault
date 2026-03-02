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
import type { Memory, SearchOptions, SearchResult } from './types.js';
import { EmbeddingCache } from './embeddings.js';
/**
 * In-memory BM25 engine.
 * k1 = 1.5, b = 0.75 — standard defaults.
 */
export declare class BM25Engine {
    private readonly k1;
    private readonly b;
    private docs;
    private df;
    add(memory: Memory): void;
    remove(id: string): void;
    clear(): void;
    search(query: string, options?: SearchOptions): Array<{
        id: string;
        score: number;
    }>;
    getMemory(id: string): Memory | undefined;
    getAllMemories(): Memory[];
    get size(): number;
}
/** Find the most relevant line in content given query terms. */
export declare function extractSnippet(content: string, query: string, maxLen?: number): string;
/**
 * Hybrid BM25 + semantic search via Reciprocal Rank Fusion (k=60).
 *
 * Falls back to BM25-only when embeddings are not yet cached
 * (first run before any semantic data exists).
 */
export declare function hybridSearch(query: string, bm25: BM25Engine, cache: EmbeddingCache, options?: SearchOptions): Promise<SearchResult[]>;
