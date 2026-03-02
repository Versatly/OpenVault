#!/usr/bin/env node
/**
 * OpenVault CLI
 *
 * Usage:
 *   openvault init               Initialize vault
 *   openvault serve              Start MCP stdio server
 *   openvault search <query>     Search memories
 *   openvault write <text>       Write a memory
 *   openvault status             Show vault stats
 */

import { Command } from 'commander';
import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Vault, DEFAULT_VAULT_PATH } from './vault.js';
import { createServer as createOpenVaultServer } from './server.js';

const program = new Command();

function parsePort(value: string): number {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}. Expected an integer between 1 and 65535.`);
  }
  return parsed;
}

program
  .name('openvault')
  .description('Local-first AI agent memory via MCP')
  .version('0.1.0');

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize vault directory structure')
  .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
  .action((opts: { path: string }) => {
    const vault = new Vault({ path: opts.path });
    vault.init();
    console.log(`Vault initialized at: ${opts.path}`);
    console.log('Categories: fact, decision, lesson, preference, entity, event');
  });

// ─── serve ────────────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Start MCP server (stdio by default, streamable HTTP with --http)')
  .option('--http', 'Use streamable HTTP transport on /mcp')
  .option('--port <port>', 'HTTP port (used with --http)', '3333')
  .action(async (opts: { http?: boolean; port: string }) => {
    const { server } = await createOpenVaultServer();
    if (!opts.http) {
      await server.connect(new StdioServerTransport());
      return;
    }

    const port = parsePort(opts.port);
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode keeps deployment simple for local tool clients.
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);

    const httpServer = createHttpServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`);

      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      await transport.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '0.0.0.0', () => resolve());
    });

    process.stderr.write(`[openvault] streamable HTTP listening on http://127.0.0.1:${port}/mcp\n`);
  });

// ─── search ───────────────────────────────────────────────────────────────────

program
  .command('search <query>')
  .description('Search vault memories')
  .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
  .option('-l, --limit <n>', 'Max results', '10')
  .option('-c, --category <cat>', 'Filter by category')
  .action(async (query: string, opts: { path: string; limit: string; category?: string }) => {
    const vault = new Vault({ path: opts.path });
    await vault.load();
    const results = await vault.search(query, {
      limit: parseInt(opts.limit, 10),
      category: opts.category,
    });
    if (results.length === 0) {
      console.log('No results found.');
      return;
    }
    for (const r of results) {
      console.log(`\n[${r.memory.category}] ${r.memory.title}`);
      console.log(r.snippet);
      console.log(`id: ${r.memory.id}  score: ${r.score.toFixed(4)}`);
    }
  });

// ─── write ────────────────────────────────────────────────────────────────────

program
  .command('write <text>')
  .description('Write a memory to vault')
  .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
  .option('-c, --category <cat>', 'Category: fact, decision, lesson, preference, entity, event')
  .option('-t, --title <title>', 'Memory title')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(
    async (
      text: string,
      opts: { path: string; category?: string; title?: string; tags?: string },
    ) => {
      const vault = new Vault({ path: opts.path });
      const tags = opts.tags
        ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : undefined;
      const memory = await vault.write({
        text,
        title: opts.title,
        category: opts.category,
        tags,
      });
      console.log(`Written: ${memory.id}`);
      console.log(`Category: ${memory.category}`);
      console.log(`Title: ${memory.title}`);
    },
  );

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show vault statistics')
  .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
  .action(async (opts: { path: string }) => {
    const vault = new Vault({ path: opts.path });
    if (!vault.isInitialized()) {
      console.log(`No vault found at: ${opts.path}`);
      console.log('Run: openvault init');
      process.exit(1);
    }
    await vault.load();
    const stats = vault.stats();
    console.log(`Vault: ${opts.path}`);
    console.log(`Total memories: ${stats.total}`);
    if (Object.keys(stats.categories).length > 0) {
      console.log('Categories:');
      for (const [cat, count] of Object.entries(stats.categories).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${cat}: ${count}`);
      }
    }
    console.log(`Last write: ${stats.lastWrite ?? 'never'}`);
  });

program.parse();
