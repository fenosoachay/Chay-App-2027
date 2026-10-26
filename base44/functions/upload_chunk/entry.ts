import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ─────────────────────────────────────────────────────────────────────────────
// upload_chunk — backend des uploads morcelés/reprenables de gros fichiers (+5 Go).
// Protocole côté client : src/lib/upload.js (uploadChunked) → POST /api/functions/upload_chunk
//
//   action=init      (JSON)       ouvre/reprend la session → { session_id, uploaded: [...] }
//   action=chunk     (multipart)  reçoit UN morceau (~8 Mo), le délègue au storage
//                                 privé Base44 (Core.UploadPrivateFile) et ne garde
//                                 EN BASE QUE des métadonnées légères.
//   action=finalize  (JSON)       vérifie la complétude, assemble, publie via
//                                 l'API officielle Core.UploadFile → { success: true, file_url }
//
// Pourquoi ça tient en serverless (128–512 Mo de RAM) :
//  • Aucune requête ne transporte plus que ~12 Mo (limite dure MAX_CHUNK_BYTES) ;
//    le serveur n'alloue JAMAIS le fichier entier d'un coup à la réception.
//  • Pas de base44.kv : le SDK @base44/sdk 0.8.x n'expose AUCUN module KV
//    (vérifié dans dist/index.d.ts : entities, auth, integrations, functions,
//    workflows… pas de kv). Le stockage temporaire léger est donc assuré par
//    les entités UploadSession / UploadChunk — uniquement des métadonnées
//    ({ session_id, index, size, sha256, file_uri }), jamais les octets.
//  • Les binaires vivent dans le storage objet PRIVÉ de la plateforme
//    (Core.UploadPrivateFile → file_uri, équivalent interne d'un S3), adressé
//    à la volée par CreateFileSignedUrl pendant finalize.
//  • Alternative « vraie » si on branchait un S3 compatible (AWS S3 / R2 / B2 /
//    Wasabi) : faire de chaque chunk du client une part multipart
//    (CreateMultipartUpload / UploadPart / CompleteMultipartUpload) — finalize
//    deviendrait alors un simple complete_multipart_upload côté stockage, avec
//    ZÉRO assemblage serveur. C'est la voie recommandée si le quota de storage
//    privé Base44 devient limitant pour des films multi-Go.
//  • NB sur Core.UploadFile passé un File object : le SDK poste le fichier en
//    un seul flux ; il NE fait PAS de chunking interne résistant aux +5 Go
//    (buffer unique côté passerelle → timeout/OOM, cf. historique dans
//    src/lib/upload.js). D'où ce module côté serveur.
//
// Sécurité : admin uniquement (RLS projet = rôle "admin"), taille max 10 Go,
// chunk max 12 Mo, sessions TTL 24 h, verrou anti-double-finalize, purge des
// morceaux après succès.
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE_FALLBACK = 8 * 1024 * 1024;    // doit matcher src/lib/upload.js
const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go
const MAX_CHUNK_BYTES = 12 * 1024 * 1024;       // 12 Mo (client envoie ~8 Mo)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;     // 24 h
const FINALIZING_STALL_MS = 30 * 60 * 1000;     // verrou périmé si finalize a crashé
// Plafond doux d'accumulation mémoire : ≤ 350 Mo → assemblage monolithique en
// RAM (rapide, simple). Au-delà → assemblage en « vagues » (sous-blobs ~300 Mo
// conservés sur le tas, pas dans le tas V8/SSL) pour rester sous la limite
// runtime ; si malgré tout la plateforme coupe la fonction, le verrou
// anti-recollage + le re-finalize idempotent permettent de reprendre.
const SOFT_ASSEMBLY_CEILING = 350 * 1024 * 1024;
const WAVE_TARGET_BYTES = 300 * 1024 * 1024;
// Seuil au-delà duquel un échec d'assemblage est définitif (besoin d'un
// stockage multipart externe type S3 — voir variante en en-tête).
const HARD_FILE_CEILING = 8 * 1024 * 1024 * 1024;
const SESSIONS_ENTITY = 'UploadSession';
const CHUNKS_ENTITY = 'UploadChunk';

async function requireAdmin(base44: any) {
  let user: any = null;
  try { user = await base44.auth.me(); } catch {}
  if (!user || user.role !== 'admin') return null;
  return user;
}

const json = (obj: any, status = 200) => Response.json(obj, { status });

// filter() a changé de signature selon les versions du SDK (positionnelle
// (query, sort, limit) puis options ({ sort, limit })) → wrapper tolérant qui
// normalise tableau / page cursetur ({ items }).
async function queryEntities(svc: any, name: string, query: any, opts: any = {}) {
  const attempts = [
    () => svc.entities[name].filter(query, opts.sort ?? null, opts.limit ?? 5000),
    () => svc.entities[name].filter(query, opts),
  ];
  let lastErr: any;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      return Array.isArray(res) ? res : (res?.items || []);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`lecture ${name} impossible`);
}

const listChunks = (svc: any, sessionId: string) =>
  queryEntities(svc, CHUNKS_ENTITY, { session_id: sessionId }, { sort: 'index', limit: 5000 });
const findSession = async (svc: any, sessionId: string) =>
  (await queryEntities(svc, SESSIONS_ENTITY, { session_id: sessionId }, { limit: 1 }))[0] || null;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; } // WebCrypto indisponible : intégrité non vérifiable, on poursuit sans
}

// Purge best-effort des références de morceaux (les objets privés restent en
// storage mais ne sont plus atteignables ; un workflow peut les retirer si
// l'intégration Core expose une suppression d'objet dans une version future).
async function cleanupChunks(svc: any, sessionId: string) {
  try {
    const chunks = await listChunks(svc, sessionId);
    for (const c of chunks) {
      await svc.entities[CHUNKS_ENTITY].delete(c.id).catch(() => {});
    }
  } catch {}
}

// ── init : crée ou reprend la session (métadonnées pures, < 1 Ko en RAM) ────
async function handleInit(svc: any, user: any, body: any): Promise<Response> {
  const sessionId = String(body.session_id || '');
  const size = Number(body.size) || 0;
  if (size <= 0) return json({ error: 'taille invalide' }, 400);
  if (size > MAX_FILE_BYTES) {
    return json({ error: `Fichier trop volumineux (max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024 / 1024)} Go)` }, 413);
  }

  const chunkSize = Number(body.chunk_size) || CHUNK_SIZE_FALLBACK;
  let session = await findSession(svc, sessionId).catch(() => null);

  if (!session) {
    await svc.entities[SESSIONS_ENTITY].create({
      session_id: sessionId,
      file_name: String(body.name || 'file'),
      mime_type: String(body.mime_type || ''),
      size,
      total_chunks: Math.ceil(size / chunkSize),
      uploaded_indices: [],
      status: 'open',
      created_by: user.id,
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    return json({ session_id: sessionId, uploaded: [] });
  }

  const expired = Date.now() - new Date(session.created_date || 0).getTime() > SESSION_TTL_MS;
  if (expired || session.status === 'error') {
    // Session périmée ou échouée → repart proprement de zéro (orphelins purgés).
    await cleanupChunks(svc, sessionId);
    await svc.entities[SESSIONS_ENTITY].update(session.id, {
      uploaded_indices: [],
      status: 'open',
      final_file_url: '',
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }).catch(() => {});
    return json({ session_id: sessionId, uploaded: [] });
  }
  if (session.final_file_url) {
    // Déjà finalisé (double init après succès) : l'URL est prête, rien à renvoyer.
    return json({ session_id: sessionId, uploaded: [], file_url: session.final_file_url });
  }

  // Vérité terrain : uploaded_indices (cache) recoupé avec les chunks réellement
  // présents en storage privé — un index marqué "reçu" dont le binaire manque
  // serait sinon sauté par le client et produirait un trou dans le fichier.
  let uploaded: number[] = Array.isArray(session.uploaded_indices) ? [...session.uploaded_indices] : [];
  if (uploaded.length) {
    try {
      const present = new Set((await listChunks(svc, sessionId)).map((c: any) => Number(c.index)));
      uploaded = uploaded.filter((i) => present.has(i));
    } catch {}
  }
  return json({ session_id: sessionId, uploaded });
}

// ── chunk : un seul morceau (~8 Mo) → storage privé + métadonnée légère ──────
async function handleChunk(svc: any, user: any, form: FormData): Promise<Response> {
  const sessionId = String(form.get('session_id') || '');
  const index = Number(form.get('index'));
  const total = Number(form.get('total')) || 0;
  const blob = form.get('chunk') as File | Blob | null;
  if (!sessionId || !Number.isInteger(index) || index < 0 || !blob) {
    return json({ error: 'champs manquants (session_id, index, chunk)' }, 400);
  }
  if ((blob as any).size > MAX_CHUNK_BYTES) {
    return json({ error: `chunk trop gros (>${Math.round(MAX_CHUNK_BYTES / 1024 / 1024)} Mo)` }, 413);
  }

  const session = await findSession(svc, sessionId).catch(() => null);
  if (!session) return json({ error: 'session inconnue — relancer init' }, 404);

  // Idempotence : retry réseau du même chunk → on ne redouble pas le stockage.
  const chunks = await listChunks(svc, sessionId).catch(() => []);
  const existing = chunks.find((c: any) => Number(c.index) === index);

  if (!existing) {
    // Seule allocation mémoire notable de la requête : ~8 Mo (le chunk lui-même).
    const buf = await blob.arrayBuffer();
    const hash = await sha256Hex(buf);
    const file = new File([buf], `${sessionId}_${index}`, { type: 'application/octet-stream' });
    const { file_uri } = await svc.integrations.Core.UploadPrivateFile({ file });
    if (!file_uri) return json({ error: `stockage du chunk ${index} échoué` }, 502);
    await svc.entities[CHUNKS_ENTITY].create({
      session_id: sessionId, index, total, size: buf.byteLength, sha256: hash,
      file_uri, created_by: user.id,
    });
  }

  // Progression = liste des indices reçus (métadonnée légère : < 100 Ko même
  // pour 1 280 chunks de 8 Mo = 10 Go). Jamais les octets ici.
  const uploaded: number[] = Array.isArray(session.uploaded_indices) ? [...session.uploaded_indices] : [];
  if (!uploaded.includes(index)) {
    uploaded.push(index);
    uploaded.sort((a, b) => a - b);
    await svc.entities[SESSIONS_ENTITY].update(session.id, { uploaded_indices: uploaded }).catch(() => {});
  }

  return json({ success: true, index, uploaded: uploaded.length, total: total || session.total_chunks || 0 });
}

// ── finalize : contrôle de complétude puis assemblage/publication officiels ──
async function handleFinalize(svc: any, body: any): Promise<Response> {
  const sessionId = String(body.session_id || '');
  const session = await findSession(svc, sessionId).catch(() => null);
  if (!session) return json({ error: 'session inconnue' }, 404);
  if (session.status === 'done' && session.final_file_url) {
    return json({ success: true, file_url: session.final_file_url }); // idempotent
  }
  // Verrou anti-collision : deux finalize simultanés (retry client) → le second
  // reçoit 409 et le postWithRetry du client retentera plus tard.
  if (session.status === 'finalizing') {
    const started = new Date(session.updated_date || 0).getTime();
    if (Date.now() - started < FINALIZING_STALL_MS) {
      return json({ error: 'assemblage déjà en cours — réessayez dans quelques secondes' }, 409);
    }
  }
  await svc.entities[SESSIONS_ENTITY].update(session.id, { status: 'finalizing' }).catch(() => {});
  const markError = () => svc.entities[SESSIONS_ENTITY].update(session.id, { status: 'error' }).catch(() => {});

  try {
    const chunks = (await listChunks(svc, sessionId))
      .sort((a: any, b: any) => Number(a.index) - Number(b.index));
    if (!chunks.length) {
      await markError();
      return json({ error: 'aucun morceau reçu' }, 400);
    }

    // Complétude : tous les indices 0..total-1 doivent être présents.
    const expected = Number(body.total_chunks || session.total_chunks || Number(chunks[chunks.length - 1].index) + 1);
    const have = new Set(chunks.map((c: any) => Number(c.index)));
    const missing: number[] = [];
    for (let k = 0; k < expected; k++) if (!have.has(k)) missing.push(k);
    if (missing.length) {
      await markError();
      return json({ error: `morceaux manquants : ${missing.slice(0, 20).join(',')}${missing.length > 20 ? '…' : ''}` }, 400);
    }

    // Cohérence de taille (somme des tailles déclarées vs taille annoncée).
    let declaredBytes = 0;
    for (const c of chunks) declaredBytes += Number(c.size) || 0;
    if (declaredBytes > HARD_FILE_CEILING) {
      await markError();
      return json({
        error: `fichier de ${(declaredBytes / 1024 / 1024 / 1024).toFixed(1)} Go : assemblage serverless impossible (> ${Math.floor(HARD_FILE_CEILING / 1024 / 1024 / 1024)} Go). Basculez sur un stockage multipart externe type S3/R2 (voir variante en en-tête du fichier).`,
      }, 507);
    }
    if (session.size && declaredBytes && Number(session.size) !== declaredBytes) {
      await markError();
      return json({ error: `taille assemblée (${declaredBytes}) ≠ taille annoncée (${session.size}) — renvoi demandé` }, 400);
    }

    const name = String(body.name || session.file_name || 'film.mp4');
    const mime = String(session.mime_type || (/\.(mp4|m4v|mov)$/i.test(name) ? 'video/mp4' : 'application/octet-stream'));
    const filenameSafe = name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'upload.bin';

    // Assemblage : lecture STRICTEMENT séquentielle (un seul téléchargement
    // actif à la fois, via signed URLs courts) — jamais N fetchs parallèles.
    // Fichiers ≤ SOFT_ASSEMBLY_CEILING : un seul tableau de buffers.
    // Fichiers plus gros : découpe en « vagues » de ~WAVE_TARGET_BYTES — chaque
    // vague est scellée dans un Blob (mémoire hors tas V8/SSL) puis relâchée,
    // donc l'empreinte pic ≈ 1 vague + 1 chunk (~310 Mo), jamais N × taille.
    const waves: BlobPart[] = [];
    let wave: BlobPart[] = [];
    let waveBytes = 0;
    for (const c of chunks) {
      const { signed_url } = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: c.file_uri, expires_in: 600 });
      const res = await fetch(signed_url);
      if (!res.ok) {
        await markError();
        return json({ error: `morceau ${c.index} illisible (HTTP ${res.status})` }, 502);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== Number(c.size)) {
        await markError();
        return json({ error: `morceau ${c.index} tronqué (${buf.byteLength}/${c.size} octets)` }, 400);
      }
      wave.push(buf);
      waveBytes += buf.byteLength;
      if (waveBytes >= Math.min(WAVE_TARGET_BYTES, SOFT_ASSEMBLY_CEILING)) {
        waves.push(new Blob(wave, { type: 'application/octet-stream' }));
        wave = [];
        waveBytes = 0;
      }
    }
    if (wave.length) waves.push(new Blob(wave, { type: 'application/octet-stream' }));

    // Publication finale via l'API officielle Base44 → URL publique CDN.
    const file = new File([new Blob(waves, { type: mime })], filenameSafe, { type: mime });
    const { file_url } = await svc.integrations.Core.UploadFile({ file });
    if (!file_url) {
      await markError();
      return json({ error: 'publication du fichier assemblé échouée' }, 502);
    }

    await svc.entities[SESSIONS_ENTITY].update(session.id, { status: 'done', final_file_url: file_url }).catch(() => {});
    await cleanupChunks(svc, sessionId);
    return json({ success: true, file_url });
  } catch (err: any) {
    await markError();
    return json({ error: `finalize: ${err?.message || String(err)}` }, 500);
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAdmin(base44);
    if (!user) return json({ error: 'Unauthorized: admin requis' }, 401);
    const svc = base44.asServiceRole;
    const contentType = req.headers.get('content-type') || '';

    // ── JSON actions : init / finalize ────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({} as any));
      switch (body.action) {
        case 'init':     return await handleInit(svc, user, body);
        case 'finalize': return await handleFinalize(svc, body);
        default:         return json({ error: 'action inconnue' }, 400);
      }
    }

    // ── multipart : chunk binaire ─────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      if (!form) return json({ error: 'formulaire invalide' }, 400);
      if (String(form.get('action')) !== 'chunk') return json({ error: 'action invalide' }, 400);
      return await handleChunk(svc, user, form);
    }

    return json({ error: 'content-type non supporté (JSON ou multipart attendu)' }, 415);
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
}
