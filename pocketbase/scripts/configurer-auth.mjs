#!/usr/bin/env node
// Applique la configuration d'authentification (bloc 3) au BAC À SABLE LOCAL :
//  - collection users : pocketbase/config/users-auth.json (OTP, modèles d'e-mail en français, authRule…) ;
//  - réglages : pocketbase/config/settings-bac-a-sable.json (faux SMTP 127.0.0.1, limites de tentatives).
// Par défaut : SIMULATION (affiche les changements). Écriture réelle avec --appliquer.
// Refuse toute adresse autre que 127.0.0.1:8090 / localhost:8090 (donc le tunnel de production sur 8091),
// et tout SMTP autre que 127.0.0.1.
// Superuser : PB_EMAIL / PB_PASSWORD, sinon la ligne « superuser » de C:\PB-local\identifiants-test.txt (jamais affichés).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--appliquer');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
// Port 8090 exigé : le tunnel SSH vers la production utilise 127.0.0.1:8091 (docs/DEPLOIEMENT.md, étape 3).
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname) || new URL(BASE).port !== '8090') {
  console.error('Refusé : ce script ne configure que le bac à sable local (127.0.0.1:8090).');
  process.exit(2);
}
const usersCfg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', 'users-auth.json'), 'utf8'));
const settingsCfg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', 'settings-bac-a-sable.json'), 'utf8'));
if (settingsCfg.smtp?.host !== '127.0.0.1') {
  console.error('Refusé : le SMTP du bac à sable doit être 127.0.0.1.');
  process.exit(2);
}

function superuser() {
  if (process.env.PB_EMAIL && process.env.PB_PASSWORD) return [process.env.PB_EMAIL, process.env.PB_PASSWORD];
  const line = fs.readFileSync('C:\\PB-local\\identifiants-test.txt', 'utf8').split(/\r?\n/).find((l) => l.startsWith('superuser\t'));
  if (!line) throw new Error('identifiants superuser introuvables');
  const [, email, password] = line.split('\t');
  return [email, password];
}
async function call(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${p} : HTTP ${res.status} ${data?.message || ''} ${data?.data ? JSON.stringify(data.data) : ''}`);
  return data;
}
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const replaceUrl = (v) => JSON.parse(JSON.stringify(v).replaceAll('%PB_URL%', BASE));

const [identity, password] = superuser();
const { token } = await call('POST', '/api/collections/_superusers/auth-with-password', { identity, password });

// ── Collection users ─────────────────────────────────────────────────────────
const col = await call('GET', '/api/collections/users', null, token);
const wanted = replaceUrl(strip(usersCfg));
const usersPatch = {};
for (const [k, v] of Object.entries(wanted)) {
  const merged = v && typeof v === 'object' && !Array.isArray(v) && col[k] && typeof col[k] === 'object' ? { ...col[k], ...v } : v;
  if (JSON.stringify(col[k]) !== JSON.stringify(merged)) usersPatch[k] = merged;
}

// ── Réglages ─────────────────────────────────────────────────────────────────
const settings = await call('GET', '/api/settings', null, token);
const s = strip(settingsCfg);
const removed = settingsCfg._removeRateLimitLabels || [];
const keepRules = (settings.rateLimits?.rules || []).filter((r) => !removed.includes(r.label) && !s.rateLimits.rules.some((n) => n.label === r.label));
const settingsPatch = {
  meta: { ...settings.meta, ...s.meta },
  smtp: { ...settings.smtp, ...s.smtp },
  rateLimits: { enabled: s.rateLimits.enabled, rules: [...keepRules, ...s.rateLimits.rules] },
};

console.log(APPLY ? '=== APPLICATION ===' : '=== SIMULATION (ajouter --appliquer) ===');
console.log(`users : options modifiées : ${Object.keys(usersPatch).join(', ') || 'aucune'}`);
console.log(`réglages : SMTP -> ${s.smtp.host}:${s.smtp.port} ; appURL -> ${s.meta.appURL} ; limites : ${s.rateLimits.rules.length} règles (+${keepRules.length} existantes conservées)`);
if (APPLY) await apply();

async function apply() {
if (Object.keys(usersPatch).length) await call('PATCH', '/api/collections/users', usersPatch, token);
await call('PATCH', '/api/settings', settingsPatch, token);

const after = await call('GET', '/api/collections/users', null, token);
const bad = Object.keys(usersPatch).filter((k) => {
  const exp = usersPatch[k];
  return typeof exp === 'object' && exp !== null
    ? Object.keys(exp).some((kk) => JSON.stringify(after[k]?.[kk]) !== JSON.stringify(exp[kk]))
    : JSON.stringify(after[k]) !== JSON.stringify(exp);
});
const st = await call('GET', '/api/settings', null, token);
console.log(`vérification : users ${bad.length ? `écarts sur ${bad.join(', ')}` : 'conforme'} ; SMTP ${st.smtp.host}:${st.smtp.port} ${st.smtp.enabled ? 'activé' : 'désactivé'} ; limites ${st.rateLimits.enabled ? 'activées' : 'désactivées'} (${st.rateLimits.rules.length} règles)`);
process.exitCode = bad.length ? 1 : 0;
}
