export const uriExample = 'postgresql://utente:password@db.example.com:5432/database?sslmode=require';

// This is text extraction, never a shell parser or command execution.
export function normalizeConnectionString(value) {
  let uri = String(value ?? '').trim();
  const fromCommand = /^psql(?:\.exe)?(?:\s|$)/i.test(uri);
  if (fromCommand) uri = uri.replace(/^psql(?:\.exe)?(?:\s+|$)/i, '').trim();
  if (!uri) throw new Error('Incolla una URI PostgreSQL oppure un comando psql che la contiene.');
  const pairs = { "'": "'", '"': '"', '‘': '’', '“': '”' };
  if (pairs[uri[0]]) {
    if (uri.at(-1) !== pairs[uri[0]]) {
      throw new Error('Le virgolette esterne non sono chiuse. Esempio: psql \'postgresql://utente:password@db.example.com/database\'.');
    }
    uri = uri.slice(1, -1).trim();
  }
  if (!/^postgres(?:ql)?:\/\//.test(uri)) {
    throw new Error(fromCommand
      ? 'Dopo psql incolla una sola URI, eventualmente tra virgolette, senza altre opzioni del terminale.'
      : 'La URI deve iniziare con postgresql:// oppure postgres://. Puoi incollare anche psql seguito dalla URI tra virgolette.');
  }
  const whitespace = uri.search(/\s/);
  if (whitespace !== -1) throw new Error(`Spazio o a capo non codificato alla posizione ${whitespace + 1} della URI. Per uno spazio nella password usa %20.`);
  const percent = uri.search(/%(?![0-9a-f]{2})/i);
  if (percent !== -1) throw new Error(`Sequenza % non valida alla posizione ${percent + 1} della URI. Un carattere % nella password si scrive %25.`);
  if (uri.includes('#')) throw new Error('Il carattere # deve essere codificato nella URI: nella password scrivi %23. Esempio generico: pass%23word.');
  if (/[<>"‘’“”]/.test(uri)) throw new Error('La URI contiene virgolette o parentesi non valide. Rimuovi i segnaposto; nelle credenziali codifica i caratteri speciali (esempio: %22 per ").');
  let parsed;
  // Older Android WebViews treat non-special schemes as opaque URLs (hostname is
  // empty). Validate the same authority/path with the standard HTTPS parser;
  // retain the original PostgreSQL URI and never make an HTTP request.
  try { parsed = new URL(uri.replace(/^postgres(?:ql)?:\/\//, 'https://')); }
  catch { throw new Error('Controlla host, porta e separatori della URI. Nelle credenziali usa %40 per @, %2F per / e %3F per ?. Esempio generico: pass%40word.'); }
  const authority = uri.slice(uri.indexOf('://') + 3).split(/[/?#]/, 1)[0];
  if ((authority.match(/@/g) || []).length > 1) throw new Error('Un carattere @ nelle credenziali deve essere scritto %40. Esempio generico: pass%40word.');
  const userInfo = authority.slice(0, authority.lastIndexOf('@'));
  if (authority.includes('@') && /[\[\]\\]/.test(userInfo)) throw new Error('Codifica i caratteri speciali nelle credenziali: %5B per [, %5D per ] e %5C per \\.');
  if (!parsed.hostname) throw new Error('Manca l’host del database. Esempio: db.example.com.');
  if (!parsed.username && !parsed.searchParams.get('user')) throw new Error('Manca l’utente PostgreSQL prima di @ oppure nel parametro user.');
  if (parsed.port && (+parsed.port < 1 || +parsed.port > 65535)) throw new Error('La porta deve essere compresa tra 1 e 65535. Esempio PostgreSQL: 5432.');
  try {
    for (const part of [parsed.username, parsed.password, parsed.pathname, parsed.search]) decodeURIComponent(part);
  } catch { throw new Error('Una sequenza percent-encoding non rappresenta testo UTF-8 valido. Esempi: %40 per @ e %20 per uno spazio.'); }
  return { uri, fromCommand };
}

export function validateConnectionString(value) {
  try {
    const result = normalizeConnectionString(value);
    return { ...result, valid: true, message: result.fromCommand
      ? 'Comando psql riconosciuto: verrà usata solo la URI, senza eseguire il comando.'
      : 'Formato URI PostgreSQL valido.' };
  } catch (error) { return { valid: false, message: error.message }; }
}
