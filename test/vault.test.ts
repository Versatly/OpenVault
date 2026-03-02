import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Vault } from '../src/vault.js';

function createTempVaultPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'openvault-test-'));
}

function cleanupTempVaultPath(vaultPath: string): void {
  fs.rmSync(vaultPath, { recursive: true, force: true });
}

test('vault init creates expected directory structure', () => {
  const vaultPath = createTempVaultPath();
  try {
    const vault = new Vault({ path: vaultPath });
    assert.equal(vault.isInitialized(), false);

    vault.init();

    assert.equal(vault.isInitialized(), true);
    assert.equal(fs.existsSync(path.join(vaultPath, '.openvault', 'meta.json')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'fact')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'decision')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'lesson')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'preference')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'entity')), true);
    assert.equal(fs.existsSync(path.join(vaultPath, 'event')), true);
  } finally {
    cleanupTempVaultPath(vaultPath);
  }
});

test('vault write/read/search/delete lifecycle works', async () => {
  const vaultPath = createTempVaultPath();
  try {
    const vault = new Vault({
      path: vaultPath,
      embedder: async text => new Float32Array([text.length, 1, 0]),
    });

    const memory = await vault.write({
      title: 'Deploy OpenVault via Railway',
      category: 'decision',
      tags: ['deployment', 'railway'],
      text: 'Deploy OpenVault to Railway for staging and production environments.',
    });

    const readBack = vault.read(memory.id);
    assert.ok(readBack);
    assert.equal(readBack?.title, 'Deploy OpenVault via Railway');
    assert.equal(readBack?.category, 'decision');
    assert.deepEqual(readBack?.tags.sort(), ['deployment', 'railway']);

    // Force BM25-only path for deterministic tests (no model downloads).
    fs.rmSync(path.join(vaultPath, '.openvault', 'embeddings.json'), { force: true });

    const searchVault = new Vault({ path: vaultPath });
    await searchVault.load();
    const results = await searchVault.search('railway deploy', { limit: 5 });
    assert.ok(results.length > 0);
    assert.equal(results[0]?.memory.id, memory.id);
    assert.match(results[0]?.snippet ?? '', /deploy/i);

    const deleted = vault.delete(memory.id);
    assert.equal(deleted, true);
    assert.equal(vault.read(memory.id), null);
  } finally {
    cleanupTempVaultPath(vaultPath);
  }
});
