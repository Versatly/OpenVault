/**
 * OpenVault Embeddings — Local inference via @huggingface/transformers
 *
 * Uses all-MiniLM-L6-v2 (384-dim). First use downloads the model (~23 MB).
 * Subsequent uses are fast — loaded once per process.
 *
 * Sourced / adapted from ClawVault hybrid-search.ts.
 */
/** Compute a normalized embedding for one text string. Lazy-loads the model. */
export declare function embed(text: string): Promise<Float32Array>;
/** Cosine similarity between two unit-normalized vectors (dot product). */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * Disk-backed embedding cache.
 * Stored at <vaultPath>/.openvault/embeddings.json as a plain JSON object.
 * Keys are memory IDs; values are embedding arrays.
 */
export declare class EmbeddingCache {
    private readonly filePath;
    private cache;
    private dirty;
    constructor(vaultPath: string);
    load(): void;
    save(): void;
    get(id: string): Float32Array | undefined;
    has(id: string): boolean;
    delete(id: string): void;
    set(id: string, embedding: Float32Array): void;
    entries(): IterableIterator<[string, Float32Array]>;
    get size(): number;
}
/**
 * Run semantic search against an embedding cache.
 * Returns results sorted by cosine similarity (highest first).
 */
export declare function semanticSearch(query: string, cache: EmbeddingCache, topK?: number): Promise<Array<{
    id: string;
    score: number;
}>>;
/**
 * Reciprocal Rank Fusion of two ranked result lists.
 * k=60 is the classic parameter from the original RRF paper.
 */
export declare function reciprocalRankFusion(list1: Array<{
    id: string;
    score: number;
}>, list2: Array<{
    id: string;
    score: number;
}>, k?: number): Array<{
    id: string;
    score: number;
}>;
