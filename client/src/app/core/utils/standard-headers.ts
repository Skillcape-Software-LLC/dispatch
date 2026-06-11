/**
 * Common HTTP request header names in canonical casing, alphabetically sorted.
 * Used to power key-field autocomplete on the Headers panel. Advisory only —
 * users may still type any custom header name.
 */
export const STANDARD_HEADERS: string[] = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Date',
  'ETag',
  'Expect',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Origin',
  'Pragma',
  'Range',
  'Referer',
  'TE',
  'Upgrade',
  'User-Agent',
  'Via',
  'Warning',
  'X-API-Key',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Requested-With',
];

/**
 * Filters header-name suggestions for the given query (case-insensitive substring match).
 * Returns an empty list when the query already exactly equals a suggestion, so the
 * dropdown hides once the field holds a complete header name.
 */
export function filterHeaderSuggestions(suggestions: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (suggestions.some((s) => s.toLowerCase() === q)) return [];
  if (!q) return [...suggestions];
  return suggestions.filter((s) => s.toLowerCase().includes(q));
}
