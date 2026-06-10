import { buildUrl, composeUrl, parseQuery, reconcileParamsFromQuery } from './url-query.util';
import { KvEntry } from '../models/active-request.model';

function kv(key: string, value: string, enabled = true): KvEntry {
  return { id: `${key}-${value}`, key, value, enabled };
}

describe('url-query.util', () => {
  describe('parseQuery', () => {
    it('splits base and pairs on the first ?', () => {
      const r = parseQuery('https://api.x/users?page=2&limit=10');
      expect(r.base).toBe('https://api.x/users');
      expect(r.pairs).toEqual([
        { key: 'page', value: '2' },
        { key: 'limit', value: '10' },
      ]);
      expect(r.fragment).toBe('');
    });

    it('returns no pairs when there is no query', () => {
      expect(parseQuery('https://api.x/users')).toEqual({
        base: 'https://api.x/users',
        fragment: '',
        pairs: [],
      });
    });

    it('keeps {{tokens}} untouched in base and value', () => {
      const r = parseQuery('{{baseUrl}}/users?filter={{f}}');
      expect(r.base).toBe('{{baseUrl}}/users');
      expect(r.pairs).toEqual([{ key: 'filter', value: '{{f}}' }]);
    });

    it('preserves duplicate keys in order', () => {
      expect(parseQuery('x?a=1&a=2').pairs).toEqual([
        { key: 'a', value: '1' },
        { key: 'a', value: '2' },
      ]);
    });

    it('tolerates trailing ? & and empty values', () => {
      expect(parseQuery('x?').pairs).toEqual([]);
      expect(parseQuery('x?a=1&').pairs).toEqual([{ key: 'a', value: '1' }]);
      expect(parseQuery('x?flag').pairs).toEqual([{ key: 'flag', value: '' }]);
    });

    it('keeps = inside values (split on first = only)', () => {
      expect(parseQuery('x?eq=a=b').pairs).toEqual([{ key: 'eq', value: 'a=b' }]);
    });

    it('detaches the hash fragment from the query', () => {
      const r = parseQuery('https://api.x/u?a=1#section');
      expect(r.base).toBe('https://api.x/u');
      expect(r.pairs).toEqual([{ key: 'a', value: '1' }]);
      expect(r.fragment).toBe('#section');
    });
  });

  describe('buildUrl', () => {
    it('appends enabled, non-empty params', () => {
      expect(buildUrl('https://api.x/u', '', [kv('a', '1'), kv('b', '2')])).toBe(
        'https://api.x/u?a=1&b=2'
      );
    });

    it('excludes disabled and empty-key rows', () => {
      const params = [kv('a', '1'), kv('b', '2', false), kv('', '')];
      expect(buildUrl('https://api.x/u', '', params)).toBe('https://api.x/u?a=1');
    });

    it('returns base + fragment when no enabled params', () => {
      expect(buildUrl('https://api.x/u', '#top', [kv('', '')])).toBe('https://api.x/u#top');
    });

    it('reattaches the fragment after the query', () => {
      expect(buildUrl('https://api.x/u', '#top', [kv('a', '1')])).toBe('https://api.x/u?a=1#top');
    });
  });

  describe('composeUrl (dedupe-aware)', () => {
    it('does not double a param already in the URL query (synced mirror)', () => {
      expect(composeUrl('https://api.x/u?a=1', [kv('a', '1')])).toBe('https://api.x/u?a=1');
    });

    it('preserves a URL-only query when params are empty (legacy)', () => {
      expect(composeUrl('https://api.x/u?a=1', [])).toBe('https://api.x/u?a=1');
    });

    it('appends params when the URL has no query (legacy params-only)', () => {
      expect(composeUrl('https://api.x/u', [kv('a', '1')])).toBe('https://api.x/u?a=1');
    });

    it('appends params with a different value than the URL query', () => {
      expect(composeUrl('https://api.x/u?a=1', [kv('a', '2')])).toBe('https://api.x/u?a=1&a=2');
    });

    it('dedupes duplicate keys by exact pair', () => {
      expect(composeUrl('x?a=1&a=2', [kv('a', '1'), kv('a', '2')])).toBe('x?a=1&a=2');
    });
  });

  describe('reconcileParamsFromQuery', () => {
    it('reuses the existing row id positionally', () => {
      const current = [kv('a', '1'), { id: 'blank', key: '', value: '', enabled: true }];
      const out = reconcileParamsFromQuery(current, [{ key: 'a', value: '2' }]);
      expect(out[0]).toEqual(jasmine.objectContaining({ id: 'a-1', key: 'a', value: '2', enabled: true }));
      // trailing blank row reuses the prior blank id
      expect(out[out.length - 1]).toEqual({ id: 'blank', key: '', value: '', enabled: true });
    });

    it('preserves disabled rows in place', () => {
      const current = [kv('a', '1'), kv('b', '2', false)];
      const out = reconcileParamsFromQuery(current, [{ key: 'a', value: '1' }]);
      expect(out.some((r) => r.key === 'b' && !r.enabled)).toBeTrue();
    });

    it('creates new rows for surplus query pairs', () => {
      const out = reconcileParamsFromQuery([], [{ key: 'x', value: '9' }]);
      expect(out[0]).toEqual(jasmine.objectContaining({ key: 'x', value: '9', enabled: true }));
    });

    it('drops enabled content rows removed from the URL', () => {
      const current = [kv('a', '1'), kv('b', '2')];
      const out = reconcileParamsFromQuery(current, [{ key: 'a', value: '1' }]);
      expect(out.filter((r) => r.key.trim()).length).toBe(1);
      expect(out[0].key).toBe('a');
    });
  });
});
