// Outils communs des tests d'intégration contre le BAC À SABLE LOCAL (127.0.0.1 uniquement).
import fs from 'node:fs';

export const BASE = (process.env.PB_TEST_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname)) {
  console.error(`Refusé : ces tests ne visent que le bac à sable local (reçu : ${new URL(BASE).hostname}).`);
  process.exit(2);
}

/** Identifiants des comptes de test (fichier hors dépôt, jamais affichés). */
export function loadCreds(required) {
  const file = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
  const creds = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [label, email, password, id] = line.split('\t');
    creds[label] = { email, password, id };
  }
  for (const k of required) {
    if (!creds[k]) { console.error(`Identifiant « ${k} » absent de ${file}`); process.exit(2); }
  }
  return creds;
}

export async function http(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export async function login(collection, c) {
  const r = await http('POST', `/api/collections/${collection}/auth-with-password`, { body: { identity: c.email, password: c.password } });
  if (r.status !== 200) throw new Error(`connexion ${collection} impossible (HTTP ${r.status})`);
  return { token: r.data.token, id: r.data.record.id };
}

export const fn = (name, opts) => http('POST', `/api/fn/${name}`, opts);
export const sameKeys = (o, keys) => Boolean(o) && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...keys].sort());
export const keysOf = (o) => (o ? Object.keys(o).sort().join(',') : String(o));
export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const q = (s) => encodeURIComponent(s);

/** Mini-exécuteur : affiche ✓ / ✗ (jamais de données personnelles). */
export function makeChecker() {
  const state = { pass: 0, fail: 0, failures: [] };
  const check = (label, cond, detail = '') => {
    if (cond) { state.pass++; console.log(`  ✓ ${label}`); }
    else { state.fail++; state.failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  const done = () => {
    console.log(`\nRésultat : ${state.pass} réussis, ${state.fail} échoués${state.fail ? ` (${state.failures.join(' ; ')})` : ''}`);
    process.exitCode = state.fail ? 1 : 0;
  };
  return { check, done };
}

/**
 * Client temps réel minimal (protocole SSE de PocketBase) : connexion, abonnement
 * à `topic` avec le jeton donné, et collecte des évènements reçus.
 */
export async function realtime(token, topic) {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/realtime`, { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let resolveConnect;
  const connected = new Promise((ok) => { resolveConnect = ok; });
  (async () => {
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let name = 'message';
          let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) name = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { parsed = null; }
          if (name === 'PB_CONNECT') resolveConnect(parsed?.clientId);
          else events.push({ name, data: parsed });
        }
      }
    } catch { /* fermeture */ }
  })();
  const clientId = await Promise.race([connected, sleep(5000).then(() => null)]);
  if (!clientId) throw new Error('temps réel : pas de PB_CONNECT');
  const sub = await http('POST', '/api/realtime', { token, body: { clientId, subscriptions: [topic] } });
  return { events, status: sub.status, close: () => ctrl.abort() };
}
