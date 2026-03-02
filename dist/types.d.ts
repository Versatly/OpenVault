/**
 * OpenVault — Local-first agent memory types
 */
export interface VaultConfig {
    path: string;
    name: string;
}
export interface VaultMeta {
    name: string;
    version: string;
    created: string;
    lastUpdated: string;
    documentCount: number;
}
export interface Memory {
    /** Relative path without .md extension — unique ID */
    id: string;
    /** Full filesystem path */
    path: string;
    /** Category folder name */
    category: string;
    /** Human-readable title */
    title: string;
    /** Markdown body */
    content: string;
    /** Tags extracted from frontmatter and #hashtags */
    tags: string[];
    /** Last-modified timestamp */
    modified: Date;
    /** Raw frontmatter key-value pairs */
    frontmatter: Record<string, unknown>;
}
export interface SearchResult {
    memory: Memory;
    score: number;
    snippet: string;
}
export interface SearchOptions {
    limit?: number;
    category?: string;
    minScore?: number;
}
export interface WriteOptions {
    text: string;
    title?: string;
    category?: string;
    tags?: string[];
}
/**
 * Canonical categories.
 * Stored as directories: facts/, decisions/, lessons/, etc.
 */
export type Category = 'fact' | 'decision' | 'lesson' | 'preference' | 'entity' | 'event';
export declare const DEFAULT_CATEGORIES: Category[];
/** Accept singular or plural; always return singular */
export declare function normalizeCategory(raw: string): string;
