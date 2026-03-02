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
import { Vault, DEFAULT_VAULT_PATH } from './vault.js';
const program = new Command();
program
    .name('openvault')
    .description('Local-first AI agent memory via MCP')
    .version('0.1.0');
// ─── init ─────────────────────────────────────────────────────────────────────
program
    .command('init')
    .description('Initialize vault directory structure')
    .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
    .action((opts) => {
    const vault = new Vault({ path: opts.path });
    vault.init();
    console.log(`Vault initialized at: ${opts.path}`);
    console.log('Categories: fact, decision, lesson, preference, entity, event');
});
// ─── serve ────────────────────────────────────────────────────────────────────
program
    .command('serve')
    .description('Start MCP server (stdio transport)')
    .action(async () => {
    // Delegate entirely to server.ts — it owns the process from here
    await import('./server.js');
});
// ─── search ───────────────────────────────────────────────────────────────────
program
    .command('search <query>')
    .description('Search vault memories')
    .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
    .option('-l, --limit <n>', 'Max results', '10')
    .option('-c, --category <cat>', 'Filter by category')
    .action(async (query, opts) => {
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
    .action(async (text, opts) => {
    const vault = new Vault({ path: opts.path });
    const tags = opts.tags
        ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean)
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
});
// ─── status ───────────────────────────────────────────────────────────────────
program
    .command('status')
    .description('Show vault statistics')
    .option('-p, --path <path>', 'Vault path', DEFAULT_VAULT_PATH)
    .action(async (opts) => {
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
//# sourceMappingURL=cli.js.map