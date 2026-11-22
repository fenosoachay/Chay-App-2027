// Couche d'adaptation : expose l'interface du client Base44 (entities, auth,
// functions, integrations, users, app, config) au-dessus d'une instance du
// SDK PocketBase. L'instance est injectée, ce qui permet de la remplacer par
// un faux client dans les tests (aucun appel réseau).

import {
  buildFields,
  buildFilter,
  buildSort,
  collectionName,
  DEFAULT_LIMIT,
  fromRecord,
  MAX_PER_PAGE,
  NotMigratedError,
  planPages,
  toRecord,
  TranslationError,
} from './translate';

const BULK_CONCURRENCY = 4;

// ── Erreurs au format Base44 (message, status, code, data) ───────────────────

export class BackendError extends Error {
  constructor(message, status, code, data, originalError) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.originalError = originalError;
  }
}

function wrapError(err) {
  if (err instanceof BackendError || err instanceof NotMigratedError || err instanceof TranslationError) return err;
  const status = typeof err?.status === 'number' ? err.status : 0;
  const data = err?.response ?? err?.data ?? null;
  const message = data?.message || err?.message || 'Erreur PocketBase';
  return new BackendError(message, status, data?.code ?? null, data, err);
}

/**
 * Erreur d'authentification avec un message neutre en français (ne révèle jamais si un compte existe).
 * 429 -> message de limite de tentatives.
 */
function authError(err, message) {
  const status = typeof err?.status === 'number' ? err.status : 0;
  if (status === 429) return new BackendError('Trop de tentatives. Réessayez dans une minute.', 429, 'rate_limited', null, err);
  if (status === 0) return new BackendError('Serveur injoignable. Vérifiez votre connexion.', 0, 'network_error', null, err);
  return new BackendError(message, status, 'auth_failed', null, err);
}

/** Erreur reconnue par AuthContext comme « session absente ou expirée ». */
function authRequiredError(original) {
  return new BackendError('Authentification requise', 403, 'auth_required',
    { extra_data: { reason: 'auth_required' } }, original);
}

async function guard(promise) {
  try {
    return await promise;
  } catch (err) {
    throw wrapError(err);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const notMigrated = (what) => () => {
  throw new NotMigratedError(what);
};

/** Objet dont toute méthode inconnue lève « pas encore migré ». */
function notMigratedProxy(prefix, known = {}) {
  return new Proxy(known, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string' || prop === 'then' || prop.startsWith('_')) return undefined;
      return notMigrated(`${prefix}.${prop}`);
    },
  });
}

// ── Adaptateur ───────────────────────────────────────────────────────────────

// Opérations d'entités confiées à une route serveur, parce que la règle de collection
// les interdit au client (voir regles.md, « Conversations et messages : routes serveur »).
const SERVER_ROUTES = {
  Conversation: { create: 'createConversation', participants: 'updateConversationParticipants' },
};

export function createPocketBaseAdapter(pb, { baseUrl, fetchImpl } = {}) {
  const apiBase = String(baseUrl || pb.baseURL || '').replace(/\/+$/, '');
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const currentUserId = () => pb.authStore?.record?.id || null;
  // Défini plus bas ; appelé seulement après la création de l'adaptateur.
  const invokeFn = (name, data) => functions.invoke(name, data);

  function entityHandler(entity) {
    const col = () => pb.collection(collectionName(entity));
    const map = (rec) => fromRecord(entity, rec);

    // Forme tableau : list(sort, limit, skip, fields) / filter(query, sort, limit, skip, fields)
    async function readArray(query, sort, limit, skip, fields) {
      const { perPage, startPage, offset, limit: lim } = planPages(limit, skip);
      const options = {
        filter: buildFilter(entity, query) || undefined,
        sort: buildSort(entity, sort),
        fields: buildFields(entity, fields),
        skipTotal: true,
      };
      const rows = [];
      for (let page = startPage; rows.length < offset + lim; page++) {
        const res = await guard(col().getList(page, perPage, options));
        const items = res?.items || [];
        rows.push(...items);
        if (items.length < perPage) break;
      }
      return rows.slice(offset, offset + lim).map(map);
    }

    // Forme page : list(options) / filter(query, options) -> { items, has_more, next_cursor }
    async function readPage(query, options) {
      if ('distinct' in options) throw new NotMigratedError(`entities.${entity}.list({ distinct })`);
      const perPage = Math.min(options.limit || DEFAULT_LIMIT, MAX_PER_PAGE);
      const page = options.cursor ? Number.parseInt(options.cursor, 10) : 1;
      if (!Number.isInteger(page) || page < 1) throw new TranslationError('curseur invalide');
      const res = await guard(col().getList(page, perPage, {
        filter: buildFilter(entity, query) || undefined,
        sort: buildSort(entity, options.sort),
        fields: buildFields(entity, options.fields),
      }));
      const hasMore = page < (res?.totalPages || 0);
      return { items: (res?.items || []).map(map), has_more: hasMore, next_cursor: hasMore ? String(page + 1) : null };
    }

    // Tous les id correspondant à une requête (pour updateMany / deleteMany).
    async function matchingIds(query) {
      const filter = buildFilter(entity, query);
      const ids = [];
      for (let page = 1; ; page++) {
        const res = await guard(col().getList(page, MAX_PER_PAGE, { filter: filter || undefined, fields: 'id', skipTotal: true }));
        const items = res?.items || [];
        ids.push(...items.map((r) => r.id));
        if (items.length < MAX_PER_PAGE) return ids;
      }
    }

    const isOptions = (v) => typeof v === 'object' && v !== null;

    return {
      async list(...args) {
        const [sort, limit, skip, fields] = args;
        return isOptions(sort) ? readPage(undefined, sort) : readArray(undefined, sort, limit, skip, fields);
      },
      async filter(query, ...args) {
        const [sort, limit, skip, fields] = args;
        return isOptions(sort) ? readPage(query, sort) : readArray(query, sort, limit, skip, fields);
      },
      async get(id) {
        return map(await guard(col().getOne(id)));
      },
      async count(query) {
        const res = await guard(col().getList(1, 1, { filter: buildFilter(entity, query) || undefined, fields: 'id' }));
        return res?.totalItems ?? 0;
      },
      async create(data) {
        const body = toRecord(entity, data, { isCreate: true, userId: currentUserId() });
        const route = SERVER_ROUTES[entity]?.create;
        if (route) return map((await invokeFn(route, body)).data);
        return map(await guard(col().create(body)));
      },
      async update(id, data) {
        const body = toRecord(entity, data);
        const route = SERVER_ROUTES[entity]?.participants;
        if (route && 'participant_ids' in body) {
          const { participant_ids: participantIds, ...rest } = body;
          const res = await invokeFn(route, { conversation_id: id, participant_ids: participantIds });
          if (!Object.keys(rest).length) return map(res.data);
          return map(await guard(col().update(id, rest)));
        }
        return map(await guard(col().update(id, body)));
      },
      async delete(id) {
        // Comptes : suppression par route (données personnelles supprimées, contenus anonymisés).
        if (entity === 'User') {
          const self = id === currentUserId();
          const res = self ? await invokeFn('deleteMyAccount', {}) : await invokeFn('deleteUserAccount', { user_id: id });
          if (self) pb.authStore.clear();
          return { id, deleted: true, ...res.data };
        }
        await guard(col().delete(id));
        return { id, deleted: true };
      },
      async bulkCreate(rows) {
        if (!Array.isArray(rows)) throw new TranslationError('bulkCreate : tableau attendu');
        return mapLimit(rows, BULK_CONCURRENCY, (row) => this.create(row));
      },
      async bulkUpdate(rows) {
        if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string')) {
          throw new TranslationError('bulkUpdate : tableau d’objets avec id attendu');
        }
        return mapLimit(rows, BULK_CONCURRENCY, ({ id, ...data }) => this.update(id, data));
      },
      async updateMany(query, data) {
        const ops = data && typeof data === 'object' ? Object.keys(data) : [];
        if (ops.length !== 1 || ops[0] !== '$set' || typeof data.$set !== 'object') {
          throw new TranslationError('updateMany : seul { $set: {...} } est pris en charge');
        }
        const ids = await matchingIds(query);
        await mapLimit(ids, BULK_CONCURRENCY, (id) => this.update(id, data.$set));
        return { matched: ids.length, modified: ids.length };
      },
      async deleteMany(query) {
        if (!query || typeof query !== 'object' || !Object.keys(query).length) {
          throw new TranslationError('deleteMany : une requête non vide est obligatoire');
        }
        const ids = await matchingIds(query);
        await mapLimit(ids, BULK_CONCURRENCY, (id) => guard(col().delete(id)));
        return { deleted: ids.length };
      },
      subscribe(callback) {
        let unsubscribe = null;
        let cancelled = false;
        guard(col().subscribe('*', (e) => {
          if (cancelled) return; // évènement arrivé après le désabonnement
          try {
            callback({ type: e.action, id: e.record?.id, data: map(e.record), timestamp: new Date().toISOString() });
          } catch (err) {
            console.error('[PocketBase] erreur dans le callback temps réel', entity, err);
          }
        })).then((fn) => {
          if (cancelled) fn();
          else unsubscribe = fn;
        }).catch((err) => {
          console.error('[PocketBase] abonnement temps réel impossible', entity, err?.status ?? '');
        });
        return () => {
          cancelled = true;
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        };
      },
      aggregate: notMigrated(`entities.${entity}.aggregate`),
      upsert: notMigrated(`entities.${entity}.upsert`),
      importEntities: notMigrated(`entities.${entity}.importEntities`),
      schema: notMigrated(`entities.${entity}.schema`),
    };
  }

  const entities = new Proxy({}, {
    get(_, name) {
      if (typeof name !== 'string' || name === 'then' || name.startsWith('_')) return undefined;
      return entityHandler(name);
    },
  });

  // ── auth ───────────────────────────────────────────────────────────────────
  const users = () => pb.collection('users');
  const auth = notMigratedProxy('auth', {
    hasToken() {
      return Boolean(pb.authStore?.token);
    },
    async me() {
      if (!pb.authStore?.token) throw authRequiredError();
      try {
        const res = await users().authRefresh();
        return fromRecord('User', res.record);
      } catch (err) {
        if ([401, 403, 404].includes(err?.status)) {
          pb.authStore.clear();
          throw authRequiredError(err);
        }
        throw wrapError(err);
      }
    },
    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch {
        return false;
      }
    },
    async loginViaEmailPassword(email, password) {
      try {
        const res = await users().authWithPassword(String(email || '').trim(), password);
        return { access_token: res.token, user: fromRecord('User', res.record) };
      } catch (err) {
        // Même message que le compte existe ou non (et pour un compte non vérifié ou désactivé).
        throw authError(err, 'E-mail ou mot de passe incorrect.');
      }
    },
    setToken(token) {
      if (!token || token === pb.authStore.token) return;
      pb.authStore.save(token, pb.authStore.record ?? null);
    },
    async updateMe(data) {
      const id = currentUserId();
      if (!id) throw authRequiredError();
      // Changement d'e-mail : par confirmation (lien envoyé à la nouvelle adresse), jamais direct.
      const { email, ...rest } = data || {};
      if (typeof email === 'string' && email.trim() && email.trim() !== pb.authStore.record?.email) {
        try {
          await users().requestEmailChange(email.trim());
        } catch (err) {
          throw authError(err, 'Impossible de demander le changement d’adresse e-mail.');
        }
      }
      if (!Object.keys(rest).length) return this.me();
      return fromRecord('User', await guard(users().update(id, toRecord('User', rest))));
    },
    async changePassword({ currentPassword, newPassword } = {}) {
      const id = currentUserId();
      if (!id) throw authRequiredError();
      try {
        await users().update(id, { oldPassword: currentPassword, password: newPassword, passwordConfirm: newPassword });
      } catch (err) {
        throw authError(err, 'Mot de passe actuel incorrect ou nouveau mot de passe invalide.');
      }
    },
    // Inscription : le rôle n'est jamais envoyé (imposé à « user » par le serveur). Si l'adresse est déjà
    // utilisée, on ne le révèle pas : le code est envoyé à son propriétaire et l'inscription s'arrête là.
    // Prénom et nom enregistrés dès la création (1.3.24) : une inscription interrompue avant le code garde son nom.
    async register({ email, password, first_name, last_name } = {}) {
      const address = String(email || '').trim();
      const nom = {};
      if (typeof first_name === 'string' && first_name.trim()) nom.first_name = first_name.trim().slice(0, 100);
      if (typeof last_name === 'string' && last_name.trim()) nom.last_name = last_name.trim().slice(0, 100);
      try {
        await users().create({ email: address, password, passwordConfirm: password, emailVisibility: false, ...nom });
      } catch (err) {
        const fields = err?.response?.data || {};
        const onlyEmailTaken = err?.status === 400 && fields.email && Object.keys(fields).length === 1;
        if (!onlyEmailTaken) throw authError(err, 'Inscription impossible. Vérifiez l’adresse et le mot de passe (8 caractères minimum).');
      }
      // Mot de passe gardé en mémoire seulement (jamais stocké) pour le poser après la vérification du code.
      signupPasswords.set(address.toLowerCase(), password);
      await sendOtp(address);
      return {};
    },
    async verifyOtp({ email, otpCode } = {}) {
      const address = String(email || '').trim();
      const otpId = readOtp(address);
      if (!otpId) throw new BackendError('Code expiré : demandez un nouveau code.', 400, 'otp_missing', null);
      let res;
      try {
        res = await users().authWithOTP(otpId, String(otpCode || '').trim());
      } catch (err) {
        throw authError(err, 'Code invalide ou expiré.');
      }
      forgetOtp(address);
      // Inscription : PocketBase remplace le mot de passe d'un compte qui se vérifie par code ;
      // on pose celui choisi à l'écran d'inscription (route serveur, une seule fois, 10 minutes).
      const password = signupPasswords.get(address.toLowerCase());
      if (password) {
        signupPasswords.delete(address.toLowerCase());
        try {
          const set = await invokeFn('setSignupPassword', { password });
          pb.authStore.save(set.data.token, set.data.record);
          return { access_token: set.data.token, user: fromRecord('User', set.data.record) };
        } catch {
          // Délai dépassé ou compte déjà vérifié : la session OTP reste valable ; « Mot de passe oublié » reste possible.
        }
      }
      return { access_token: res.token, user: fromRecord('User', res.record) };
    },
    async resendOtp(email) {
      await sendOtp(String(email || '').trim());
      return {};
    },
    async resetPasswordRequest(email) {
      try {
        await users().requestPasswordReset(String(email || '').trim());
      } catch (err) {
        // Réponse neutre : on ne signale que la limite de tentatives.
        if (err?.status === 429) throw authError(err, '');
      }
      return {};
    },
    async resetPassword({ resetToken, newPassword } = {}) {
      try {
        await users().confirmPasswordReset(resetToken, newPassword, newPassword);
      } catch (err) {
        throw authError(err, 'Le lien est invalide ou expiré, ou le mot de passe est trop court (8 caractères minimum).');
      }
      return {};
    },
    logout(redirectUrl) {
      pb.authStore.clear();
      if (typeof window !== 'undefined') window.location.href = redirectUrl || window.location.href;
    },
    redirectToLogin(nextUrl) {
      if (typeof window === 'undefined') throw new Error('redirectToLogin : navigateur requis');
      // La page /login lit ?returnTo= (chemin de la même origine) : voir src/lib/authReturnTo.js.
      const target = new URL(nextUrl || window.location.href, window.location.origin);
      const path = target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/';
      window.location.href = path && path !== '/' ? `/login?returnTo=${encodeURIComponent(path)}` : '/login';
    },
  });

  // ── Codes à usage unique (OTP) : identifiant mémorisé par adresse ────────────
  const otpIds = new Map();
  const signupPasswords = new Map(); // mémoire uniquement : perdu si la page est rechargée
  const otpKey = (email) => `pocketbase_otp:${email.toLowerCase()}`;
  function readOtp(email) {
    if (otpIds.has(email.toLowerCase())) return otpIds.get(email.toLowerCase());
    try { return globalThis.sessionStorage?.getItem(otpKey(email)) || null; } catch { return null; }
  }
  function forgetOtp(email) {
    otpIds.delete(email.toLowerCase());
    try { globalThis.sessionStorage?.removeItem(otpKey(email)); } catch { /* indisponible */ }
  }
  async function sendOtp(email) {
    let res;
    try {
      res = await users().requestOTP(email);
    } catch (err) {
      throw authError(err, 'Impossible d’envoyer le code. Réessayez.');
    }
    otpIds.set(email.toLowerCase(), res.otpId);
    try { globalThis.sessionStorage?.setItem(otpKey(email), res.otpId); } catch { /* indisponible */ }
  }

  // ── integrations.Core.UploadFile ───────────────────────────────────────────
  // Fichier (membre : images et audio, 15 Mo) ou FichierAdmin (admin : 100 Mo). Le serveur impose le
  // propriétaire, un nom aléatoire, la taille et le type réel. Réponse au format Base44 : { file_url }.
  const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
  async function uploadFile({ file } = {}) {
    if (!file || typeof file !== 'object' || typeof file.size !== 'number') throw new TranslationError('UploadFile : fichier manquant');
    const user = pb.authStore?.record;
    if (!pb.authStore?.token || !user) throw authRequiredError();
    const collection = user.role === 'admin' ? 'FichierAdmin' : 'Fichier';
    const name = file.name || `fichier.${EXT_BY_TYPE[file.type] || 'bin'}`;
    const form = new FormData();
    form.append('fichier', file, name);
    let record;
    try {
      record = await pb.collection(collection).create(form);
    } catch (err) {
      const code = err?.response?.data?.fichier?.code || '';
      const max = collection === 'FichierAdmin' ? '100 Mo' : '15 Mo';
      if (code === 'validation_file_size_limit' || err?.status === 413) throw new BackendError(`Fichier trop volumineux (max ${max})`, 413, 'file_too_large', null, err);
      if (code === 'validation_invalid_mime_type') throw new BackendError('Type de fichier non autorisé', 415, 'file_type_not_allowed', null, err);
      throw wrapError(err);
    }
    return { file_url: pb.files.getURL(record, record.fichier) };
  }

  // ── functions ──────────────────────────────────────────────────────────────
  const functions = notMigratedProxy('functions', {
    async invoke(name, data) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9_]+$/.test(name)) throw new TranslationError('nom de fonction invalide');
      if (typeof data === 'string') {
        throw new Error(`Function ${name} must receive an object with named parameters, received: ${data}`);
      }
      const hasFile = typeof FormData !== 'undefined' && (data instanceof FormData
        || (data && typeof File !== 'undefined' && Object.values(data).some((v) => v instanceof File)));
      if (hasFile) throw new NotMigratedError(`functions.invoke("${name}") avec fichier`);

      const url = `${apiBase}/api/fn/${name}`;
      const headers = { 'Content-Type': 'application/json' };
      if (pb.authStore?.token) headers.Authorization = pb.authStore.token;
      let res;
      try {
        res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(data ?? {}) });
      } catch (err) {
        throw new BackendError(`Fonction serveur « ${name} » injoignable (${url}).`, 0, 'network_error', null, err);
      }
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      // 404 sans { error } : réponse de PocketBase lui-même, la route n'existe pas.
      // 404 avec { error } : réponse de la fonction (ex. « audio track not found »).
      if (res.status === 404 && !(body && 'error' in body)) {
        throw new BackendError(
          `Fonction serveur « ${name} » pas encore migrée : la route POST /api/fn/${name} n'existe pas sur PocketBase.`,
          404, 'function_not_migrated', body,
        );
      }
      if (!res.ok) {
        // Même construction du message que le SDK Base44 (Base44Error) ; le client lit aussi error.data.error.
        const message = body?.error?.message || body?.message || body?.detail || `Request failed with status code ${res.status}`;
        throw new BackendError(message, res.status, body?.error?.code ?? body?.code ?? null, body);
      }
      return { data: body, status: res.status, headers: res.headers };
    },
  });

  return {
    backend: 'pocketbase',
    pb,
    entities,
    auth,
    functions,
    integrations: new Proxy({}, {
      get(_, pkg) {
        if (typeof pkg !== 'string' || pkg === 'then' || pkg.startsWith('_')) return undefined;
        if (pkg === 'Core') return notMigratedProxy('integrations.Core', { UploadFile: uploadFile });
        return notMigratedProxy(`integrations.${pkg}`);
      },
    }),
    users: notMigratedProxy('users', {
      // Invitation (ou promotion) par un admin : route serveur inviteUser.
      inviteUser(userEmail, role) {
        return invokeFn('inviteUser', { user_email: userEmail, role });
      },
    }),
    app: notMigratedProxy('app', {
      // AuthContext l'appelle au démarrage : réglages neutres, aucune requête.
      async getPublicSettings() {
        return { id: null, public_settings: {}, backend: 'pocketbase' };
      },
    }),
    config: {
      backend: 'pocketbase',
      serverUrl: apiBase,
      get token() {
        return pb.authStore?.token || null;
      },
    },
  };
}
