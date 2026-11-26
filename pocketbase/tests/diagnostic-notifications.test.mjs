import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnostiquer, nomCourt } from '../scripts/diagnostiquer-notifications.mjs';

const maintenant = Date.UTC(2026, 10, 26);
const j = (o) => ({ token: 'T', is_active: true, user_id: 'u', created_by_id: 'u', last_seen: '2026-11-25 10:00:00.000Z', ...o });

test('diagnostic des notifications : chaque cas', () => {
  const u = { id: 'u', first_name: 'Marie', last_name: 'Dupont', settings: {} };
  assert.equal(nomCourt(u), 'Marie D.');
  assert.equal(diagnostiquer(u, [j()], maintenant).etat, 'ok');
  assert.equal(diagnostiquer(u, [], maintenant).etat, 'aucun');
  assert.equal(diagnostiquer(u, [j({ is_active: false })], maintenant).etat, 'desactive');
  assert.equal(diagnostiquer(u, [j({ created_by_id: 'autre' })], maintenant).etat, 'invisible');
  assert.equal(diagnostiquer(u, [j({ last_seen: '2026-08-01 10:00:00.000Z' })], maintenant).etat, 'ancien');
  assert.equal(diagnostiquer({ ...u, settings: JSON.stringify({ notif_push: false }) }, [j()], maintenant).etat, 'coupe');
  const p = diagnostiquer({ ...u, settings: { notif_news: false } }, [j()], maintenant);
  assert.equal(p.etat, 'partiel');
  assert.match(p.details[0], /nouveautés/);
});
