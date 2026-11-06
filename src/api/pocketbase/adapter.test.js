import { describe, expect, it, vi } from 'vitest';
import { BackendError, createPocketBaseAdapter } from './adapter';
import { NotMigratedError, TranslationError } from './translate';

// Faux client PocketBase : enregistre les appels, ne fait aucune requête.
function fakePb({ pages = {}, token = 'tok', userId = 'u'.repeat(24) } = {}) {
  const calls = [];
  const subs = [];
  const authStore = {
    token,
    record: token ? { id: userId } : null,
    clear: vi.fn(function clear() { this.token = ''; this.record = null; }),
    save: vi.fn(function save(t, r) { this.token = t; this.record = r; }),
  };
  const collection = (name) => ({
    getList: vi.fn(async (page, perPage, opts) => {
      calls.push({ name, op: 'getList', page, perPage, opts });
      const all = pages[name] || [];
      const items = all.slice((page - 1) * perPage, page * perPage);
      return { page, perPage, items, totalItems: all.length, totalPages: Math.ceil(all.length / perPage) };
    }),
    getOne: vi.fn(async (id) => { calls.push({ name, op: 'getOne', id }); return { id, collectionName: name }; }),
    create: vi.fn(async (body) => { calls.push({ name, op: 'create', body }); return { id: 'n'.repeat(24), ...body }; }),
    update: vi.fn(async (id, body) => { calls.push({ name, op: 'update', id, body }); return { id, ...body }; }),
    delete: vi.fn(async (id) => { calls.push({ name, op: 'delete', id }); return true; }),
    subscribe: vi.fn(async (topic, cb) => {
      const unsub = vi.fn();
      subs.push({ name, topic, cb, unsub });
      return unsub;
    }),
    authWithPassword: vi.fn(async () => ({ token: 'newtok', record: { id: userId, name: 'Ana' } })),
    authRefresh: vi.fn(async () => ({ token, record: { id: userId, name: 'Ana', role: 'admin' } })),
  });
  const cache = {};
  return {
    calls,
    subs,
    authStore,
    baseURL: 'https://pb.test',
    collection: (name) => (cache[name] ||= collection(name)),
  };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(24, '0') }));
const NOW = () => new Date('2026-11-06T10:00:00.000Z');

describe('entities : lecture', () => {
  it('list(sort, limit) -> getList(page 1, perPage = limit) avec tri traduit', async () => {
    const pb = fakePb({ pages: { Article: rows(3) } });
    const api = createPocketBaseAdapter(pb);
    const out = await api.entities.Article.list('-created_date', 2);
    expect(out).toHaveLength(2);
    expect(pb.calls[0]).toMatchObject({ name: 'Article', page: 1, perPage: 2, opts: { sort: '-base44_created_date,-created', skipTotal: true } });
  });

  it('User -> collection users, full_name exposé', async () => {
    const pb = fakePb({ pages: { users: [{ id: 'x', name: 'Ana' }] } });
    const api = createPocketBaseAdapter(pb);
    const [u] = await api.entities.User.list();
    expect(pb.calls[0].name).toBe('users');
    expect(u.full_name).toBe('Ana');
  });

  it('filter(query, sort, limit, skip) : skip non aligné -> pages de 1000 puis découpe', async () => {
    const pb = fakePb({ pages: { Comment: rows(100) } });
    const api = createPocketBaseAdapter(pb);
    const out = await api.entities.Comment.filter({ post_id: 'p' }, 'created_date', 10, 15);
    expect(out.map((r) => r.id)).toEqual(rows(100).slice(15, 25).map((r) => r.id));
    expect(pb.calls[0].opts.filter).toBe('post_id = "p"');
    expect(pb.calls[0].perPage).toBe(1000);
  });

  it('limite > 1000 : plusieurs pages', async () => {
    const pb = fakePb({ pages: { BibleVerse: rows(2500) } });
    const api = createPocketBaseAdapter(pb);
    const out = await api.entities.BibleVerse.list(null, 5000);
    expect(out).toHaveLength(2500);
    expect(pb.calls.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it('forme page : filter(query, { limit, cursor }) -> { items, has_more, next_cursor }', async () => {
    const pb = fakePb({ pages: { Message: rows(5) } });
    const api = createPocketBaseAdapter(pb);
    const p1 = await api.entities.Message.filter({ conversation_id: 'c' }, { limit: 2, sort: '-created_date' });
    expect(p1).toMatchObject({ has_more: true, next_cursor: '2' });
    const p3 = await api.entities.Message.filter({ conversation_id: 'c' }, { limit: 2, cursor: '3' });
    expect(p3).toMatchObject({ has_more: false, next_cursor: null });
    expect(p3.items).toHaveLength(1);
  });

  it('get et count', async () => {
    const pb = fakePb({ pages: { Faq: rows(7) } });
    const api = createPocketBaseAdapter(pb);
    expect((await api.entities.Faq.get('abc')).id).toBe('abc');
    expect(await api.entities.Faq.count({ is_active: true })).toBe(7);
    expect(pb.calls.at(-1).opts).toMatchObject({ filter: 'is_active = true', fields: 'id' });
  });

  it('erreur de traduction levée avant tout appel', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    await expect(api.entities.Faq.filter({ q: { $exists: true } })).rejects.toBeInstanceOf(TranslationError);
    expect(pb.calls).toHaveLength(0);
  });
});

describe('entities : écriture', () => {
  it('create : created_by_id = utilisateur connecté, dates base44', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb, { now: NOW });
    const rec = await api.entities.Comment.create({ text: 'x', created_date: 'ignoré' });
    expect(pb.calls[0].body).toEqual({
      text: 'x',
      created_by_id: 'u'.repeat(24),
      base44_created_date: '2026-11-06 10:00:00.000Z',
      base44_updated_date: '2026-11-06 10:00:00.000Z',
    });
    expect(rec.created_date).toBe('2026-11-06T10:00:00.000Z');
  });

  it('update / delete', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb, { now: NOW });
    await api.entities.Comment.update('i', { text: 'y', id: 'autre' });
    expect(pb.calls[0]).toMatchObject({ op: 'update', id: 'i', body: { text: 'y', base44_updated_date: '2026-11-06 10:00:00.000Z' } });
    await api.entities.Comment.delete('i');
    expect(pb.calls[1]).toMatchObject({ op: 'delete', id: 'i' });
  });

  it('bulkCreate et bulkUpdate', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb, { now: NOW });
    expect(await api.entities.QuizQuestion.bulkCreate([{ question: 'a' }, { question: 'b' }])).toHaveLength(2);
    await api.entities.Message.bulkUpdate([{ id: 'm1', read_by: ['u'] }, { id: 'm2', read_by: [] }]);
    expect(pb.calls.filter((c) => c.op === 'update').map((c) => c.id)).toEqual(['m1', 'm2']);
    await expect(api.entities.Message.bulkUpdate([{ read_by: [] }])).rejects.toBeInstanceOf(TranslationError);
  });

  it('updateMany { $set } sur les enregistrements correspondants', async () => {
    const pb = fakePb({ pages: { DonationRequest: rows(3) } });
    const api = createPocketBaseAdapter(pb, { now: NOW });
    const res = await api.entities.DonationRequest.updateMany({ is_read: { $ne: true } }, { $set: { is_read: true } });
    expect(res).toEqual({ matched: 3, modified: 3 });
    expect(pb.calls[0].opts.filter).toBe('is_read != true');
    expect(pb.calls.filter((c) => c.op === 'update')).toHaveLength(3);
    await expect(api.entities.DonationRequest.updateMany({}, { $inc: { n: 1 } })).rejects.toBeInstanceOf(TranslationError);
  });

  it('deleteMany refuse une requête vide', async () => {
    const pb = fakePb({ pages: { Comment: rows(2) } });
    const api = createPocketBaseAdapter(pb);
    await expect(api.entities.Comment.deleteMany({})).rejects.toBeInstanceOf(TranslationError);
    expect(await api.entities.Comment.deleteMany({ post_id: 'p' })).toEqual({ deleted: 2 });
  });
});

describe('entities : temps réel', () => {
  it('subscribe -> évènement au format Base44 ; désabonnement', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    const cb = vi.fn();
    const off = api.entities.UserNotification.subscribe(cb);
    await vi.waitFor(() => expect(pb.subs).toHaveLength(1));
    pb.subs[0].cb({ action: 'create', record: { id: 'r1', title: 't', created: '2026-11-06 10:00:00.000Z' } });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'create', id: 'r1', data: expect.objectContaining({ id: 'r1', created_date: '2026-11-06T10:00:00.000Z' }),
    }));
    off();
    await vi.waitFor(() => expect(pb.subs[0].unsub).toHaveBeenCalled());
    pb.subs[0].cb({ action: 'update', record: { id: 'r1' } });
    expect(cb).toHaveBeenCalledTimes(1); // plus rien après le désabonnement
  });

  it('désabonnement avant la fin de l’abonnement', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    const off = api.entities.Message.subscribe(() => {});
    off();
    await vi.waitFor(() => expect(pb.subs[0]?.unsub).toHaveBeenCalled());
  });
});

describe('auth', () => {
  it('me() sans jeton -> erreur « auth_required » reconnue par AuthContext', async () => {
    const api = createPocketBaseAdapter(fakePb({ token: '' }));
    await expect(api.auth.me()).rejects.toMatchObject({ status: 403, data: { extra_data: { reason: 'auth_required' } } });
    expect(await api.auth.isAuthenticated()).toBe(false);
  });

  it('me() avec jeton -> utilisateur au format Base44', async () => {
    const api = createPocketBaseAdapter(fakePb());
    expect(await api.auth.me()).toMatchObject({ full_name: 'Ana', role: 'admin' });
  });

  it('me() jeton refusé -> authStore vidé', async () => {
    const pb = fakePb();
    pb.collection('users').authRefresh.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401 }));
    const api = createPocketBaseAdapter(pb);
    await expect(api.auth.me()).rejects.toMatchObject({ code: 'auth_required' });
    expect(pb.authStore.clear).toHaveBeenCalled();
  });

  it('loginViaEmailPassword -> { access_token, user } ; setToken du même jeton sans effet', async () => {
    const pb = fakePb({ token: '' });
    const api = createPocketBaseAdapter(pb);
    const res = await api.auth.loginViaEmailPassword('a@b.c', 'pw');
    expect(res).toMatchObject({ access_token: 'newtok', user: { full_name: 'Ana' } });
    pb.authStore.token = 'newtok';
    api.auth.setToken('newtok');
    expect(pb.authStore.save).not.toHaveBeenCalled();
  });

  it('updateMe -> update de users sans champ verrouillé', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    await api.auth.updateMe({ full_name: 'Bo', city: 'Paris', created_date: 'x' });
    expect(pb.calls[0]).toMatchObject({ name: 'users', op: 'update', id: 'u'.repeat(24), body: { name: 'Bo', city: 'Paris' } });
    expect(pb.calls[0].body).not.toHaveProperty('base44_updated_date');
  });

  it('méthodes non migrées : erreur claire', () => {
    const api = createPocketBaseAdapter(fakePb());
    for (const m of ['register', 'verifyOtp', 'resendOtp', 'resetPasswordRequest', 'resetPassword', 'loginWithProvider']) {
      expect(() => api.auth[m]({})).toThrow(NotMigratedError);
      expect(() => api.auth[m]({})).toThrow(/pas encore migré/);
    }
  });
});

describe('functions, intégrations, divers', () => {
  it('functions.invoke -> POST /api/fn/<nom> avec le jeton, réponse { data }', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: {}, json: async () => ({ ok: 1 }) }));
    const api = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test/', fetchImpl });
    const res = await api.functions.invoke('quizStart', { difficulty: 'easy' });
    expect(res.data).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledWith('https://pb.test/api/fn/quizStart', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'tok' }), body: '{"difficulty":"easy"}',
    }));
  });

  it('functions.invoke : route absente (404) -> erreur explicite', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const api = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test', fetchImpl });
    await expect(api.functions.invoke('createMessage', {})).rejects.toMatchObject({
      status: 404, code: 'function_not_migrated', message: expect.stringMatching(/pas encore migrée/),
    });
  });

  it('functions.invoke : nom invalide refusé, sans appel', async () => {
    const fetchImpl = vi.fn();
    const api = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test', fetchImpl });
    await expect(api.functions.invoke('../admin', {})).rejects.toBeInstanceOf(TranslationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('integrations.Core.UploadFile, users.inviteUser : pas encore migré', () => {
    const api = createPocketBaseAdapter(fakePb());
    expect(() => api.integrations.Core.UploadFile({})).toThrow(NotMigratedError);
    expect(() => api.users.inviteUser('a@b.c', 'user')).toThrow(NotMigratedError);
  });

  it('app.getPublicSettings neutre ; config.token suit le authStore', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    expect(await api.app.getPublicSettings()).toMatchObject({ backend: 'pocketbase' });
    expect(api.config.token).toBe('tok');
  });

  it('erreurs PocketBase converties au format Base44 (status, data)', async () => {
    const pb = fakePb();
    pb.collection('Faq').getOne.mockRejectedValueOnce(Object.assign(new Error('nf'), { status: 404, response: { message: 'Introuvable', data: {} } }));
    const api = createPocketBaseAdapter(pb);
    await expect(api.entities.Faq.get('x')).rejects.toBeInstanceOf(BackendError);
  });
});
