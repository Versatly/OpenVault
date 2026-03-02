/**
 * OpenVault — Local-first agent memory types
 */
export const DEFAULT_CATEGORIES = [
    'fact',
    'decision',
    'lesson',
    'preference',
    'entity',
    'event',
];
/** Accept singular or plural; always return singular */
export function normalizeCategory(raw) {
    const lower = raw.trim().toLowerCase();
    // Strip trailing 's' for known plurals
    const pluralMap = {
        facts: 'fact',
        decisions: 'decision',
        lessons: 'lesson',
        preferences: 'preference',
        entities: 'entity',
        events: 'event',
    };
    return pluralMap[lower] ?? lower;
}
//# sourceMappingURL=types.js.map