const MAX_FAVORITES = 500;
const MAX_KEYS = 16;
const MAX_TEXT = 512;
const MAX_KEY_VALUE = 4096;
const MAX_ENTRY_BYTES = 64 * 1024;
const MAX_CONTEXT_BYTES = 2 * 1024 * 1024;
const LOCAL_KEY_PREFIX = 'psql-mobile:favorites:v1:';

const fail = message => { throw new TypeError(message); };

function requiredText(value, label, limit = MAX_TEXT) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) {
    fail(`${label} non valido.`);
  }
  return value;
}

/** Favorite storage contexts are the literal "demo" or a saved Android profile ID. */
export function validateFavoriteContext(context) {
  if (context === 'demo' || (typeof context === 'string' && /^[a-f0-9]{64}$/.test(context))) return context;
  fail('Contesto preferiti non valido.');
}

function normalizeKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS) fail('Chiave primaria non valida.');
  const seen = new Set();
  return keys.map(key => {
    if (!key || typeof key !== 'object' || Array.isArray(key)) fail('Colonna della chiave primaria non valida.');
    const column = requiredText(key.column, 'Colonna della chiave primaria');
    if (seen.has(column)) fail('La chiave primaria contiene colonne duplicate.');
    seen.add(column);
    // All driver values arrive as strings; keeping them strings preserves bigint/numeric precision.
    if (typeof key.value !== 'string' || key.value.length > MAX_KEY_VALUE || key.value.includes('\0')) {
      fail('Valore della chiave primaria non valido.');
    }
    return {column, value: key.value};
  }).sort((left, right) => left.column < right.column ? -1 : left.column > right.column ? 1 : 0);
}

export function normalizeFavorite(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Preferito non valido.');
  const schema = requiredText(input.schema, 'Schema');
  const table = requiredText(input.table, 'Tabella');
  if (input.kind === 'table') return {kind: 'table', schema, table};
  if (input.kind === 'record') return {kind: 'record', schema, table, keys: normalizeKeys(input.keys)};
  fail('Tipo di preferito non valido.');
}

function canonical(favorite) {
  return JSON.stringify(favorite.kind === 'table'
    ? ['table', favorite.schema, favorite.table]
    : ['record', favorite.schema, favorite.table, favorite.keys.map(({column, value}) => [column, value])]);
}

/** Stable, collision-safe identity over schema/table and every PK column/value. */
export function favoriteId(input) {
  const favorite = normalizeFavorite(input);
  // JSON tuple serialization avoids delimiter collisions and numeric coercion.
  return canonical(favorite);
}

function validateEntrySize(favorite) {
  if (new TextEncoder().encode(JSON.stringify(favorite)).length > MAX_ENTRY_BYTES) fail('Preferito troppo grande.');
  return favorite;
}

/**
 * API adapter contract: api(path, payload) -> Promise<JSON data>.
 * list returns an array; save accepts {context, favorite} and returns the saved favorite;
 * remove accepts {context, id} and returns {ok:true}. The native bridge should encrypt
 * this metadata with Android Keystore and key its records by context.
 */
export function createFavoritesStore(api) {
  if (typeof api !== 'function') throw new TypeError('È necessario un adapter asincrono per i preferiti.');
  return {
    async list(context) {
      validateFavoriteContext(context);
      const items = await api('/favorites/list', {context});
      if (!Array.isArray(items)) throw new Error('Risposta preferiti non valida.');
      return items.map(item => ({...normalizeFavorite(item), id: favoriteId(item)}));
    },
    async save(context, input) {
      validateFavoriteContext(context);
      const favorite = validateEntrySize(normalizeFavorite(input));
      const items = await api('/favorites/list', {context});
      if (!Array.isArray(items)) throw new Error('Risposta preferiti non valida.');
      if (!items.some(item => favoriteId(item) === favoriteId(favorite)) && items.length >= MAX_FAVORITES) {
        throw new Error('Hai raggiunto il limite di 500 preferiti per questa connessione.');
      }
      const saved = await api('/favorites/save', {context, favorite});
      return {...normalizeFavorite(saved), id: favoriteId(saved)};
    },
    async remove(context, id) {
      validateFavoriteContext(context);
      if (typeof id !== 'string' || !id || id.length > MAX_ENTRY_BYTES) fail('Identificativo preferito non valido.');
      return api('/favorites/remove', {context, id});
    },
    addTable(context, schema, table) {
      return this.save(context, {kind: 'table', schema, table});
    },
    addRecord(context, schema, table, keys) {
      return this.save(context, {kind: 'record', schema, table, keys});
    },
    removeTable(context, schema, table) {
      return this.remove(context, favoriteId({kind: 'table', schema, table}));
    },
    removeRecord(context, schema, table, keys) {
      return this.remove(context, favoriteId({kind: 'record', schema, table, keys}));
    },
  };
}

/** Browser/demo adapter. The supplied Storage object is the only persistence boundary. */
export function createLocalFavoritesApi(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('La memoria locale non è disponibile.');
  }
  const read = context => {
    validateFavoriteContext(context);
    const raw = storage.getItem(LOCAL_KEY_PREFIX + context);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_FAVORITES) throw new Error('Archivio preferiti non valido.');
    if (new TextEncoder().encode(raw).length > MAX_CONTEXT_BYTES) throw new Error('Archivio preferiti troppo grande.');
    return parsed.map(item => validateEntrySize(normalizeFavorite(item)));
  };
  return async (path, payload = {}) => {
    const context = validateFavoriteContext(payload.context);
    const items = read(context);
    if (path === '/favorites/list') return items;
    if (path === '/favorites/save') {
      const favorite = validateEntrySize(normalizeFavorite(payload.favorite));
      const id = favoriteId(favorite);
      const existing = items.findIndex(item => favoriteId(item) === id);
      if (existing < 0 && items.length >= MAX_FAVORITES) throw new Error('Hai raggiunto il limite di 500 preferiti per questa connessione.');
      const updated = [...items];
      if (existing < 0) updated.push(favorite); else updated[existing] = favorite;
      const serialized = JSON.stringify(updated);
      if (new TextEncoder().encode(serialized).length > MAX_CONTEXT_BYTES) throw new Error('Spazio preferiti esaurito per questa connessione.');
      storage.setItem(LOCAL_KEY_PREFIX + context, serialized);
      return favorite;
    }
    if (path === '/favorites/remove') {
      if (typeof payload.id !== 'string' || !payload.id || payload.id.length > MAX_ENTRY_BYTES) fail('Identificativo preferito non valido.');
      const updated = items.filter(item => favoriteId(item) !== payload.id);
      storage.setItem(LOCAL_KEY_PREFIX + context, JSON.stringify(updated));
      return {ok: true};
    }
    throw new Error('Operazione preferiti non supportata.');
  };
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** Compact Italian favorites panel. The caller owns table preparation and record reopening. */
export class FavoritesPanel {
  constructor(root, {store, getContext, onOpen = () => {}, onChange = () => {}}) {
    if (!root || !store || typeof getContext !== 'function') throw new TypeError('Configurazione preferiti non valida.');
    this.root = root;
    this.store = store;
    this.getContext = getContext;
    this.onOpen = onOpen;
    this.onChange = onChange;
    this.request = 0;
    this.root.classList.add('favorites-panel');
    this.root.replaceChildren();
    this.root.append(element('h2', 'Preferiti', 'favorites-heading'));
    this.status = element('p', '', 'favorites-status');
    this.status.setAttribute('role', 'status');
    this.root.append(this.status);
    this.sections = {};
    for (const [kind, title] of [['table', 'Tabelle'], ['record', 'Record']]) {
      const section = element('section', undefined, 'favorites-section');
      section.append(element('h3', title));
      const list = element('div', undefined, 'favorites-list');
      section.append(list);
      this.sections[kind] = list;
      this.root.append(section);
    }
  }

  async refresh() {
    const request = ++this.request;
    this.status.classList.remove('error');
    this.status.textContent = 'Caricamento preferiti…';
    try {
      const context = await this.getContext();
      const items = context ? await this.store.list(context) : [];
      if (request !== this.request || context !== await this.getContext()) return [];
      this.render(items);
      this.status.textContent = items.length ? '' : 'Non hai ancora salvato preferiti.';
      this.onChange(items);
      return items;
    } catch (error) {
      if (request !== this.request) return [];
      this.render([]);
      this.status.classList.add('error');
      this.status.textContent = error?.message || 'Impossibile caricare i preferiti.';
      return [];
    }
  }

  render(items) {
    for (const list of Object.values(this.sections)) list.replaceChildren();
    for (const favorite of items) {
      const normalized = normalizeFavorite(favorite);
      const identity = favorite.id || favoriteId(normalized);
      const item = element('article', undefined, 'favorite-item');
      const open = element('button', undefined, 'favorite-item__open');
      open.type = 'button';
      const qualified = `${normalized.schema}.${normalized.table}`;
      const title = qualified;
      const detail = normalized.kind === 'table'
        ? 'Tabella · prepara SELECT'
        : `Record · ${normalized.keys.map(({column, value}) => `${column} = ${value}`).join(' · ')}`;
      open.append(element('span', title, 'favorite-item__title'), element('span', detail, 'favorite-item__meta'));
      open.setAttribute('aria-label', normalized.kind === 'table' ? `Apri tabella ${qualified}` : `Riapri record ${qualified}`);
      open.onclick = () => this.openFavorite({...normalized, id: identity}, open);
      const remove = element('button', 'Rimuovi', 'favorite-item__remove secondary');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Rimuovi preferito ${qualified}`);
      remove.onclick = () => this.removeFavorite(identity, remove);
      item.append(open, remove);
      this.sections[normalized.kind].append(item);
    }
    for (const section of Object.values(this.sections)) section.closest('section').hidden = section.childElementCount === 0;
  }

  async openFavorite(favorite, button) {
    button.disabled = true;
    this.status.classList.remove('error');
    this.status.textContent = '';
    try { await this.onOpen(favorite); }
    catch (error) { this.status.classList.add('error'); this.status.textContent = error?.message || 'Impossibile aprire il preferito.'; }
    finally { button.disabled = false; }
  }

  async removeFavorite(id, button) {
    button.disabled = true;
    this.status.classList.remove('error');
    this.status.textContent = '';
    try {
      const context = await this.getContext();
      if (!context) throw new Error('Nessuna connessione selezionata.');
      await this.store.remove(context, id);
      await this.refresh();
    } catch (error) {
      button.disabled = false;
      this.status.classList.add('error');
      this.status.textContent = error?.message || 'Impossibile rimuovere il preferito.';
    }
  }
}

export const FAVORITES_LIMIT = MAX_FAVORITES;
