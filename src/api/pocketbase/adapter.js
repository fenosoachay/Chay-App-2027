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

export function createPocketBaseAdapter(pb, { baseUrl, fetchImpl, now = () => new Date() } = {}) {
  const apiBase = String(baseUrl || pb.baseURL || '').replace(/\/+$/, '');
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const currentUserId = () => pb.authStore?.record?.id || null;

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
        const body = toRecord(entity, data, { isCreate: true, userId: currentUserId(), now: now() });
        return map(await guard(col().create(body)));
      },
      async update(id, data) {
        return map(await guard(col().update(id, toRecord(entity, data, { now: now() }))));
      },
      async delete(id) {
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
      const res = await guard(users().authWithPassword(email, password));
      return { access_token: res.token, user: fromRecord('User', res.record) };
    },
    setToken(token) {
      if (!token || token === pb.authStore.token) return;
      pb.authStore.save(token, pb.authStore.record ?? null);
    },
    async updateMe(data) {
      const id = currentUserId();
      if (!id) throw authRequiredError();
      return fromRecord('User', await guard(users().update(id, toRecord('User', data))));
    },
    logout(redirectUrl) {
      pb.authStore.clear();
      if (typeof window !== 'undefined') window.location.href = redirectUrl || window.location.href;
    },
    redirectToLogin(nextUrl) {
      if (typeof window === 'undefined') throw new Error('redirectToLogin : navigateur requis');
      const from = nextUrl ? new URL(nextUrl, window.location.origin).toString() : window.location.href;
      window.location.href = `/login?from_url=${encodeURIComponent(from)}`;
    },
  });

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
        return notMigratedProxy(`integrations.${pkg}`);
      },
    }),
    users: notMigratedProxy('users'),
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
