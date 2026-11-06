// Traduction Base44 -> PocketBase : noms de champs, filtres, tris, pagination,
// conversion des enregistrements. Fonctions pures (aucun appel réseau), testées
// par src/api/pocketbase/translate.test.js.

import { isArrayField, isDateOnlyField } from './schemaHints';

// ── Erreurs ──────────────────────────────────────────────────────────────────

/** Fonctionnalité Base44 pas encore disponible côté PocketBase. */
export class NotMigratedError extends Error {
  constructor(what) {
    super(`${what} : pas encore migré vers PocketBase.`);
    this.name = 'NotMigratedError';
    this.code = 'not_migrated';
    this.status = 501;
  }
}

/** Requête Base44 impossible à traduire fidèlement en filtre PocketBase. */
export class TranslationError extends Error {
  constructor(message) {
    super(`Traduction PocketBase impossible : ${message}`);
    this.name = 'TranslationError';
    this.code = 'translation_error';
  }
}

// ── Noms ─────────────────────────────────────────────────────────────────────

export const collectionName = (entity) => (entity === 'User' ? 'users' : entity);

const SYSTEM_FIELDS = {
  created_date: 'base44_created_date',
  updated_date: 'base44_updated_date',
  created_by: 'base44_created_by',
};
const USER_FIELDS = { full_name: 'name' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Nom de champ Base44 -> nom PocketBase. Les noms sont insérés tels quels dans
 * le filtre : seuls les identifiants simples sont acceptés (pas d'injection).
 */
export function toPbField(entity, field) {
  if (typeof field !== 'string') throw new TranslationError('nom de champ invalide');
  const name = field.startsWith('data.') ? field.slice(5) : field;
  if (!IDENT.test(name)) throw new TranslationError(`nom de champ non pris en charge : ${JSON.stringify(field)}`);
  if (SYSTEM_FIELDS[name]) return SYSTEM_FIELDS[name];
  if (entity === 'User' && USER_FIELDS[name]) return USER_FIELDS[name];
  return name;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const PB_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Date JS ou chaîne ISO -> format PocketBase "AAAA-MM-JJ HH:MM:SS.sssZ". */
export function toPbDate(value) {
  const d = value instanceof Date ? value : new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) throw new TranslationError('date invalide');
  return d.toISOString().replace('T', ' ');
}

/** Valeur de date PocketBase -> forme renvoyée par Base44. */
export function fromPbDate(value, dateOnly = false) {
  if (typeof value !== 'string' || value === '') return value === '' ? null : value;
  if (!PB_DATETIME.test(value)) return value;
  if (dateOnly && value.slice(11, 23) === '00:00:00.000') return value.slice(0, 10);
  return value.replace(' ', 'T');
}

/** Normalise une valeur de filtre ou d'écriture visant un champ date. */
function normalizeDateValue(entity, field, value) {
  if (typeof value !== 'string') return value instanceof Date ? toPbDate(value) : value;
  if (DATE_ONLY.test(value) && (isDateOnlyField(entity, field) || field.startsWith('base44_'))) {
    return `${value} 00:00:00.000Z`;
  }
  if (ISO_DATETIME.test(value)) return toPbDate(value);
  return value;
}

// ── Littéraux (même échappement que pb.filter() du SDK, sans RegExp.escape) ──

export function pbLiteral(value) {
  if (value === null || value === undefined) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TranslationError('nombre non fini');
      return String(value);
    case 'string':
      return JSON.stringify(value);
    default:
      if (value instanceof Date) return JSON.stringify(toPbDate(value));
      throw new TranslationError(`valeur de filtre non prise en charge (${Array.isArray(value) ? 'tableau' : typeof value})`);
  }
}

// ── Filtres ──────────────────────────────────────────────────────────────────

export const FILTER_TRUE = 'id != ""';
export const FILTER_FALSE = 'id = ""';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp);

/** « le tableau json contient la valeur » : recherche de l'élément sérialisé dans le texte json. */
function containsExpr(field, value) {
  if (value === null || value === undefined || typeof value === 'object') {
    throw new TranslationError(`« contient » sur ${field} : valeur scalaire attendue`);
  }
  return `${field} ~ ${pbLiteral(JSON.stringify(value))}`;
}

/** $regex -> motif LIKE ; seules les expressions sans métacaractère (hors ^ et $) sont acceptées. */
export function regexToLike(pattern) {
  const source = pattern instanceof RegExp ? pattern.source : pattern;
  if (typeof source !== 'string') throw new TranslationError('$regex : chaîne attendue');
  const start = source.startsWith('^');
  const end = source.endsWith('$') && !source.endsWith('\\$');
  const body = source.slice(start ? 1 : 0, end ? -1 : undefined);
  let text = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      const next = body[i + 1];
      if (next === undefined || /[A-Za-z0-9]/.test(next)) {
        throw new TranslationError(`$regex non traduisible (séquence \\${next ?? ''})`);
      }
      text += next;
      i++;
    } else if ('.*+?^$|()[]{}'.includes(c)) {
      throw new TranslationError(`$regex non traduisible (métacaractère « ${c} »)`);
    } else {
      text += c;
    }
  }
  return `${start ? '' : '%'}${text}${end ? '' : '%'}`;
}

function operatorExpr(entity, key, field, op, arg, array) {
  const lit = (v) => pbLiteral(normalizeDateValue(entity, field, v));
  switch (op) {
    case '$eq':
      return array ? containsExpr(field, arg) : `${field} = ${lit(arg)}`;
    case '$ne':
      return array ? `${field} !~ ${pbLiteral(JSON.stringify(arg))}` : `${field} != ${lit(arg)}`;
    case '$in':
    case '$nin': {
      if (!Array.isArray(arg)) throw new TranslationError(`${op} sur ${key} : tableau attendu`);
      if (!arg.length) return op === '$in' ? FILTER_FALSE : FILTER_TRUE;
      const parts = arg.map((v) => (op === '$in'
        ? (array ? containsExpr(field, v) : `${field} = ${lit(v)}`)
        : (array ? `${field} !~ ${pbLiteral(JSON.stringify(v))}` : `${field} != ${lit(v)}`)));
      return parts.length === 1 ? parts[0] : `(${parts.join(op === '$in' ? ' || ' : ' && ')})`;
    }
    case '$gt':
      return `${field} > ${lit(arg)}`;
    case '$gte':
      return `${field} >= ${lit(arg)}`;
    case '$lt':
      return `${field} < ${lit(arg)}`;
    case '$lte':
      return `${field} <= ${lit(arg)}`;
    case '$regex':
      return `${field} ~ ${pbLiteral(regexToLike(arg))}`;
    default:
      throw new TranslationError(`opérateur ${op} non pris en charge (champ ${key})`);
  }
}

function fieldCondition(entity, key, value) {
  const field = toPbField(entity, key);
  const array = isArrayField(entity, field);
  if (value instanceof RegExp) return `${field} ~ ${pbLiteral(regexToLike(value))}`;
  if (isPlainObject(value)) {
    const ops = Object.keys(value);
    if (!ops.length || ops.some((o) => !o.startsWith('$'))) {
      throw new TranslationError(`égalité sur un objet non prise en charge (champ ${key})`);
    }
    const parts = ops.filter((o) => o !== '$options').map((o) => operatorExpr(entity, key, field, o, value[o], array));
    return parts.length === 1 ? parts[0] : `(${parts.join(' && ')})`;
  }
  if (Array.isArray(value)) throw new TranslationError(`égalité sur un tableau entier non prise en charge (champ ${key})`);
  if (array) return value === null ? `${field} = null` : containsExpr(field, value);
  return `${field} = ${pbLiteral(normalizeDateValue(entity, field, value))}`;
}

/** Requête Base44 (style Mongo) -> filtre PocketBase. Renvoie "" si aucun critère. */
export function buildFilter(entity, query) {
  if (query === null || query === undefined) return '';
  if (!isPlainObject(query)) throw new TranslationError('la requête doit être un objet');
  const parts = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (key === '$or' || key === '$and') {
      if (!Array.isArray(value) || !value.length) throw new TranslationError(`${key} : tableau non vide attendu`);
      const subs = value.map((q) => buildFilter(entity, q) || FILTER_TRUE).map((s) => `(${s})`);
      parts.push(subs.length === 1 ? subs[0] : `(${subs.join(key === '$or' ? ' || ' : ' && ')})`);
    } else if (key.startsWith('$')) {
      throw new TranslationError(`opérateur ${key} non pris en charge`);
    } else {
      parts.push(fieldCondition(entity, key, value));
    }
  }
  return parts.join(' && ');
}

// ── Tris ─────────────────────────────────────────────────────────────────────

/** "-created_date" -> "-base44_created_date,-created" (repli sur la date PocketBase). */
export function buildSort(entity, sort) {
  if (sort === null || sort === undefined || sort === '') return undefined;
  if (typeof sort !== 'string') throw new TranslationError('tri : chaîne attendue');
  const out = [];
  for (const raw of sort.split(',')) {
    const s = raw.trim();
    if (!s) continue;
    const desc = s.startsWith('-');
    const name = s.replace(/^[-+]/, '');
    const field = toPbField(entity, name);
    const sign = desc ? '-' : '';
    out.push(`${sign}${field}`);
    if (field === 'base44_created_date') out.push(`${sign}created`);
    if (field === 'base44_updated_date') out.push(`${sign}updated`);
  }
  return out.length ? out.join(',') : undefined;
}

/** Liste de champs Base44 -> paramètre `fields` PocketBase (id et champs de date toujours inclus). */
export function buildFields(entity, fields) {
  if (fields === null || fields === undefined) return undefined;
  const list = Array.isArray(fields) ? fields : String(fields).split(',');
  const out = new Set(['id']);
  for (const f of list.map((x) => String(x).trim()).filter(Boolean)) {
    const pf = toPbField(entity, f);
    out.add(pf);
    if (pf === 'base44_created_date') out.add('created');
    if (pf === 'base44_updated_date') out.add('updated');
  }
  return [...out].join(',');
}

// ── Pagination ───────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 100; // comme DEFAULT_PAGE_LIMIT du SDK Base44
export const MAX_PER_PAGE = 1000;

/** skip/limit -> pages PocketBase : { perPage, startPage, offset, limit }. */
export function planPages(limit, skip) {
  const lim = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const sk = Number.isInteger(skip) && skip > 0 ? skip : 0;
  const perPage = lim <= MAX_PER_PAGE && sk % lim === 0 ? lim : MAX_PER_PAGE;
  const startPage = Math.floor(sk / perPage) + 1;
  return { perPage, startPage, offset: sk - (startPage - 1) * perPage, limit: lim };
}

// ── Enregistrements ──────────────────────────────────────────────────────────

/** Enregistrement PocketBase -> objet au format Base44. */
export function fromRecord(entity, rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const {
    collectionId, collectionName: _c, expand,
    created, updated, base44_created_date, base44_updated_date, base44_created_by,
    ...rest
  } = rec;
  const out = {};
  for (const [k, v] of Object.entries(rest)) out[k] = fromPbDate(v, isDateOnlyField(entity, k));
  out.created_date = fromPbDate(base44_created_date || created || '') ?? null;
  out.updated_date = fromPbDate(base44_updated_date || updated || '') ?? null;
  if (base44_created_by) out.created_by = base44_created_by;
  if (entity === 'User' && 'name' in out) out.full_name = out.name;
  return out;
}

/** Données Base44 -> corps d'écriture PocketBase. */
export function toRecord(entity, data, { isCreate = false, userId = null, now = new Date() } = {}) {
  if (!isPlainObject(data)) throw new TranslationError('les données à écrire doivent être un objet');
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || k in SYSTEM_FIELDS) continue; // champs système : non modifiables (comme Base44)
    if (k === 'id' && !isCreate) continue;
    if (k !== 'id' && !IDENT.test(k)) throw new TranslationError(`nom de champ non pris en charge : ${JSON.stringify(k)}`);
    const field = entity === 'User' && USER_FIELDS[k] ? USER_FIELDS[k] : k;
    out[field] = isDateOnlyField(entity, field) && typeof v === 'string' && DATE_ONLY.test(v) ? `${v} 00:00:00.000Z` : v;
  }
  // users : base44_* et created_by_id sont verrouillés par les règles ; on ne les envoie pas.
  if (entity !== 'User') {
    const stamp = toPbDate(now);
    if (isCreate) {
      out.base44_created_date = stamp;
      if (!('created_by_id' in out) && userId) out.created_by_id = userId;
    }
    out.base44_updated_date = stamp;
  }
  return out;
}
