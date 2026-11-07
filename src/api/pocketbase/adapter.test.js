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
    requestOTP: vi.fn(async (email) => { calls.push({ name, op: 'requestOTP', email }); return { otpId: `otp-${email}` }; }),
    authWithOTP: vi.fn(async (otpId, code) => { calls.push({ name, op: 'authWithOTP', otpId, code }); return { token: 'otptok', record: { id: userId, name: 'Ana' } }; }),
    requestPasswordReset: vi.fn(async (email) => { calls.push({ name, op: 'requestPasswordReset', email }); return true; }),
    confirmPasswordReset: vi.fn(async (t, p, c) => { calls.push({ name, op: 'confirmPasswordReset', t, p, c }); return true; }),
    requestEmailChange: vi.fn(async (email) => { calls.push({ name, op: 'requestEmailChange', email }); return true; }),
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
  it('create : created_by_id = utilisateur connecté ; aucune date base44 envoyée', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    await api.entities.Comment.create({ text: 'x', created_date: 'ignoré' });
    expect(pb.calls[0].body).toEqual({ text: 'x', created_by_id: 'u'.repeat(24) });
  });

  it('update / delete', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    await api.entities.Comment.update('i', { text: 'y', id: 'autre' });
    expect(pb.calls[0]).toMatchObject({ op: 'update', id: 'i', body: { text: 'y' } });
    expect(pb.calls[0].body).not.toHaveProperty('base44_updated_date');
    await api.entities.Comment.delete('i');
    expect(pb.calls[1]).toMatchObject({ op: 'delete', id: 'i' });
  });

  it('Conversation.create -> route createConversation (aucune création directe)', async () => {
    const pb = fakePb();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: {}, json: async () => ({ id: 'c1', type: 'direct', participant_ids: ['a', 'b'], collectionId: 'x', base44_created_date: '2026-11-06 10:00:00.000Z' }) }));
    const api = createPocketBaseAdapter(pb, { baseUrl: 'https://pb.test', fetchImpl });
    const c = await api.entities.Conversation.create({ type: 'direct', participant_ids: ['a', 'b'] });
    expect(c).toMatchObject({ id: 'c1', created_date: '2026-11-06T10:00:00.000Z' });
    expect(c).not.toHaveProperty('collectionId');
    expect(pb.calls).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://pb.test/api/fn/createConversation', expect.objectContaining({
      body: JSON.stringify({ type: 'direct', participant_ids: ['a', 'b'], created_by_id: 'u'.repeat(24) }),
    }));
  });

  it('Conversation.update : participant_ids -> route, autres champs -> mise à jour directe', async () => {
    const pb = fakePb();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: {}, json: async () => ({ id: 'c1', participant_ids: ['a', 'b', 'c'] }) }));
    const api = createPocketBaseAdapter(pb, { baseUrl: 'https://pb.test', fetchImpl });
    const only = await api.entities.Conversation.update('c1', { participant_ids: ['a', 'b', 'c'] });
    expect(only.participant_ids).toEqual(['a', 'b', 'c']);
    expect(pb.calls).toHaveLength(0);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ conversation_id: 'c1', participant_ids: ['a', 'b', 'c'] });
    await api.entities.Conversation.update('c1', { participant_ids: ['a', 'b'], name: 'Groupe' });
    expect(pb.calls[0]).toMatchObject({ op: 'update', id: 'c1', body: { name: 'Groupe' } });
    expect(pb.calls[0].body).not.toHaveProperty('participant_ids');
    await api.entities.Conversation.update('c1', { pinned_by: ['a'] });
    expect(pb.calls[1]).toMatchObject({ op: 'update', body: { pinned_by: ['a'] } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('bulkCreate et bulkUpdate', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    expect(await api.entities.QuizQuestion.bulkCreate([{ question: 'a' }, { question: 'b' }])).toHaveLength(2);
    await api.entities.Message.bulkUpdate([{ id: 'm1', read_by: ['u'] }, { id: 'm2', read_by: [] }]);
    expect(pb.calls.filter((c) => c.op === 'update').map((c) => c.id)).toEqual(['m1', 'm2']);
    await expect(api.entities.Message.bulkUpdate([{ read_by: [] }])).rejects.toBeInstanceOf(TranslationError);
  });

  it('updateMany { $set } sur les enregistrements correspondants', async () => {
    const pb = fakePb({ pages: { DonationRequest: rows(3) } });
    const api = createPocketBaseAdapter(pb);
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

  it('méthodes non migrées (OAuth) : erreur claire', () => {
    const api = createPocketBaseAdapter(fakePb());
    expect(() => api.auth.loginWithProvider('google', '/')).toThrow(NotMigratedError);
    expect(() => api.auth.loginWithProvider('google', '/')).toThrow(/pas encore migré/);
  });

  it('connexion refusée : message identique, 429 -> limite de tentatives', async () => {
    const pb = fakePb({ token: '' });
    const api = createPocketBaseAdapter(pb);
    pb.collection('users').authWithPassword.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400 }));
    await expect(api.auth.loginViaEmailPassword('a@b.c', 'x')).rejects.toMatchObject({ message: 'E-mail ou mot de passe incorrect.' });
    pb.collection('users').authWithPassword.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }));
    await expect(api.auth.loginViaEmailPassword('a@b.c', 'x')).rejects.toMatchObject({ status: 429, message: /Trop de tentatives/ });
  });

  it('inscription : aucun rôle envoyé, puis code à usage unique ; vérification avec le bon otpId', async () => {
    const pb = fakePb({ token: '' });
    const api = createPocketBaseAdapter(pb);
    await api.auth.register({ email: ' new@chay.test ', password: 'motdepasse1', role: 'admin' });
    const create = pb.calls.find((c) => c.op === 'create');
    expect(create.body).toEqual({ email: 'new@chay.test', password: 'motdepasse1', passwordConfirm: 'motdepasse1', emailVisibility: false });
    expect(pb.calls.find((c) => c.op === 'requestOTP').email).toBe('new@chay.test');
    const res = await api.auth.verifyOtp({ email: 'new@chay.test', otpCode: ' 123456 ' });
    expect(res.access_token).toBe('otptok');
    expect(pb.calls.find((c) => c.op === 'authWithOTP')).toMatchObject({ otpId: 'otp-new@chay.test', code: '123456' });
    await expect(api.auth.verifyOtp({ email: 'new@chay.test', otpCode: '1' })).rejects.toMatchObject({ code: 'otp_missing' });
  });

  it('inscription avec une adresse déjà utilisée : aucune erreur révélée, le code part au propriétaire', async () => {
    const pb = fakePb({ token: '' });
    pb.collection('users').create.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, response: { data: { email: { code: 'validation_not_unique' } } } }));
    const api = createPocketBaseAdapter(pb);
    await expect(api.auth.register({ email: 'pris@chay.test', password: 'motdepasse1' })).resolves.toEqual({});
    expect(pb.calls.some((c) => c.op === 'requestOTP')).toBe(true);
    pb.collection('users').create.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, response: { data: { password: { code: 'validation_length_out_of_range' } } } }));
    await expect(api.auth.register({ email: 'x@chay.test', password: 'court' })).rejects.toMatchObject({ message: /8 caractères/ });
  });

  it('mot de passe oublié : réponse neutre (sauf 429) ; nouveau mot de passe', async () => {
    const pb = fakePb({ token: '' });
    const api = createPocketBaseAdapter(pb);
    pb.collection('users').requestPasswordReset.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400 }));
    await expect(api.auth.resetPasswordRequest('inconnu@chay.test')).resolves.toEqual({});
    pb.collection('users').requestPasswordReset.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }));
    await expect(api.auth.resetPasswordRequest('a@chay.test')).rejects.toMatchObject({ status: 429 });
    await api.auth.resetPassword({ resetToken: 'tok', newPassword: 'nouveau123' });
    expect(pb.calls.find((c) => c.op === 'confirmPasswordReset')).toMatchObject({ t: 'tok', p: 'nouveau123', c: 'nouveau123' });
  });

  it('updateMe avec email : demande de changement par confirmation, e-mail jamais écrit directement', async () => {
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb);
    await api.auth.updateMe({ email: 'nouvelle@chay.test', city: 'Lyon' });
    expect(pb.calls.find((c) => c.op === 'requestEmailChange').email).toBe('nouvelle@chay.test');
    const upd = pb.calls.find((c) => c.op === 'update');
    expect(upd.body).toEqual({ city: 'Lyon' });
  });

  it('redirectToLogin : ?returnTo=<chemin> (lu par la page /login)', () => {
    const win = { location: { origin: 'https://app.test', href: 'https://app.test/media?x=1#a' } };
    const previous = globalThis.window;
    globalThis.window = win;
    const api = createPocketBaseAdapter(fakePb());
    api.auth.redirectToLogin(win.location.href);
    expect(win.location.href).toBe(`/login?returnTo=${encodeURIComponent('/media?x=1#a')}`);
    win.location.href = 'https://app.test/';
    api.auth.redirectToLogin();
    expect(win.location.href).toBe('/login');
    api.auth.redirectToLogin('https://ailleurs.test/piege');
    expect(win.location.href).toBe('/login');
    globalThis.window = previous;
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

  it('functions.invoke : erreur de la fonction (même 404) -> message et data comme Base44', async () => {
    const reply = (status, body) => vi.fn(async () => ({ ok: false, status, json: async () => body }));
    const notFound = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test', fetchImpl: reply(404, { error: 'audio track not found' }) });
    await expect(notFound.functions.invoke('recordMediaListen', { playlist_track_id: 'x' })).rejects.toMatchObject({
      status: 404, message: 'Request failed with status code 404', data: { error: 'audio track not found' },
    });
    const denied = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test', fetchImpl: reply(401, { error: 'Connexion requise' }) });
    await expect(denied.functions.invoke('listCommunityUsers', {})).rejects.toMatchObject({
      status: 401, message: 'Request failed with status code 401', data: { error: 'Connexion requise' },
    });
  });

  it('functions.invoke : nom invalide refusé, sans appel', async () => {
    const fetchImpl = vi.fn();
    const api = createPocketBaseAdapter(fakePb(), { baseUrl: 'https://pb.test', fetchImpl });
    await expect(api.functions.invoke('../admin', {})).rejects.toBeInstanceOf(TranslationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('integrations.Core.UploadFile : membre -> Fichier, réponse { file_url }', async () => {
    const pb = fakePb();
    pb.files = { getURL: (rec, name) => `https://pb.test/api/files/c/${rec.id}/${name}` };
    pb.collection('Fichier').create.mockImplementation(async () => ({ id: 'f'.repeat(24), fichier: 'f_abc.png' }));
    const api = createPocketBaseAdapter(pb);
    const file = new File([new Uint8Array([1, 2])], 'photo.png', { type: 'image/png' });
    const res = await api.integrations.Core.UploadFile({ file });
    expect(res).toEqual({ file_url: `https://pb.test/api/files/c/${'f'.repeat(24)}/f_abc.png` });
    const form = pb.collection('Fichier').create.mock.calls[0][0];
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('fichier').name).toBe('photo.png');
    expect([...form.keys()]).toEqual(['fichier']); // ni propriétaire ni autre champ envoyé par le client
  });

  it('integrations.Core.UploadFile : admin -> FichierAdmin ; Blob sans nom -> nom selon le type', async () => {
    const pb = fakePb();
    pb.authStore.record = { id: 'a'.repeat(24), role: 'admin' };
    pb.files = { getURL: () => 'u' };
    pb.collection('FichierAdmin').create.mockImplementation(async () => ({ id: 'x', fichier: 'f.jpg' }));
    const api = createPocketBaseAdapter(pb);
    await api.integrations.Core.UploadFile({ file: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }) });
    expect(pb.collection('FichierAdmin').create.mock.calls[0][0].get('fichier').name).toBe('fichier.jpg');
  });

  it('integrations.Core.UploadFile : erreurs traduites, anonyme refusé, autres intégrations non migrées', async () => {
    const pb = fakePb();
    pb.collection('Fichier').create
      .mockRejectedValueOnce({ status: 400, response: { data: { fichier: { code: 'validation_file_size_limit' } } } })
      .mockRejectedValueOnce({ status: 400, response: { data: { fichier: { code: 'validation_invalid_mime_type' } } } });
    const api = createPocketBaseAdapter(pb);
    const file = new File([new Uint8Array([1])], 'a.png');
    await expect(api.integrations.Core.UploadFile({ file })).rejects.toMatchObject({ status: 413, message: 'Fichier trop volumineux (max 15 Mo)' });
    await expect(api.integrations.Core.UploadFile({ file })).rejects.toMatchObject({ status: 415, message: 'Type de fichier non autorisé' });
    await expect(api.integrations.Core.UploadFile({})).rejects.toBeInstanceOf(TranslationError);
    const anon = createPocketBaseAdapter(fakePb({ token: '' }));
    await expect(anon.integrations.Core.UploadFile({ file })).rejects.toMatchObject({ code: 'auth_required' });
    expect(() => api.integrations.Core.InvokeLLM({})).toThrow(NotMigratedError);
    expect(() => api.integrations.Other.Thing({})).toThrow(NotMigratedError);
  });

  it('users.inviteUser et User.delete -> routes serveur', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: {}, json: async () => ({ ok: true }) }));
    const pb = fakePb();
    const api = createPocketBaseAdapter(pb, { baseUrl: 'https://pb.test', fetchImpl });
    await api.users.inviteUser('a@b.c', 'admin');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://pb.test/api/fn/inviteUser');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ user_email: 'a@b.c', role: 'admin' });
    await api.entities.User.delete('autre');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://pb.test/api/fn/deleteUserAccount');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ user_id: 'autre' });
    await api.entities.User.delete('u'.repeat(24));
    expect(fetchImpl.mock.calls[2][0]).toBe('https://pb.test/api/fn/deleteMyAccount');
    expect(pb.authStore.clear).toHaveBeenCalled();
    expect(pb.calls.filter((c) => c.op === 'delete')).toHaveLength(0);
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
