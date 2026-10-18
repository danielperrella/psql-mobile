import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoritesStore, createLocalFavoritesApi, favoriteId, normalizeFavorite} from './favorites.js';

function memoryApi() {
  const byContext = new Map();
  return async (path, payload) => {
    const rows = byContext.get(payload.context) || [];
    if (path === '/favorites/list') return rows.map(row => structuredClone(row));
    if (path === '/favorites/save') {
      const id = favoriteId(payload.favorite);
      const next = [...rows.filter(row => favoriteId(row) !== id), structuredClone(payload.favorite)];
      byContext.set(payload.context, next);
      return structuredClone(payload.favorite);
    }
    if (path === '/favorites/remove') {
      byContext.set(payload.context, rows.filter(row => favoriteId(row) !== payload.id));
      return {ok: true};
    }
    throw new Error('Unexpected API path');
  };
}

test('favorites persist by profile and demo context independently', async () => {
  const api = memoryApi();
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  const one = createFavoritesStore(api);
  await one.addTable(first, 'public', 'ordini');
  await one.addTable(second, 'public', 'clienti');
  await one.addTable('demo', 'public', 'ordini');

  const reopened = createFavoritesStore(api);
  assert.deepEqual((await reopened.list(first)).map(item => item.table), ['ordini']);
  assert.deepEqual((await reopened.list(second)).map(item => item.table), ['clienti']);
  assert.deepEqual((await reopened.list('demo')).map(item => item.table), ['ordini']);
});

test('record IDs preserve exact composite keys and bigint strings', async () => {
  const api = memoryApi(), store = createFavoritesStore(api), context = 'c'.repeat(64);
  const keys = [{column: 'tenant_id', value: '900719925474099312345'}, {column: 'row_id', value: '00000000000000000042'}];
  const saved = await store.addRecord(context, 'public', 'ordini', keys);
  assert.deepEqual(saved.keys, [{column: 'row_id', value: '00000000000000000042'}, {column: 'tenant_id', value: '900719925474099312345'}]);
  assert.equal((await store.list(context))[0].id, favoriteId({kind: 'record', schema: 'public', table: 'ordini', keys}));
  assert.equal(favoriteId({kind: 'record', schema: 'public', table: 'ordini', keys}),
    favoriteId({kind: 'record', schema: 'public', table: 'ordini', keys: [...keys].reverse()}));
  assert.notEqual(favoriteId({kind: 'record', schema: 'public', table: 'ordini', keys}),
    favoriteId({kind: 'record', schema: 'public', table: 'ordini', keys: [{...keys[0], value: '900719925474099312346'}, keys[1]]}));
});

test('local adapter persists independently by profile and demo context', async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  const api = createLocalFavoritesApi(storage), first = 'f'.repeat(64), second = 'e'.repeat(64);
  const store = createFavoritesStore(api);
  await store.addTable(first, 'public', 'ordini');
  await store.addTable(second, 'public', 'clienti');
  await store.addRecord('demo', 'public', 'ordini', [{column: 'id', value: '0007'}]);
  const reopened = createFavoritesStore(createLocalFavoritesApi(storage));
  assert.deepEqual((await reopened.list(first)).map(item => item.table), ['ordini']);
  assert.deepEqual((await reopened.list(second)).map(item => item.table), ['clienti']);
  assert.deepEqual((await reopened.list('demo')).map(item => item.keys[0].value), ['0007']);
  await reopened.removeRecord('demo', 'public', 'ordini', [{column: 'id', value: '0007'}]);
  assert.deepEqual(await reopened.list('demo'), []);
});

test('normalization rejects incomplete keys and malformed identifiers', async () => {
  assert.throws(() => normalizeFavorite({kind: 'record', schema: 'public', table: 'items', keys: []}));
  assert.throws(() => normalizeFavorite({kind: 'record', schema: 'public', table: 'items', keys: [
    {column: 'id', value: '1'}, {column: 'id', value: '2'},
  ]}));
  await assert.rejects(createFavoritesStore(async () => []).list('not-a-profile'), /Contesto preferiti non valido/);
});

test('adapter errors remain rejected for async UI handling', async () => {
  const store = createFavoritesStore(async () => { throw new Error('Storage offline'); });
  await assert.rejects(store.list('demo'), /Storage offline/);
});
