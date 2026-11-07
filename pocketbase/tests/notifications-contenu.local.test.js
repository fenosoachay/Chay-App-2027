// Bout en bout « nouveau contenu » : le VRAI src/lib/adminNotify.js (appelé par EntityCrud après l'ajout d'une
// vidéo, musique, prédication… et par AddYouTubeLinkModal) et le VRAI adaptateur PocketBase, contre le bac à sable.
// Bogue reproduit : notifyNewContent était appelé sans content_id -> HTTP 400 « content_id required ».
// Fonctionne quel que soit NOTIFICATIONS_MODE (off / test / on) : le mode ne filtre que push et e-mails.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const holder = vi.hoisted(() => ({ api: null }));
vi.mock('@/api/backendConfig', async (orig) => ({ ...(await orig()), BACKEND: 'pocketbase', IS_POCKETBASE: true }));
vi.mock('@/api/base44Client', () => ({ get base44() { return holder.api; } }));
const { notifyAdminUpload } = await import('@/lib/adminNotify');

const creds = Object.fromEntries(fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt', 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));

describe('notifyAdminUpload -> notifyNewContent (vrai adminNotify.js + vrai adaptateur)', () => {
  let su;
  let admin;
  const cleanup = { Video: [], Content: [], UserNotification: [] };
  let calls = [];

  beforeAll(async () => {
    su = new PocketBase(BASE);
    su.autoCancellation(false);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
    const pb = new PocketBase(BASE);
    pb.autoCancellation(false);
    admin = createPocketBaseAdapter(pb, { baseUrl: BASE });
    await retry429(() => admin.auth.loginViaEmailPassword(creds.admin.email, creds.admin.password));
    holder.api = admin;
    // Espion : statut et réponse de chaque appel à notifyNewContent (adminNotify avale les erreurs).
    const orig = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const r = await orig(url, init);
      if (String(url).includes('/api/fn/notifyNewContent')) {
        calls.push({ status: r.status, body: await r.clone().json().catch(() => null), sent: JSON.parse(init?.body || '{}') });
      }
      return r;
    });
  });

  afterEach(() => { calls = []; });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of cleanup.Content) {
      for (const n of await su.collection('UserNotification').getFullList({ filter: su.filter('notification_id = {:n}', { n: `content_${id}` }) })) {
        cleanup.UserNotification.push(n.id);
      }
    }
    for (const col of ['UserNotification', 'Content', 'Video']) for (const id of cleanup[col]) await su.collection(col).delete(id).catch(() => {});
  });

  const contentOf = async (resourceId, type) => {
    const list = await su.collection('Content').getFullList({ filter: su.filter('resource_id = {:r} && type = {:t}', { r: resourceId, t: type }) });
    for (const c of list) cleanup.Content.push(c.id);
    return list;
  };

  it('ancien appel (message + link, sans content_id) -> 400 « content_id required » (cause du bogue)', async () => {
    const r = await admin.functions.invoke('notifyNewContent', { message: 'x', link: '/media?cat=films', send_email: false }).catch((e) => e);
    expect(r.status).toBe(400);
    expect(calls[0]).toMatchObject({ status: 400, body: { error: 'content_id required' } });
  });

  it('admin ajoute une vidéo « Test » (catégorie films) -> Content créé, notifyNewContent 200, notifications créées', async () => {
    const video = await admin.entities.Video.create({ title: 'Test', category: 'films', video_url: `${BASE}/api/files/x/y/test.mp4` });
    cleanup.Video.push(video.id);

    // Comme EntityCrud.notifyPlaylistUpload pour une vidéo
    await notifyAdminUpload({ kind: 'film', title: 'Test', playlist: 'films', playlistId: '', contentId: video.id });

    const [content] = await contentOf(video.id, 'video');
    expect(content).toBeTruthy();
    expect(content.resource_type).toBe('Video');
    expect(content.description).toBe('Le film « Test » a été ajouté dans « films ».');

    expect(calls).toHaveLength(1);
    expect(calls[0].sent).toEqual({ content_id: content.id, send_email: false });
    expect(calls[0].status).toBe(200);
    expect(calls[0].body).toMatchObject({ sendEmail: false, emailsSent: 0 });
    expect(typeof calls[0].body.created).toBe('number');

    const rows = await su.collection('UserNotification').getFullList({ filter: su.filter('notification_id = {:n}', { n: `content_${content.id}` }) });
    expect(rows.length).toBe(calls[0].body.created);
    for (const n of rows) {
      expect(n).toMatchObject({ type: 'new_content', content_id: content.id, content_type: 'video', title: 'Nouveau : Test', message: 'Le film « Test » a été ajouté dans « films ».' });
    }
  });

  it('les autres écrans (musique, prédication, YouTube, article, galerie) -> 200 aussi', async () => {
    const kinds = [['music', 'audio'], ['sermon', 'predication'], ['youtube', 'youtube'], ['article', 'article'], ['gallery', 'gallery']];
    for (const [kind, type] of kinds) {
      const rid = `test${kind}${Date.now()}`.slice(0, 30);
      await notifyAdminUpload({ kind, title: `Essai ${kind}`, artist: 'Chorale', playlist: 'Louange', section: 'culte', contentId: rid });
      const [content] = await contentOf(rid, type);
      expect(content, kind).toBeTruthy();
      const call = calls.find((c) => c.sent.content_id === content.id);
      expect(call?.status, kind).toBe(200);
    }
  });
});
