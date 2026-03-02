import test from 'node:test';
import assert from 'node:assert/strict';
import { BM25Engine } from '../src/search.js';
import type { Memory } from '../src/types.js';

function createMemory(id: string, title: string, content: string, category = 'fact'): Memory {
  return {
    id,
    path: `/tmp/${id}.md`,
    category,
    title,
    content,
    tags: [],
    modified: new Date('2026-01-01T00:00:00.000Z'),
    frontmatter: {},
  };
}

test('BM25 tokenizer ignores punctuation and stop words', () => {
  const engine = new BM25Engine();
  engine.add(
    createMemory(
      'fact/token-rotation',
      'Token Rotation Policy',
      'Rotate API tokens every week for all production services.',
    ),
  );

  const relevant = engine.search('the token, and rotation!');
  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.id, 'fact/token-rotation');

  const stopWordOnly = engine.search('the and to is');
  assert.equal(stopWordOnly.length, 0);
});

test('BM25 scoring prefers documents with stronger term frequency', () => {
  const engine = new BM25Engine();
  engine.add(
    createMemory(
      'fact/high-signal',
      'Postgres tuning notes',
      'postgres postgres postgres replication tuning baseline',
    ),
  );
  engine.add(
    createMemory(
      'fact/low-signal',
      'Postgres mention',
      'postgres migration checklist',
    ),
  );

  const results = engine.search('postgres', { limit: 2 });
  assert.equal(results.length, 2);
  assert.equal(results[0]?.id, 'fact/high-signal');
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
});
