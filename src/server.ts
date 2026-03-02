/**
 * OpenVault MCP Server
 *
 * Exposes vault_search, vault_write, vault_forget, vault_status, vault_context.
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Vault, DEFAULT_VAULT_PATH } from './vault.js';

export interface CreateServerOptions {
  vaultPath?: string;
}

export interface OpenVaultServerContext {
  server: McpServer;
  vault: Vault;
  vaultPath: string;
}

function registerTools(server: McpServer, vault: Vault, vaultPath: string): void {
  server.tool(
    'vault_search',
    'Search memories using hybrid BM25 + semantic search (RRF fusion). Returns ranked results with snippets.',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max results to return (default 10)'),
      category: z
        .enum(['fact', 'decision', 'lesson', 'preference', 'entity', 'event'])
        .optional()
        .describe('Filter by category'),
    },
    async ({ query, limit, category }) => {
      const results = await vault.search(query, { limit, category });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No memories found matching that query.' }] };
      }
      const text = results
        .map(
          (r, i) =>
            `[${i + 1}] [${r.memory.category}] ${r.memory.title}\n${r.snippet}\n` +
            `id: ${r.memory.id} | score: ${r.score.toFixed(4)}`,
        )
        .join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'vault_write',
    'Store a new memory. Category is auto-detected from content if not specified.',
    {
      text: z.string().min(1).describe('Memory content to store'),
      title: z.string().optional().describe('Optional title (auto-derived from first line if omitted)'),
      category: z
        .enum(['fact', 'decision', 'lesson', 'preference', 'entity', 'event'])
        .optional()
        .describe('Category — auto-detected if omitted'),
      tags: z.array(z.string()).optional().describe('Optional tags for retrieval'),
    },
    async ({ text, title, category, tags }) => {
      const memory = await vault.write({ text, title, category, tags });
      return {
        content: [
          {
            type: 'text',
            text: `Memory stored.\nid: ${memory.id}\ncategory: ${memory.category}\ntitle: ${memory.title}`,
          },
        ],
      };
    },
  );

  server.tool(
    'vault_forget',
    'Delete a memory by finding it via search. First call with confirm=false to preview, then confirm=true to delete.',
    {
      query: z.string().describe('Search query to identify the memory to delete'),
      confirm: z
        .boolean()
        .describe('false = preview only (safe), true = actually delete the memory'),
    },
    async ({ query, confirm }) => {
      const results = await vault.search(query, { limit: 1 });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No memory found matching that query.' }] };
      }
      const top = results[0].memory;
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Found memory to delete:\n` +
                `id: ${top.id}\ncategory: ${top.category}\ntitle: ${top.title}\n\n` +
                `Call vault_forget again with confirm: true to permanently delete it.`,
            },
          ],
        };
      }
      const deleted = vault.delete(top.id);
      return {
        content: [
          {
            type: 'text',
            text: deleted ? `Deleted: ${top.id}` : `Failed to delete: ${top.id} (file not found)`,
          },
        ],
      };
    },
  );

  server.tool(
    'vault_status',
    'Return vault statistics: total memory count, per-category breakdown, last write time.',
    {},
    async () => {
      const stats = vault.stats();
      const breakdown =
        Object.keys(stats.categories).length > 0
          ? Object.entries(stats.categories)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => `  ${cat}: ${count}`)
              .join('\n')
          : '  (empty)';
      const text = [
        `Vault: ${vaultPath}`,
        `Total memories: ${stats.total}`,
        `Categories:\n${breakdown}`,
        `Last write: ${stats.lastWrite ?? 'never'}`,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'vault_context',
    'Return relevant memories for the current project or working directory. Call this at the start of a session.',
    {
      cwd: z.string().optional().describe('Current working directory (absolute path)'),
      projectName: z.string().optional().describe('Project or repository name'),
    },
    async ({ cwd, projectName }) => {
      const parts: string[] = [];
      if (projectName) parts.push(projectName);
      if (cwd) {
        const basename = path.basename(cwd);
        if (basename && basename !== projectName) parts.push(basename);
      }

      if (parts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Provide cwd or projectName to surface relevant context.',
            },
          ],
        };
      }

      const query = parts.join(' ');
      const results = await vault.search(query, { limit: 10 });

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No relevant context found for: ${query}` }],
        };
      }

      const text =
        `Context for "${query}":\n\n` +
        results
          .map(
            (r, i) =>
              `[${i + 1}] [${r.memory.category}] ${r.memory.title}\n${r.snippet}`,
          )
          .join('\n\n');

      return { content: [{ type: 'text', text }] };
    },
  );
}

export async function createServer(options: CreateServerOptions = {}): Promise<OpenVaultServerContext> {
  const vaultPath = options.vaultPath ?? process.env['OPENVAULT_PATH'] ?? DEFAULT_VAULT_PATH;
  const vault = new Vault({ path: vaultPath });

  // Load vault index on startup. Errors are non-fatal — tools will auto-init.
  await vault.load().catch(err => {
    process.stderr.write(`[openvault] load warning: ${(err as Error).message}\n`);
  });

  const server = new McpServer({
    name: 'openvault',
    version: '0.1.0',
  });

  registerTools(server, vault, vaultPath);
  return { server, vault, vaultPath };
}

export async function startStdioServer(options: CreateServerOptions = {}): Promise<OpenVaultServerContext> {
  const context = await createServer(options);
  const transport = new StdioServerTransport();
  await context.server.connect(transport);
  return context;
}

function isMainModule(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  await startStdioServer();
}
