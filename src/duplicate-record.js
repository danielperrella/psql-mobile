// Convert a /records/open response into the initial value map expected by the
// create editor. Values deliberately remain strings/objects; in particular, do
// not coerce PostgreSQL numeric or temporal values through Number or Date.
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return new Date(value.getTime());
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function primaryKeyNames(definition) {
  return new Set((definition.primaryKey || []).map(key =>
    typeof key === 'string' ? key : key?.name ?? key?.column
  ).filter(Boolean));
}

function isIdentity(column) {
  // Current metadata may expose only `generated`; accept the more explicit
  // identity spellings too so this helper stays correct if the API adds them.
  return column.identity === true
    || column.identity === 'a'
    || column.identity === 'd'
    || column.identity === 'always'
    || column.identity === 'by default'
    || column.isIdentity === true
    || column.identityGenerated === true
    || column.identityMode === 'always'
    || column.identityMode === 'byDefault'
    || column.identityGeneration === 'always'
    || column.identityGeneration === 'by default'
    || column.attidentity === 'a'
    || column.attidentity === 'd';
}

function emptyInitialValue(column) {
  if (column.hasDefault || column.generated || isIdentity(column)) return { mode: 'default' };
  if (column.nullable) return { mode: 'null' };
  return { mode: 'value', value: '' };
}

/**
 * Build create-editor initial values from a /records/open definition and row.
 * The result is keyed by column name; each value is directly usable as a
 * RecordEditor control state: {mode:'value', value}, {mode:'null'}, or
 * {mode:'default'}. Primary keys, generated/identity columns, and columns
 * whose `canInsert` metadata is false are never copied from the source row.
 */
export function duplicateRecordValues(definition, row) {
  const primaryKeys = primaryKeyNames(definition);
  const values = {};

  for (const column of definition.columns || []) {
    const name = column.name;
    const excluded = primaryKeys.has(name)
      || column.generated === true
      || isIdentity(column)
      || column.canInsert === false;

    if (excluded || !Object.hasOwn(row || {}, name)) {
      values[name] = emptyInitialValue(column);
    } else if (row[name] === null) {
      values[name] = { mode: 'null' };
    } else {
      values[name] = { mode: 'value', value: cloneValue(row[name]) };
    }
  }

  return values;
}

/** Convenience form for callers holding the complete /records/open payload. */
export function duplicateRecordInitialValues(openResponse) {
  return duplicateRecordValues(openResponse.definition, openResponse.row);
}
