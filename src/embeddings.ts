/**
 * OpenVault Embeddings — Local inference via @huggingface/transformers
 *
 * Uses all-MiniLM-L6-v2 (384-dim). First use downloads the model (~23 MB).
 * Subsequent uses are fast — loaded once per process.
 *
 * Sourced / adapted from ClawVault hybrid-search.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null;
let pipelineLoading: Promise<unknown> | null = null;

async function getPipeline() {
  if (pipeline) return pipeline;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    });
    return pipeline;
  })();

  return pipelineLoading;
}

/** Compute a normalized embedding for one text string. Lazy-loads the model. */
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (pipe as any)(text, { pooling: 'mean', normalize: true });
  return new Float32Array(result.data);
}

/** Cosine similarity between two unit-normalized vectors (dot product). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Disk-backed embedding cache.
 * Stored at <vaultPath>/.openvault/embeddings.json as a plain JSON object.
 * Keys are memory IDs; values are embedding arrays.
 */
export class EmbeddingCache {
  private readonly filePath: string;
  private cache = new Map<string, Float32Array>();
  private dirty = false;

  constructor(vaultPath: string) {
    this.filePath = path.join(vaultPath, '.openvault', 'embeddings.json');
  }

  load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, number[]>;
      for (const [key, arr] of Object.entries(raw)) {
        this.cache.set(key, new Float32Array(arr));
      }
    } catch {
      // Fresh cache on parse error
    }
  }

  save(): void {
    if (!this.dirty) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out: Record<string, number[]> = {};
    for (const [key, arr] of this.cache) out[key] = Array.from(arr);
    fs.writeFileSync(this.filePath, JSON.stringify(out));
    this.dirty = false;
  }

  get(id: string): Float32Array | undefined { return this.cache.get(id); }
  has(id: string): boolean { return this.cache.has(id); }
  delete(id: string): void { this.cache.delete(id); this.dirty = true; }

  set(id: string, embedding: Float32Array): void {
    this.cache.set(id, embedding);
    this.dirty = true;
  }

  entries(): IterableIterator<[string, Float32Array]> { return this.cache.entries(); }
  get size(): number { return this.cache.size; }
}

/**
 * Run semantic search against an embedding cache.
 * Returns results sorted by cosine similarity (highest first).
 */
export async function semanticSearch(
  query: string,
  cache: EmbeddingCache,
  topK = 20,
): Promise<Array<{ id: string; score: number }>> {
  if (cache.size === 0) return [];
  const queryEmb = await embed(query);
  const results: Array<{ id: string; score: number }> = [];
  for (const [id, docEmb] of cache.entries()) {
    results.push({ id, score: cosineSimilarity(queryEmb, docEmb) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Reciprocal Rank Fusion of two ranked result lists.
 * k=60 is the classic parameter from the original RRF paper.
 */
export function reciprocalRankFusion(
  list1: Array<{ id: string; score: number }>,
  list2: Array<{ id: string; score: number }>,
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (let rank = 0; rank < list1.length; rank++) {
    const { id } = list1[rank];
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }
  for (let rank = 0; rank < list2.length; rank++) {
    const { id } = list2[rank];
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
