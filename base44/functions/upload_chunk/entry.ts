import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ─────────────────────────────────────────────────────────────────────────────
// upload_chunk — assemblage côté serveur des uploads morcelés/reprenables.
//
// Le frontend découpe les gros médias (films MP4 multi-Go) en chunks de 8 Mo
// et les poste ici un par un :
//   action=init      → ouvre la session, renvoie la liste des chunks déjà reçus
//                      (reprise automatique après coupure réseau ou reload).
//   action=chunk     → stocke un morceau en storage privé (UploadPrivateFile).
//   action=finalize  → concatène tous les morceaux, publie le fichier final via
//                      Core.UploadFile (URL publique lisible par le lecteur),
//                      puis nettoie les morceaux.
//
// Pourquoi ça tue le "[BUF] malloc failure (_ssl.c:2437)" / WriteTimeout :
// aucune requête ne transporte plus plusieurs Go dans un seul buffer SSL ;
// chaque POST reste ~8 Mo, le serveur n'alloue jamais le fichier entier d'un
// coup, et les timeouts d'écriture deviennent impossibles.
//
// Sécurité : admin only (RLS du projet = rôle "admin"), sessions expirées
// après 24 h, taille max dure rejetée avant toute écriture.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSIONS_ENTITY = 'UploadSession';
const CHUNKS_ENTITY = 'UploadChunk';

async function requireAdmin(base44: any) {
  let user: any = null;
  try { user = await base44.auth.me(); } catch {}
  if (!user || user.role !== 'admin') return null;
  return user;
}

export default async function (req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await requireAdmin(base44);
  if (!user) return Response.json({ error: 'Unauthorized: admin requis' }, { status: 401 });

  const contentType = req.headers.get('content-type') || '';

  // ── JSON actions : init / finalize ────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body.session_id || '');
    if (!sessionId) return Response.json({ error: 'session_id requis' }, { status: 400 });

    if (body.action === 'init') {
      const size = Number(body.size) || 0;
      if (size <= 0) return Response.json({ error: 'taille invalide' }, { status: 400 });
      if (size > MAX_FILE_BYTES) {
        return Response.json({ error: `Fichier trop volumineux (max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024 / 1024)} Go)` }, { status: 413 });
      }
      let session = await base44.asServiceRole.entities[SESSIONS_ENTITY].filter({ session_id: sessionId }).catch(() => []);
      if (!session?.length) {
        session = [await base44.asServiceRole.entities[SESSIONS_ENTITY].create({
          session_id: sessionId,
          name: String(body.name || 'file'),
          size,
          uploaded_indices: [],
          created_by: user.id,
          expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        })];
      } else if (Date.now() - new Date(session[0].created_date).getTime() > SESSION_TTL_MS) {
        // Session périmée → on repart de zéro proprement.
        await cleanupChunks(base44, sessionId);
        await base44.asServiceRole.entities[SESSIONS_ENTITY].update(session[0].id, { uploaded_indices: [] });
        session[0].uploaded_indices = [];
      }
      return Response.json({ ok: true, uploaded: session[0].uploaded_indices || [] });
    }

    if (body.action === 'finalize') {
      const sessionList = await base44.asServiceRole.entities[SESSIONS_ENTITY].filter({ session_id: sessionId }).catch(() => []);
      const session = sessionList?.[0];
      if (!session) return Response.json({ error: 'session inconnue' }, { status: 404 });

      const chunks = await base44.asServiceRole.entities[CHUNKS_ENTITY].filter(
        { session_id: sessionId }, 'index', 100000,
      ).catch(() => []);
      if (!chunks?.length) return Response.json({ error: 'aucun morceau reçu' }, { status: 400 });

      // Reconstruction séquentielle du fichier à partir des URIs privés.
      const parts: BlobPart[] = [];
      for (const c of chunks.sort((a: any, b: any) => a.index - b.index)) {
        const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: c.file_uri, expires_in: 600,
        });
        const res = await fetch(signed_url);
        if (!res.ok) return Response.json({ error: `morceau ${c.index} illisible` }, { status: 500 });
        parts.push(await res.arrayBuffer());
      }
      const assembled = new Blob(parts, { type: 'video/mp4' });
      const file = new File([assembled], String(body.name || session.name || 'film.mp4'), { type: 'video/mp4' });

      // Publication via le stockage public officiel → URL unique, CDN Base44.
      const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      await cleanupChunks(base44, sessionId);
      try { await base44.asServiceRole.entities[SESSIONS_ENTITY].delete(session.id); } catch {}
      return Response.json({ file_url });
    }

    return Response.json({ error: 'action inconnue' }, { status: 400 });
  }

  // ── multipart : chunk binaire ─────────────────────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return Response.json({ error: 'formulaire invalide' }, { status: 400 });
    if (form.get('action') !== 'chunk') return Response.json({ error: 'action invalide' }, { status: 400 });

    const sessionId = String(form.get('session_id') || '');
    const index = Number(form.get('index'));
    const total = Number(form.get('total'));
    const blob = form.get('chunk') as File | null;
    if (!sessionId || !Number.isInteger(index) || !blob) {
      return Response.json({ error: 'champs manquants' }, { status: 400 });
    }
    if (blob.size > 12 * 1024 * 1024) {
      return Response.json({ error: 'chunk trop gros (>12 Mo)' }, { status: 413 });
    }

    const existing = await base44.asServiceRole.entities[CHUNKS_ENTITY].filter({ session_id: sessionId, index }).catch(() => []);
    if (!existing?.length) {
      const file = new File([blob], `${sessionId}_${index}`, { type: 'application/octet-stream' });
      const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
      await base44.asServiceRole.entities[CHUNKS_ENTITY].create({
        session_id: sessionId, index, total, file_uri, created_by: user.id,
      });
    }
    const sessionList = await base44.asServiceRole.entities[SESSIONS_ENTITY].filter({ session_id: sessionId }).catch(() => []);
    const session = sessionList?.[0];
    if (session && !(session.uploaded_indices || []).includes(index)) {
      await base44.asServiceRole.entities[SESSIONS_ENTITY].update(session.id, {
        uploaded_indices: [...(session.uploaded_indices || []), index],
      });
    }
    return Response.json({ ok: true, index });
  }

  return Response.json({ error: 'content-type non supporté' }, { status: 415 });
}

async function cleanupChunks(base44: any, sessionId: string) {
  const chunks = await base44.asServiceRole.entities[CHUNKS_ENTITY].filter({ session_id: sessionId }).catch(() => []);
  for (const c of chunks || []) {
    try { await base44.asServiceRole.entities[CHUNKS_ENTITY].delete(c.id); } catch {}
  }
}
