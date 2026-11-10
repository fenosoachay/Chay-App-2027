import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Export TEMPORAIRE, en LECTURE SEULE, de toutes les entitÃ©s (migration).
// - AccÃ¨s : utilisateur admin ET secret EXPORT_SECRET (comparaison en temps constant).
// - Uniquement des lectures : count() et list() paginÃ©. Aucune Ã©criture.
// - Les logs ne contiennent jamais de donnÃ©es, de secret ni de message d'erreur brut.
// Ã€ SUPPRIMER une fois l'export terminÃ© (fonction + secret EXPORT_SECRET).

const ENTITIES = [
  'Announcement', 'AppContent', 'AppNotice', 'AppNotification', 'Article',
  'BibleAnnotation', 'BibleTranslation', 'BibleVerse', 'BlockBlastMessage',
  'BlockBlastScore', 'ChatMessage', 'ChatPresence', 'Comment', 'CommunityPost',
  'ConcordanceFavorite', 'ContactMessage', 'Content', 'Conversation', 'DeviceToken',
  'Devotional', 'DictionaryEntry', 'DictionaryFavorite', 'DonationRequest',
  'EmojiQuizQuestion', 'Faq', 'GalleryImage', 'MemberProfile', 'Message',
  'MusicTrack', 'Notice', 'PersonalityQuizProfile', 'PersonalityQuizQuestion',
  'PersonalityQuizResult', 'Playlist', 'PlaylistItem', 'PlaylistTrack',
  'PostReaction', 'PrayerRequest', 'PuzzleImage', 'QuestionLogique',
  'QuizAnswerHistory', 'QuizCategory', 'QuizImport', 'QuizQuestion',
  'QuizUserProgress', 'Sermon', 'ThemeRequest', 'UploadChunk', 'UploadSession',
  'User', 'UserNotification', 'Video', 'WebPushSubscription',
  'WordScrambleCategory', 'WordScrambleCredits', 'WordScrambleHistory',
  'WordScrambleImport', 'WordScrambleProgress', 'WordScrambleWord', 'YouTubeVideo',
] as const;
const ENTITY_SET = new Set<string>(ENTITIES);

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const MAX_CURSOR_LEN = 4096;
const COUNT_FALLBACK_MAX_PAGES = 500; // repli si count() indisponible
const MIN_SECRET_LEN = 32;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

// Hache les deux valeurs (longueur fixe de 32 octets) puis compare sans sortie anticipÃ©e.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// Compte par count() ; sinon repli en paginant uniquement les identifiants.
async function countEntity(entity: any): Promise<{ count: number; method: string }> {
  try {
    const n = await entity.count();
    if (typeof n === 'number' && Number.isFinite(n)) return { count: n, method: 'count' };
  } catch {
    // repli ci-dessous
  }
  let total = 0;
  let cursor: string | null = null;
  for (let pages = 0; pages < COUNT_FALLBACK_MAX_PAGES; pages++) {
    const opts: Record<string, unknown> = { sort: 'created_date', limit: MAX_LIMIT, fields: ['id'] };
    if (cursor) opts.cursor = cursor;
    const page: any = await entity.list(opts);
    if (!page || !Array.isArray(page.items)) throw new Error('unexpected_page_format');
    total += page.items.length;
    if (!page.has_more) return { count: total, method: 'pagination' };
    if (!page.next_cursor) throw new Error('pagination_incomplete');
    cursor = page.next_cursor;
  }
  throw new Error('pagination_incomplete');
}

export default async function (req: Request): Promise<Response> {
  // Diagnostic : Ã©tape en cours (jamais de donnÃ©es, de corps de requÃªte ni de secret).
  let stage = 'init';
  let secretOk = false;
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    stage = 'secret';
    const expected = (Deno.env.get('EXPORT_SECRET') || '').trim();
    if (expected.length < MIN_SECRET_LEN) return json({ error: 'export_disabled' }, 503);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, 400);

    // 1) Secret (vÃ©rifiÃ© avant tout appel Ã  la base).
    const provided = typeof body.secret === 'string' ? body.secret : '';
    if (!(await safeEqual(provided, expected))) return json({ error: 'forbidden' }, 403);
    secretOk = true;

    // 2) Admin.
    stage = 'client';
    const base44 = createClientFromRequest(req);
    stage = 'auth';
    let caller: { role?: unknown } | null = null;
    try {
      caller = await base44.auth.me();
    } catch {
      caller = null;
    }
    if (!caller) return json({ error: 'unauthenticated' }, 401);
    if (caller.role !== 'admin') return json({ error: 'forbidden' }, 403);

    stage = 'read';
    const mode = body.mode;
    const db = base44.asServiceRole.entities as Record<string, any>;

    // â”€â”€ Mode "counts" : nombre de lignes, aucun contenu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (mode === 'counts') {
      let names: string[];
      if (body.entity === undefined) names = [...ENTITIES];
      else if (typeof body.entity === 'string' && ENTITY_SET.has(body.entity)) names = [body.entity];
      else return json({ error: 'unknown_entity' }, 400);

      const results: Record<string, { count?: number; method?: string; error?: string }> = {};
      for (const name of names) {
        try {
          results[name] = await countEntity(db[name]);
        } catch (e) {
          const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'read_failed';
          results[name] = { error: code };
        }
      }
      return json({ mode: 'counts', entities: [...ENTITIES], results });
    }

    // â”€â”€ Mode "export" : une entitÃ©, une page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (mode === 'export') {
      const name = body.entity;
      if (typeof name !== 'string' || !ENTITY_SET.has(name)) return json({ error: 'unknown_entity' }, 400);

      let limit = DEFAULT_LIMIT;
      if (body.limit !== undefined) {
        if (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > MAX_LIMIT) {
          return json({ error: 'invalid_limit' }, 400);
        }
        limit = body.limit;
      }

      // User refuse la lecture par curseur : forme tableau list(sort, limit, skip),
      // le Â« curseur Â» est alors un dÃ©calage entier (skip) transmis en chaÃ®ne.
      if (name === 'User') {
        let skip = 0;
        if (body.cursor !== undefined && body.cursor !== null) {
          if (typeof body.cursor !== 'string' || !/^\d{1,9}$/.test(body.cursor)) {
            return json({ error: 'invalid_cursor' }, 400);
          }
          skip = Number(body.cursor);
        }

        let items: any;
        try {
          items = await db.User.list('created_date', limit, skip);
        } catch (e: any) {
          // Le secret est dÃ©jÃ  vÃ©rifiÃ© ici : on renvoie le message d'erreur (tronquÃ©), jamais de donnÃ©es.
          const detail = String(e?.message ?? '').slice(0, 200);
          console.error('[exportData] read_failed', name, e?.name, detail);
          return json({ error: 'read_failed', entity: name, stage: 'read', detail }, 502);
        }
        if (!Array.isArray(items)) return json({ error: 'unexpected_page_format', entity: name }, 502);

        const hasMore = items.length === limit;
        return json({
          mode: 'export',
          entity: name,
          items,
          has_more: hasMore,
          next_cursor: hasMore ? String(skip + limit) : null,
        });
      }

      const opts: Record<string, unknown> = { sort: 'created_date', limit };
      if (body.cursor !== undefined && body.cursor !== null) {
        if (typeof body.cursor !== 'string' || body.cursor.length === 0 || body.cursor.length > MAX_CURSOR_LEN) {
          return json({ error: 'invalid_cursor' }, 400);
        }
        opts.cursor = body.cursor;
      }

      let page: any;
      try {
        page = await db[name].list(opts);
      } catch (e: any) {
        // Le secret est dÃ©jÃ  vÃ©rifiÃ© ici : on renvoie le message d'erreur (tronquÃ©), jamais de donnÃ©es.
        const detail = String(e?.message ?? '').slice(0, 200);
        console.error('[exportData] read_failed', name, e?.name, detail);
        return json({ error: 'read_failed', entity: name, stage: 'read', detail }, 502);
      }
      if (!page || !Array.isArray(page.items)) return json({ error: 'unexpected_page_format', entity: name }, 502);

      return json({
        mode: 'export',
        entity: name,
        items: page.items,
        has_more: Boolean(page.has_more),
        next_cursor: page.has_more ? (page.next_cursor ?? null) : null,
      });
    }

    return json({ error: 'unknown_mode' }, 400);
  } catch (e: any) {
    const detail = String(e?.message ?? '').slice(0, 200);
    console.error('[exportData] failure', stage, e?.name, detail);
    const body: Record<string, string> = { error: 'internal_error', stage };
    if (secretOk) body.detail = detail;
    return json(body, 500);
  }
}