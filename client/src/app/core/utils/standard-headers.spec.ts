import { STANDARD_HEADERS, filterHeaderSuggestions } from './standard-headers';

describe('standard-headers', () => {
  describe('filterHeaderSuggestions', () => {
    it('returns all suggestions for an empty query', () => {
      expect(filterHeaderSuggestions(STANDARD_HEADERS, '')).toEqual(STANDARD_HEADERS);
    });

    it('returns all suggestions for a whitespace-only query', () => {
      expect(filterHeaderSuggestions(STANDARD_HEADERS, '   ')).toEqual(STANDARD_HEADERS);
    });

    it('filters by case-insensitive substring match', () => {
      const result = filterHeaderSuggestions(STANDARD_HEADERS, 'con');
      expect(result).toContain('Content-Type');
      expect(result).toContain('Connection');
      expect(result).not.toContain('Authorization');
    });

    it('matches regardless of the suggestion casing', () => {
      expect(filterHeaderSuggestions(['Content-Type', 'Accept'], 'TYPE')).toEqual(['Content-Type']);
    });

    it('returns an empty list when the query exactly equals a suggestion', () => {
      expect(filterHeaderSuggestions(STANDARD_HEADERS, 'Content-Type')).toEqual([]);
      expect(filterHeaderSuggestions(STANDARD_HEADERS, 'content-type')).toEqual([]);
    });

    it('returns an empty list when nothing matches', () => {
      expect(filterHeaderSuggestions(STANDARD_HEADERS, 'zzz')).toEqual([]);
    });
  });
});
