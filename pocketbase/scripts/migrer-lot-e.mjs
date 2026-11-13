#!/usr/bin/env node
// Migration de schéma du lot E (1.3.6), idempotente. Ne supprime ni ne modifie aucune donnée existante :
// elle ajoute des collections, des champs et quelques enregistrements de départ (seulement s'ils manquent).
//
// Contenu (une section par point du lot) :
//  (1) GameCategory (2 catégories, noms modifiables par l'admin) et GameClassement (un jeu = une catégorie) ;
//  (2) ChristianNews : Multimédia › « Actualité chrétienne » (lecture : membres ; écriture : admins) ;
//  (3) Wallpaper : Multimédia › « Fond d'écran » (photo jusqu'à 200 Mo, vignette thumb_url) ;
//  (4) MissionRequest : Requêtes › « Se missionner » (création par la route createMissionRequest ; admins seulement) ;
//  (5) compteur de vues : champ view_count (YouTubeVideo, Article, ChristianNews ; PlaylistTrack garde listen_count)
//      et journal anti-doublon MediaVue (route compterVue seulement) ;
//  (6) VersionAnnonce : une ligne par version annoncée (code unique : une seule annonce par version).
//
// Usage (tunnel SSH ouvert ; identifiants saisis masqués, voir docs/LOT-E.md) :
//   node pocketbase/scripts/migrer-lot-e.mjs                   -> simulation (rien n'est écrit)
//   node pocketbase/scripts/migrer-lot-e.mjs --appliquer       -> applique
//   node pocketbase/scripts/migrer-lot-e.mjs --fragment f.json -> écrit le fragment collections.json (sans réseau)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MEMBRES = '@request.auth.id != ""';
const ADMINS = '@request.auth.role = "admin"';

const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const nombre = (name, extra = {}) => ({ name, type: 'number', required: false, hidden: false, system: false, min: null, max: null, onlyInt: false, ...extra });
const choix = (name, values, extra = {}) => ({ name, type: 'select', required: false, hidden: false, system: false, maxSelect: 1, values, ...extra });
const dates = () => [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, hidden: false, system: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, hidden: false, system: false },
];
const base44 = () => [
  texte('created_by_id', 64),
  { name: 'base44_created_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
  { name: 'base44_updated_date', type: 'date', required: false, hidden: false, system: false, min: '', max: '' },
  texte('base44_created_by', 255),
  ...dates(),
];

// ── (1) Jeux ─────────────────────────────────────────────────────────────────
export const EMPLACEMENTS_JEUX = ['game', 'playmobile'];
export const NOMS_DEPART_JEUX = { game: 'Chay Game', playmobile: 'Chay PlayMobile' };

/** Collections créées par ce lot (ordre de création). */
export function nouvellesCollections() {
  return [
    {
      // Deux catégories fixes (créées par la migration) ; l'admin ne modifie que leur nom.
      name: 'GameCategory', type: 'base',
      listRule: MEMBRES, viewRule: MEMBRES, createRule: null, updateRule: ADMINS, deleteRule: null,
      fields: [
        choix('slot', EMPLACEMENTS_JEUX, { required: true }),
        texte('name', 60, { required: true }),
        nombre('order', { onlyInt: true }),
        ...dates(),
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_gamecategory_slot` ON `GameCategory` (`slot`)'],
    },
    {
      // Classement d'un jeu (identifiant fixe de l'app, ex. « trivia ») : unique, donc une seule catégorie.
      name: 'GameClassement', type: 'base',
      listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
      fields: [
        texte('game_id', 40, { required: true, pattern: '^[a-z0-9_-]+$' }),
        choix('slot', EMPLACEMENTS_JEUX, { required: true }),
        ...dates(),
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_gameclassement_game` ON `GameClassement` (`game_id`)'],
    },
    // ── (2) Actualité chrétienne ──
    {
      name: 'ChristianNews', type: 'base',
      listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
      fields: [
        texte('title', 300, { required: true }),
        texte('summary', 1000),
        texte('body', 200000),
        texte('cover_url', 5000),
        texte('link_url', 2000),
        nombre('order'),
        nombre('view_count', { onlyInt: true, min: 0 }),
        ...base44(),
      ],
    },
    // ── (3) Fonds d'écran ──
    {
      name: 'Wallpaper', type: 'base',
      listRule: MEMBRES, viewRule: MEMBRES, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
      fields: [
        texte('title', 200, { required: true }),
        texte('image_url', 5000, { required: true }),
        texte('thumb_url', 5000),
        nombre('order'),
        ...base44(),
      ],
    },
    // ── (4) Se missionner ──
    {
      // Données personnelles (téléphone, adresse) : lecture réservée aux admins ; création par la route seulement.
      name: 'MissionRequest', type: 'base',
      listRule: ADMINS, viewRule: ADMINS, createRule: null, updateRule: ADMINS, deleteRule: ADMINS,
      fields: [
        texte('user_id', 64, { required: true }),
        texte('last_name', 100, { required: true }),
        texte('first_name', 100, { required: true }),
        nombre('age', { required: true, onlyInt: true, min: 1, max: 120 }),
        texte('phone', 30, { required: true }),
        texte('address', 300, { required: true }),
        choix('kind', ['evangeliser', 'batir_eglise', 'association', 'droits_videos', 'autre'], { required: true }),
        texte('other_text', 300),
        texte('details', 3000),
        choix('status', ['nouvelle', 'traitee']),
        ...base44(),
      ],
      indexes: ['CREATE INDEX `idx_missionrequest_user` ON `MissionRequest` (`user_id`, `created`)'],
    },
    // ── (5) Compteur de vues : journal anti-doublon (30 min par membre et par contenu), route compterVue seulement ──
    {
      name: 'MediaVue', type: 'base',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        texte('user_id', 64, { required: true }),
        texte('cle', 80, { required: true }),
        ...dates(),
      ],
      indexes: ['CREATE INDEX `idx_mediavue_user_cle` ON `MediaVue` (`user_id`, `cle`, `created`)'],
    },
    // ── (6) Annonce des nouvelles versions de l'APK (route annoncerVersion, tâche annonce_version) ──
    {
      name: 'VersionAnnonce', type: 'base',
      listRule: ADMINS, viewRule: ADMINS, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        nombre('version_code', { required: true, onlyInt: true, min: 1 }),
        texte('version_name', 20, { required: true }),
        texte('envoye_par', 64),
        choix('statut', ['en_cours', 'termine']),
        nombre('nb_emails', { onlyInt: true, min: 0 }),
        nombre('emails_envoyes', { onlyInt: true, min: 0 }),
        nombre('nb_appareils', { onlyInt: true, min: 0 }),
        { name: 'restants', type: 'json', required: false, hidden: false, system: false, maxSize: 5000000 },
        ...dates(),
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_versionannonce_code` ON `VersionAnnonce` (`version_code`)'],
    },
  ];
}

/** Champs ajoutés à des collections existantes : [{ collection, field }]. */
export function champsAjoutes() {
  const vues = () => nombre('view_count', { onlyInt: true, min: 0 });
  return [
    // (5) Compteur de vues (écrit par la route compterVue).
    { collection: 'YouTubeVideo', field: vues() },
    { collection: 'Article', field: vues() },
  ];
}

/** Enregistrements de départ, créés seulement si absents : [{ collection, cle, valeur, data }]. */
export function donneesDepart() {
  return EMPLACEMENTS_JEUX.map((slot, i) => ({
    collection: 'GameCategory', cle: 'slot', valeur: slot, data: { slot, name: NOMS_DEPART_JEUX[slot], order: i },
  }));
}

/** Champs manquants d'une collection existante (null si déjà à jour) ; refus si un champ existe avec un autre type. */
export function planChamps(col, ajouts) {
  if (!col || !Array.isArray(col.fields)) throw new Error('collection illisible');
  const manquants = [];
  for (const f of ajouts) {
    const deja = col.fields.find((g) => g.name === f.name);
    if (deja && deja.type !== f.type) throw new Error(`${col.name}.${f.name} existe avec un autre type (${deja.type}) : arrêt`);
    if (!deja) manquants.push(f);
  }
  return manquants.length ? { fields: [...col.fields, ...manquants], manquants } : null;
}

/** Ajouts regroupés par collection : Map(nom -> [champs]). */
export function ajoutsParCollection() {
  const m = new Map();
  for (const { collection, field } of champsAjoutes()) m.set(collection, [...(m.get(collection) || []), field]);
  return m;
}

/**
 * Applique (ou simule) la migration contre `url` avec l'en-tête superuser `h`. Renvoie la liste des changements.
 * Exportée pour le test d'intégration (copie jetable du bac à sable).
 */
export async function migrer(url, h, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const note = (t) => { changements.push(t); log(`  - ${t}`); };
  const lire = async (nom) => {
    const r = await fetch(`${url}/api/collections/${encodeURIComponent(nom)}`, { headers: h });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lecture de ${nom} impossible (HTTP ${r.status})`);
    return r.json();
  };
  for (const def of nouvellesCollections()) {
    if (await lire(def.name)) continue;
    note(`${def.name} : nouvelle collection (${def.fields.filter((f) => !['created', 'updated', 'created_by_id', 'base44_created_date', 'base44_updated_date', 'base44_created_by'].includes(f.name)).map((f) => f.name).join(', ')})`);
    if (appliquer) {
      const c = await fetch(`${url}/api/collections`, { method: 'POST', headers: h, body: JSON.stringify(def) });
      if (!c.ok) throw new Error(`${def.name} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  for (const [nom, ajouts] of ajoutsParCollection()) {
    const col = await lire(nom);
    if (!col) throw new Error(`collection ${nom} absente : arrêt`);
    const plan = planChamps(col, ajouts);
    if (!plan) continue;
    for (const f of plan.manquants) note(`${nom}.${f.name} : nouveau champ ${f.type}`);
    if (appliquer) {
      const r = await fetch(`${url}/api/collections/${col.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: plan.fields }) });
      if (!r.ok) throw new Error(`${nom} : mise à jour refusée (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    }
  }
  for (const d of donneesDepart()) {
    const existe = await lire(d.collection);
    if (existe) {
      const filtre = encodeURIComponent(`${d.cle} = "${d.valeur}"`);
      const r = await fetch(`${url}/api/collections/${d.collection}/records?perPage=1&filter=${filtre}`, { headers: h });
      if (r.ok && (await r.json()).totalItems > 0) continue;
    }
    note(`${d.collection} : enregistrement de départ « ${d.data.name || d.valeur} »`);
    if (appliquer) {
      const c = await fetch(`${url}/api/collections/${d.collection}/records`, { method: 'POST', headers: h, body: JSON.stringify(d.data) });
      if (!c.ok) throw new Error(`${d.collection} : création refusée (HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  return changements;
}

async function main() {
  const i = process.argv.indexOf('--fragment');
  if (i > 0) {
    const sortie = process.argv[i + 1];
    if (!sortie) throw new Error('--fragment : chemin du fichier attendu');
    fs.writeFileSync(sortie, `${JSON.stringify(nouvellesCollections(), null, 2)}\n`);
    console.log(`Fragment écrit : ${sortie} (${nouvellesCollections().map((c) => c.name).join(', ')}).`);
    return;
  }
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD sont requis (voir l’en-tête du script).');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? 'Appliqué.' : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
