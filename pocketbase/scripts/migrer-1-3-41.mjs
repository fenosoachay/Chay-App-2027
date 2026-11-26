#!/usr/bin/env node
// Migration 1.3.41 (idempotente) : pages légales du site chay.fr modifiables dans l'admin.
//  - SiteBloc.page : + mentions, confidentialite, cookies, suppression, infos ;
//  - SiteBloc.type : + section, choix, info ;
//  - textes actuels des 4 pages et « Informations légales » ajoutés, page par page, seulement si la page est vide
//    (rien n'est écrasé). Ce sont les mêmes textes que chay-site/outils/contenus-depart.json.
// Usage (tunnel SSH ouvert, SUPERUSER) :
//   node pocketbase/scripts/migrer-1-3-41.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-41.mjs --appliquer  -> applique
import { pathToFileURL } from 'node:url';

export const PAGES_LEGALES = ['mentions', 'confidentialite', 'cookies', 'suppression', 'infos'];
export const TYPES_LEGAUX = ['section', 'choix', 'info'];
export const BLOCS_LEGAUX = [
 {
  "page": "infos",
  "type": "info",
  "titre": "Nom de l’association",
  "texte": "Association Chay",
  "reference": "association",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Forme juridique",
  "texte": "association régie par la loi du 1er juillet 1901",
  "reference": "forme",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Adresse du siège",
  "texte": "9 rue Albert Catalifaud, 02800 La Fère",
  "reference": "siege",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Directeur ou directrice de la publication",
  "texte": "Mme Meva Ravelomaso",
  "reference": "directeur",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Date de publication au Journal officiel",
  "texte": "17/10/2020",
  "reference": "jo",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "SIREN",
  "texte": "923 180 426",
  "reference": "siren",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "SIRET",
  "texte": "923 180 426 00010",
  "reference": "siret",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Téléphone",
  "texte": "+33 7 49 77 06 74",
  "reference": "telephone",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "E-mail de contact",
  "texte": "chay@chay.fr",
  "reference": "email",
  "icone": ""
 },
 {
  "page": "infos",
  "type": "info",
  "titre": "Date de dernière mise à jour des pages légales",
  "texte": "25 novembre 2026",
  "reference": "maj",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "surtitre",
  "titre": "",
  "texte": "Informations légales",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Éditeur du site et de l’application",
  "texte": "**{association}**, {forme}.\nSiège : {siege}.\nDéclaration publiée au Journal officiel le {jo}.\nSIREN {siren} · SIRET {siret}.\nTéléphone : {telephone} · E-mail : {email}",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Directeur de la publication",
  "texte": "{directeur}",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Hébergement",
  "texte": "**Site chay.fr** et envoi des e-mails : OVH SAS, 2 rue Kellermann, 59100 Roubaix, France (ovhcloud.com).\n\n**Application Chay** (serveur api.chay.fr et membres.chay.fr) : serveur loué à OVHcloud, situé au Canada.\n\n**Vidéos, photos et fichiers envoyés** : Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis (cloudflare.com).",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Propriété intellectuelle",
  "texte": "Les textes, logos, images et vidéos de l’Église Chay sont protégés. Vous pouvez les partager en citant la source (« Église Chay · chay.fr ») ; toute autre réutilisation demande notre accord. Les textes bibliques Louis Segond 1910 sont dans le domaine public.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Liens",
  "texte": "Le site renvoie vers d’autres sites (YouTube, Facebook, TikTok, WhatsApp, Webradio) dont nous ne sommes pas responsables.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "mentions",
  "type": "section",
  "titre": "Données personnelles et cookies",
  "texte": "Voir la [politique de confidentialité](/confidentialite/) et la [politique de cookies](/cookies/).",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "surtitre",
  "titre": "",
  "texte": "Vos données",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "intro",
  "titre": "",
  "texte": "Ce que nous faisons de vos informations, sur le site chay.fr et dans l’application Chay.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Qui est responsable ?",
  "texte": "{association} (SIREN {siren}), {siege}. Pour toute question sur vos données : {email}.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Sur le site chay.fr",
  "texte": "- **Formulaire « Nous contacter »** : nom, e-mail, sujet et message, uniquement pour vous répondre. Gardés au plus 3 ans après notre dernier échange.\n- **Compteur de visites** : un simple nombre de visites par jour, sans aucune donnée personnelle gardée, et seulement si vous l’acceptez (voir la [politique de cookies](/cookies/)).\n- **Vidéos YouTube et Webradio** : seulement si vous les lancez ; YouTube (Google) ou Radioking reçoivent alors votre adresse IP.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Dans l’application Chay",
  "texte": "- **Votre compte** : prénom, nom, e-mail, mot de passe (chiffré, illisible même pour nous), et ce que vous choisissez d’ajouter : photo, date de naissance, téléphone, pays et ville, présentation, parcours spirituel.\n- **Ce que vous publiez ou envoyez** : messages (texte, vocaux, photos, fichiers), réactions, publications, commentaires, demandes de prière et de thème, demandes de mission ou de don.\n- **Votre position** : celle de votre téléphone à l’inscription, ou quand vous choisissez de la partager (Paramètres › Confidentialité et données) ; et, pour les statistiques de l’Église et sa carte des membres, une position arrondie à environ 5 km (la ville). Elle n’est montrée à aucun autre membre ; seuls les responsables voient la carte.\n- **Votre utilisation de l’application** : temps passé et rubriques visitées, pour améliorer l’application.\n- **Vos préférences et activités** : notes et favoris de la Bible, playlists, scores des jeux, profils enfants (un prénom et des scores, créés par un parent).\n- **Notifications** : un identifiant de votre téléphone, pour vous envoyer les notifications que vous avez acceptées.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Pourquoi ? (bases légales)",
  "texte": "- Faire fonctionner l’application et votre compte, que vous avez demandé à créer.\n- Votre accord pour les notifications et la localisation (vous pouvez le retirer dans les réglages du téléphone et de l’application).\n- Notre intérêt légitime pour les statistiques et la sécurité.\n- Les données qui montrent votre appartenance à l’Église sont traitées par l’association, organisme à but religieux, pour ses membres et les personnes en contact régulier avec elle ; elles ne sont jamais communiquées à l’extérieur sans votre accord (article 9 du RGPD).",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Qui voit vos données ?",
  "texte": "Les autres membres voient votre profil public (nom, photo, présentation) et ce que vous publiez ; les responsables de l’Église voient ce qui est nécessaire à leur mission. Nous ne vendons et ne louons jamais vos données. Prestataires techniques :\n\n- **OVHcloud** (France et Canada) : hébergement du site, du serveur de l’application et envoi des e-mails.\n- **Cloudflare** (États-Unis) : stockage des vidéos, photos et fichiers envoyés.\n- **Google** (États-Unis) : envoi des notifications (Firebase), vidéos YouTube, et dessins des emojis de l’application (Google Fonts).\n- **Radioking** (France) : diffusion de la Webradio Chay.\n\nLe Canada et les entreprises américaines adhérentes au « Data Privacy Framework » sont reconnus par la Commission européenne comme offrant une protection adéquate ; à défaut, des clauses contractuelles types encadrent ces transferts.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Combien de temps ?",
  "texte": "- Compte et contenus : tant que votre compte existe. À sa suppression, vos données sont effacées ; vos messages et publications déjà envoyés restent visibles sous le nom « Ancien membre ».\n- Messages du formulaire de contact : 3 ans au plus après le dernier échange.\n- Statistiques : uniquement sous forme de totaux, sans nom.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Vos droits",
  "texte": "Vous pouvez demander à voir, corriger, effacer ou recevoir vos données, vous opposer à un traitement ou le limiter : écrivez à {email}. Vous pouvez aussi modifier la plupart de vos informations vous-même dans l’application (Paramètres › Mon compte) et [supprimer votre compte](/supprimer-mon-compte/). Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (cnil.fr).",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Enfants",
  "texte": "Le compte est créé par un adulte. L’espace Chay Enfants n’utilise pas de compte d’enfant : un parent peut y ajouter un profil enfant (un prénom et des scores), qu’il peut supprimer à tout moment.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "confidentialite",
  "type": "section",
  "titre": "Sécurité",
  "texte": "Connexions chiffrées (https), mots de passe chiffrés, accès limités aux personnes qui en ont besoin, copies de sauvegarde.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "surtitre",
  "titre": "",
  "texte": "Votre navigateur",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "intro",
  "titre": "",
  "texte": "Le site chay.fr ne dépose aucun cookie publicitaire ni de suivi.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "section",
  "titre": "Ce que le site garde dans votre navigateur",
  "texte": "- **Votre choix de thème** (clair ou sombre) : pour l’afficher à votre retour.\n- **Votre choix sur le panneau « Cookies »** : pour ne pas vous le redemander.\n- **Si vous avez accepté : la date de votre dernière visite comptée**, pour ne compter qu’une visite par jour dans notre total de visites. Ce total est anonyme : aucune donnée personnelle n’est gardée, et il n’est partagé avec personne.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "choix",
  "titre": "Votre choix",
  "texte": "Vos visites ne sont comptées que si vous avez accepté sur le panneau « Cookies ». Vous pouvez changer d’avis à tout moment :",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "section",
  "titre": "Vidéos et Webradio",
  "texte": "Les cultes sont lus avec le lecteur YouTube « sans cookie » (youtube-nocookie.com), seulement quand vous lancez une vidéo. La Webradio Chay (Radioking) ne démarre que si vous appuyez sur lecture. Ces services peuvent alors utiliser leurs propres cookies : voir leurs politiques.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "cookies",
  "type": "section",
  "titre": "Effacer ces informations",
  "texte": "Vous pouvez tout effacer à tout moment dans les réglages de votre navigateur (données de site / cookies).",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "surtitre",
  "titre": "",
  "texte": "Application Chay",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "intro",
  "titre": "",
  "texte": "Vous pouvez supprimer votre compte et vos données à tout moment.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "section",
  "titre": "Depuis l’application (le plus simple)",
  "texte": "1. Ouvrez l’application Chay et connectez-vous.\n2. Touchez la roue dentée en haut à droite : **Paramètres**.\n3. Tout en bas, dans **Actions sensibles**, touchez **Supprimer mon compte**, puis confirmez.\n\nLa suppression est immédiate et définitive.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "section",
  "titre": "Sans l’application",
  "texte": "Écrivez à {email} depuis l’adresse e-mail de votre compte, avec l’objet « Supprimer mon compte ». Nous supprimons le compte sous 30 jours au plus et vous le confirmons par e-mail.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "section",
  "titre": "Ce qui est supprimé",
  "texte": "- Votre compte, votre profil et vos photos.\n- Vos notifications, préférences, favoris, notes de la Bible, playlists, scores et profils enfants.\n- Vos demandes de thème, de don et vos messages envoyés par le formulaire.",
  "reference": "",
  "icone": ""
 },
 {
  "page": "suppression",
  "type": "section",
  "titre": "Ce qui reste, sans votre nom",
  "texte": "- Les messages et publications déjà envoyés aux autres membres restent visibles sous le nom « Ancien membre », pour ne pas casser les conversations.\n- Les demandes de prière déjà publiées restent, sans lien avec vous.",
  "reference": "",
  "icone": ""
 }
];

const lire = (url, headers, init = {}) => fetch(url, { headers, signal: AbortSignal.timeout(60000), ...init });

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const r = await lire(`${url}/api/collections/SiteBloc`, headers);
  if (!r.ok) throw new Error(`lecture de SiteBloc impossible (HTTP ${r.status})`);
  const col = await r.json();
  const fields = (col.fields || []).map((f) => ({ ...f }));
  let modifie = false;
  for (const [nom, ajouts] of [['page', PAGES_LEGALES], ['type', TYPES_LEGAUX]]) {
    const f = fields.find((x) => x.name === nom);
    if (!f || f.type !== 'select') throw new Error(`SiteBloc.${nom} introuvable ou pas une liste`);
    const manquants = ajouts.filter((v) => !(f.values || []).includes(v));
    if (manquants.length) {
      log(`  - SiteBloc.${nom} : + ${manquants.join(', ')}`);
      f.values = [...(f.values || []), ...manquants];
      modifie = true;
      changements.push(`SiteBloc.${nom}`);
    } else log(`  = SiteBloc.${nom} : à jour`);
  }
  if (modifie && appliquer) {
    const p = await lire(`${url}/api/collections/SiteBloc`, headers, { method: 'PATCH', body: JSON.stringify({ fields }) });
    if (!p.ok) throw new Error(`mise à jour de SiteBloc refusée (HTTP ${p.status}) ${(await p.text()).slice(0, 300)}`);
  }
  for (const page of PAGES_LEGALES) {
    const q = new URLSearchParams({ filter: `page="${page}"`, perPage: '1', skipTotal: '1' });
    const ex = await lire(`${url}/api/collections/SiteBloc/records?${q}`, headers);
    // Valeur pas encore dans la liste (simulation) : la page est forcément vide.
    const items = ex.ok ? (await ex.json()).items || [] : [];
    if (items.length) { log(`  = page ${page} : déjà des textes, rien n'est écrasé`); continue; }
    const blocs = BLOCS_LEGAUX.filter((b) => b.page === page);
    log(`  - page ${page} : ${blocs.length} textes de départ`);
    changements.push(`textes ${page}`);
    if (!appliquer) continue;
    let order = 0;
    for (const b of blocs) {
      order += 1;
      const c = await lire(`${url}/api/collections/SiteBloc/records`, headers, { method: 'POST', body: JSON.stringify({ ...b, order }) });
      if (!c.ok) throw new Error(`ajout refusé (${page}, HTTP ${c.status}) ${(await c.text()).slice(0, 300)}`);
    }
  }
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  console.log(`Connexion à ${URL_PB}...`);
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    signal: AbortSignal.timeout(30000), method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.join(', ')}).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
