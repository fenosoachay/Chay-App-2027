import { describe, expect, it } from 'vitest';
import {
  buildFields,
  buildFilter,
  buildSort,
  collectionName,
  FILTER_FALSE,
  FILTER_TRUE,
  fromPbDate,
  fromRecord,
  pbLiteral,
  planPages,
  regexToLike,
  toPbField,
  toRecord,
  TranslationError,
} from './translate';

describe('noms', () => {
  it('User -> users, autres entités inchangées', () => {
    expect(collectionName('User')).toBe('users');
    expect(collectionName('Message')).toBe('Message');
  });

  it('champs système et alias', () => {
    expect(toPbField('Message', 'created_date')).toBe('base44_created_date');
    expect(toPbField('Message', 'updated_date')).toBe('base44_updated_date');
    expect(toPbField('Message', 'created_by')).toBe('base44_created_by');
    expect(toPbField('Message', 'created_by_id')).toBe('created_by_id');
    expect(toPbField('Message', 'id')).toBe('id');
    expect(toPbField('User', 'full_name')).toBe('name');
    expect(toPbField('Message', 'full_name')).toBe('full_name');
    expect(toPbField('Message', 'data.user_id')).toBe('user_id');
  });

  it('refuse les noms de champ qui pourraient injecter du filtre', () => {
    for (const bad of ['a b', 'a||b', 'x = 1', 'a.b', '', '1abc', 'a"', '@request.auth.id']) {
      expect(() => toPbField('Message', bad)).toThrow(TranslationError);
    }
  });
});

describe('littéraux et échappement', () => {
  it('types simples', () => {
    expect(pbLiteral('abc')).toBe('"abc"');
    expect(pbLiteral(3)).toBe('3');
    expect(pbLiteral(true)).toBe('true');
    expect(pbLiteral(null)).toBe('null');
  });

  it('guillemets, antislash et tentatives d’injection restent dans la chaîne', () => {
    expect(pbLiteral('a"b')).toBe('"a\\"b"');
    expect(pbLiteral('a\\')).toBe('"a\\\\"');
    const evil = '" || id != "';
    expect(buildFilter('Message', { text: evil })).toBe('text = "\\" || id != \\""');
  });

  it('refuse NaN, Infinity et les objets', () => {
    expect(() => pbLiteral(NaN)).toThrow(TranslationError);
    expect(() => pbLiteral(Infinity)).toThrow(TranslationError);
    expect(() => pbLiteral({})).toThrow(TranslationError);
  });
});

describe('filtres', () => {
  it('requête vide ou absente', () => {
    expect(buildFilter('Message', undefined)).toBe('');
    expect(buildFilter('Message', {})).toBe('');
  });

  it('égalités combinées par &&, valeurs undefined ignorées', () => {
    expect(buildFilter('Comment', { post_id: 'p1', is_hidden: false, n: 2, x: undefined }))
      .toBe('post_id = "p1" && is_hidden = false && n = 2');
  });

  it('null', () => {
    expect(buildFilter('Comment', { parent_id: null })).toBe('parent_id = null');
  });

  it('$ne', () => {
    expect(buildFilter('DonationRequest', { is_read: { $ne: true } })).toBe('is_read != true');
  });

  it('$in / $nin, y compris listes vides', () => {
    expect(buildFilter('Content', { type: { $in: ['audio', 'video'] } })).toBe('(type = "audio" || type = "video")');
    expect(buildFilter('Content', { type: { $in: ['audio'] } })).toBe('type = "audio"');
    expect(buildFilter('Content', { type: { $in: [] } })).toBe(FILTER_FALSE);
    expect(buildFilter('Content', { type: { $nin: ['a', 'b'] } })).toBe('(type != "a" && type != "b")');
    expect(buildFilter('Content', { type: { $nin: [] } })).toBe(FILTER_TRUE);
  });

  it('comparaisons et combinaison d’opérateurs sur un champ', () => {
    expect(buildFilter('QuizQuestion', { level: { $gte: 2, $lt: 5 } })).toBe('(level >= 2 && level < 5)');
  });

  it('$or / $and imbriqués', () => {
    expect(buildFilter('WordScrambleWord', { $or: [{ word: 'a' }, { hint_phrase: 'b' }], difficulty: 'easy' }))
      .toBe('((word = "a") || (hint_phrase = "b")) && difficulty = "easy"');
    expect(buildFilter('Message', { $and: [{ a: 1 }, {}] })).toBe(`((a = 1) && (${FILTER_TRUE}))`);
    expect(() => buildFilter('Message', { $or: [] })).toThrow(TranslationError);
  });

  it('$regex -> ~ (contient, ancres, échappements, options ignorées)', () => {
    expect(buildFilter('QuizQuestion', { question: { $regex: 'jésus', $options: 'i' } })).toBe('question ~ "%jésus%"');
    expect(buildFilter('QuizQuestion', { question: { $regex: '^Abr' } })).toBe('question ~ "Abr%"');
    expect(buildFilter('QuizQuestion', { question: { $regex: 'ham$' } })).toBe('question ~ "%ham"');
    expect(buildFilter('QuizQuestion', { question: { $regex: 'a\\.b' } })).toBe('question ~ "%a.b%"');
    expect(buildFilter('QuizQuestion', { question: /dieu/i })).toBe('question ~ "%dieu%"');
    expect(regexToLike('x\\(y\\)')).toBe('%x(y)%');
  });

  it('$regex avec métacaractères : erreur explicite', () => {
    for (const p of ['a.*b', 'a|b', '[ab]', 'a+', '\\d+', '(x)']) {
      expect(() => buildFilter('QuizQuestion', { question: { $regex: p } })).toThrow(TranslationError);
    }
  });

  it('champs système et alias dans les filtres', () => {
    expect(buildFilter('Message', { created_by_id: 'u1' })).toBe('created_by_id = "u1"');
    expect(buildFilter('User', { full_name: 'Ana' })).toBe('name = "Ana"');
    expect(buildFilter('Message', { 'data.conversation_id': 'c1' })).toBe('conversation_id = "c1"');
  });

  it('champs tableau : égalité = « contient »', () => {
    expect(buildFilter('Conversation', { participant_ids: 'u1' })).toBe('participant_ids ~ "\\"u1\\""');
    expect(buildFilter('Conversation', { participant_ids: { $in: ['u1', 'u2'] } }))
      .toBe('(participant_ids ~ "\\"u1\\"" || participant_ids ~ "\\"u2\\"")');
    expect(buildFilter('Message', { read_by: { $ne: 'u1' } })).toBe('read_by !~ "\\"u1\\""');
  });

  it('dates : date seule et ISO converties au format PocketBase', () => {
    expect(buildFilter('Devotional', { reading_date: '2026-11-06' })).toBe('reading_date = "2026-11-06 00:00:00.000Z"');
    expect(buildFilter('Message', { created_date: { $gte: '2026-11-01T10:00:00Z' } }))
      .toBe('base44_created_date >= "2026-11-01 10:00:00.000Z"');
    expect(buildFilter('Message', { created_date: { $lt: '2026-11-01' } }))
      .toBe('base44_created_date < "2026-11-01 00:00:00.000Z"');
    expect(buildFilter('Message', { text: '2026-11-06' })).toBe('text = "2026-11-06"');
  });

  it('cas non pris en charge : erreur explicite, jamais de filtre approximatif silencieux', () => {
    expect(() => buildFilter('Message', { $nor: [] })).toThrow(TranslationError);
    expect(() => buildFilter('Message', { a: { $exists: true } })).toThrow(TranslationError);
    expect(() => buildFilter('Message', { a: { b: 1 } })).toThrow(TranslationError);
    expect(() => buildFilter('Message', { a: [1, 2] })).toThrow(TranslationError);
    expect(() => buildFilter('Message', 'text = "x"')).toThrow(TranslationError);
  });
});

describe('tris', () => {
  it('created_date / updated_date avec repli sur created / updated', () => {
    expect(buildSort('Message', '-created_date')).toBe('-base44_created_date,-created');
    expect(buildSort('Message', 'created_date')).toBe('base44_created_date,created');
    expect(buildSort('Message', '-updated_date')).toBe('-base44_updated_date,-updated');
  });

  it('autres champs, multiples, alias User', () => {
    expect(buildSort('Devotional', '-reading_date')).toBe('-reading_date');
    expect(buildSort('Article', 'order,-title')).toBe('order,-title');
    expect(buildSort('Article', '+order')).toBe('order');
    expect(buildSort('User', 'full_name')).toBe('name');
  });

  it('vide -> undefined ; nom invalide -> erreur', () => {
    expect(buildSort('Article', undefined)).toBeUndefined();
    expect(buildSort('Article', '')).toBeUndefined();
    expect(() => buildSort('Article', '-a;drop')).toThrow(TranslationError);
  });
});

describe('champs sélectionnés', () => {
  it('id toujours inclus, dates mappées', () => {
    expect(buildFields('Message', ['text', 'created_date'])).toBe('id,text,base44_created_date,created');
    expect(buildFields('Message', 'text')).toBe('id,text');
    expect(buildFields('Message', undefined)).toBeUndefined();
  });
});

describe('pagination', () => {
  it('skip multiple de limit : une page exacte', () => {
    expect(planPages(50, 0)).toEqual({ perPage: 50, startPage: 1, offset: 0, limit: 50 });
    expect(planPages(50, 100)).toEqual({ perPage: 50, startPage: 3, offset: 0, limit: 50 });
  });

  it('skip non aligné ou limit > 1000 : pages de 1000 + décalage', () => {
    expect(planPages(30, 45)).toEqual({ perPage: 1000, startPage: 1, offset: 45, limit: 30 });
    expect(planPages(5000, 0)).toEqual({ perPage: 1000, startPage: 1, offset: 0, limit: 5000 });
    expect(planPages(20, 2010)).toEqual({ perPage: 1000, startPage: 3, offset: 10, limit: 20 });
  });

  it('limite par défaut 100', () => {
    expect(planPages(undefined, undefined)).toEqual({ perPage: 100, startPage: 1, offset: 0, limit: 100 });
  });
});

describe('enregistrements', () => {
  it('fromRecord : champs Base44 reconstitués, champs PocketBase retirés', () => {
    const out = fromRecord('Message', {
      id: 'a'.repeat(24),
      collectionId: 'pbc_1',
      collectionName: 'Message',
      text: 'x',
      created_by_id: 'u1',
      base44_created_date: '2026-01-02 03:04:05.678Z',
      base44_updated_date: '',
      base44_created_by: '',
      created: '2026-11-06 10:00:00.000Z',
      updated: '2026-11-06 11:00:00.000Z',
    });
    expect(out).toEqual({
      id: 'a'.repeat(24),
      text: 'x',
      created_by_id: 'u1',
      created_date: '2026-01-02T03:04:05.678Z',
      updated_date: '2026-11-06T11:00:00.000Z',
    });
  });

  it('fromRecord : dates seules, User.full_name', () => {
    const out = fromRecord('Devotional', { id: 'x', reading_date: '2026-11-06 00:00:00.000Z', published_at: '' });
    expect(out.reading_date).toBe('2026-11-06');
    expect(out.published_at).toBeNull();
    expect(fromRecord('User', { id: 'u', name: 'Ana' }).full_name).toBe('Ana');
  });

  it('fromPbDate', () => {
    expect(fromPbDate('2026-11-06 10:00:00.000Z')).toBe('2026-11-06T10:00:00.000Z');
    expect(fromPbDate('texte')).toBe('texte');
  });

  it('toRecord : création -> created_by_id et dates base44 ; champs système ignorés', () => {
    const now = new Date('2026-11-06T10:00:00.000Z');
    expect(toRecord('Comment', { text: 'x', created_date: 'z', created_by: 'e', updated_date: 'y' }, { isCreate: true, userId: 'u1', now }))
      .toEqual({
        text: 'x',
        created_by_id: 'u1',
        base44_created_date: '2026-11-06 10:00:00.000Z',
        base44_updated_date: '2026-11-06 10:00:00.000Z',
      });
  });

  it('toRecord : created_by_id fourni conservé ; id ignoré en mise à jour', () => {
    const now = new Date('2026-11-06T10:00:00.000Z');
    expect(toRecord('Comment', { created_by_id: 'u2', id: 'i' }, { isCreate: true, userId: 'u1', now }).created_by_id).toBe('u2');
    expect(toRecord('Comment', { id: 'i', text: 't' }, { now })).toEqual({ text: 't', base44_updated_date: '2026-11-06 10:00:00.000Z' });
  });

  it('toRecord : User (full_name -> name, date seule, aucun champ verrouillé envoyé)', () => {
    expect(toRecord('User', { full_name: 'Ana', birth_date: '1990-05-01' }, { isCreate: false, userId: 'u1' }))
      .toEqual({ name: 'Ana', birth_date: '1990-05-01 00:00:00.000Z' });
  });

  it('toRecord : refuse un nom de champ invalide', () => {
    expect(() => toRecord('Comment', { 'a b': 1 })).toThrow(TranslationError);
  });
});
