// auth.me() (authRefresh) : le jeton n'est effacé QUE sur une révocation réelle (401 / 403 / 404).
import { describe, expect, it, vi } from 'vitest';
import { createPocketBaseAdapter } from './adapter';
import { estRevocation } from '@/lib/sessionPolicy';

function pbAvec(authRefresh) {
  const authStore = {
    token: 'jeton-valide',
    record: { id: 'u'.repeat(24), collectionName: 'users' },
    clear: vi.fn(function clear() { this.token = ''; this.record = null; }),
    save: vi.fn(),
    onChange: vi.fn(() => () => {}),
  };
  const users = { authRefresh: vi.fn(authRefresh) };
  return { authStore, baseURL: 'http://127.0.0.1:8090', collection: () => users, autoCancellation: vi.fn() };
}
const echec = (status, message = 'x') => Object.assign(new Error(message), { status });

describe('session : seul un refus réel du serveur déconnecte', () => {
  it.each([
    ['réseau coupé (status 0)', 0],
    ['limite de requêtes (429)', 429],
    ['panne serveur (500)', 500],
    ['service indisponible (503)', 503],
  ])('%s : erreur temporaire, jeton CONSERVÉ', async (_nom, status) => {
    const pb = pbAvec(async () => { throw echec(status); });
    const api = createPocketBaseAdapter(pb, { baseUrl: pb.baseURL });
    const err = await api.auth.me().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(estRevocation(err)).toBe(false);
    expect(pb.authStore.clear).not.toHaveBeenCalled();
    expect(pb.authStore.token).toBe('jeton-valide');
  });

  it.each([401, 403, 404])('refus réel (%i) : jeton effacé, erreur auth_required', async (status) => {
    const pb = pbAvec(async () => { throw echec(status); });
    const api = createPocketBaseAdapter(pb, { baseUrl: pb.baseURL });
    const err = await api.auth.me().catch((e) => e);
    expect(err).toMatchObject({ code: 'auth_required' });
    expect(estRevocation(err)).toBe(true);
    expect(pb.authStore.clear).toHaveBeenCalled();
  });

  it('succès : profil renvoyé, jeton conservé', async () => {
    const pb = pbAvec(async () => ({ token: 'nouveau', record: { id: 'u'.repeat(24), email: 'a@b.c', collectionName: 'users' } }));
    const api = createPocketBaseAdapter(pb, { baseUrl: pb.baseURL });
    await expect(api.auth.me()).resolves.toMatchObject({ id: 'u'.repeat(24) });
    expect(pb.authStore.clear).not.toHaveBeenCalled();
  });
});
