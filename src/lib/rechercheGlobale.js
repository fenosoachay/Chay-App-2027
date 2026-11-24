// Recherche dans toute l'app (1.3.26) : icône Recherche de la barre du haut -> page /recherche.
// Règles pures (testées dans rechercheGlobale.test.js) ; la page (pages/Recherche.jsx) fait les appels.
// Les règles d'accès du serveur s'appliquent : chaque membre ne trouve que ce qu'il a le droit de voir.

const q = (v) => encodeURIComponent(String(v));

/** Texte cherché, nettoyé : lettres, chiffres, espaces, apostrophes et tirets ; "" si moins de 2 caractères. */
export function nettoyerRecherche(texte) {
  const t = String(texte || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return t.length >= 2 ? t : "";
}

/** Sans accents ni majuscules, pour comparer (« Prière » = « priere »). */
export const plier = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtre « un des champs contient le texte » (traduit par l'adaptateur en `champ ~ "%texte%"`). */
export const filtreContient = (texte, champs) => ({ $or: champs.map((c) => ({ [c]: { $regex: texte } })) });

const premiereLigne = (html, max = 90) =>
  String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const youtubeImage = (r) => r.thumbnail_url || r.cover_url || (r.youtube_id ? `https://img.youtube.com/vi/${r.youtube_id}/mqdefault.jpg` : "");

// Ce que la recherche parcourt, dans l'ordre d'affichage des groupes.
export const SOURCES = [
  { entite: "MusicTrack", groupe: "Musique", icone: "music", champs: ["title", "artist", "album"],
    titre: (r) => r.title, sousTitre: (r) => r.artist, image: (r) => r.cover_url,
    route: (r) => `/media?cat=music&track=${q(r.id)}` },
  { entite: "Playlist", groupe: "Playlists", icone: "playlist", champs: ["name", "description"],
    titre: (r) => r.name, sousTitre: (r) => premiereLigne(r.description, 60), image: (r) => r.cover_url,
    route: (r) => (r.category === "enfants"
      ? `/kids?vue=videos&playlist=${q(r.id)}`
      : `/media?cat=${q(r.category || "music")}&playlist=${q(r.id)}`) },
  { entite: "Sermon", groupe: "Prédications", icone: "sermon", champs: ["title", "speaker"],
    titre: (r) => r.title, sousTitre: (r) => r.speaker, image: (r) => r.cover_url,
    route: (r) => `/media?cat=sermons&track=${q(r.id)}` },
  { entite: "Video", groupe: "Films", icone: "film", champs: ["title", "description"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.description, 60), image: (r) => r.cover_url,
    route: (r) => `/media?cat=films&track=${q(r.id)}` },
  { entite: "VideoEnfant", groupe: "Vidéos des enfants", icone: "film", champs: ["title", "description"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.description, 60), image: (r) => r.cover_url,
    route: (r) => `/kids?vue=videos&track=${q(r.id)}` },
  { entite: "YouTubeVideo", groupe: "YouTube", icone: "youtube", champs: ["title"],
    titre: (r) => r.title, sousTitre: () => "", image: youtubeImage,
    route: (r) => `/media?cat=youtube&video=${q(r.id)}` },
  { entite: "Paroles", groupe: "Paroles", icone: "paroles", champs: ["title", "body"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.body, 70), image: () => "",
    route: (r) => `/media?cat=paroles&parole=${q(r.id)}` },
  { entite: "Verset", groupe: "Versets", icone: "verset", champs: ["title", "reference", "body"],
    titre: (r) => r.reference || r.title, sousTitre: (r) => premiereLigne(r.body, 80), image: () => "",
    route: (r) => `/media?cat=verset&verset=${q(r.id)}` },
  { entite: "Article", groupe: "Articles", icone: "article", champs: ["title", "excerpt", "author"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.excerpt, 70), image: (r) => r.cover_url,
    route: (r) => `/media?cat=articles&article=${q(r.id)}` },
  { entite: "GalleryImage", groupe: "Galerie", icone: "image", champs: ["title"],
    titre: (r) => r.title, sousTitre: () => "", image: (r) => r.image_url,
    route: (r) => `/media?cat=gallery&image=${q(r.id)}` },
  { entite: "Announcement", groupe: "Annonces", icone: "annonce", champs: ["title", "body"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.body, 70), image: () => "",
    route: (r) => `/?annonce=${q(r.id)}` },
  { entite: "PageTexte", groupe: "L'Église", icone: "eglise", champs: ["title", "body"],
    titre: (r) => r.title, sousTitre: (r) => premiereLigne(r.body, 70), image: () => "",
    route: (r) => (["vision", "but", "confession"].includes(r.cle) ? `/eglise/${r.cle}` : null) },
  { entite: "Staff", groupe: "Personnel", icone: "personne", champs: ["nom", "prenom", "role"],
    titre: (r) => [r.prenom, r.nom].filter(Boolean).join(" "), sousTitre: (r) => r.role, image: (r) => r.photo_url,
    route: () => "/eglise/personnel" },
  { entite: "MemberProfile", groupe: "Membres", icone: "membre", champs: ["display_name"],
    titre: (r) => r.display_name, sousTitre: () => "", image: (r) => r.avatar_url,
    route: (r) => (r.created_by_id && !r.systeme ? `/profile/${q(r.created_by_id)}` : null) },
];

/** Lignes renvoyées par le serveur -> résultats affichables (sans titre ou sans écran : écartés). */
export function versResultats(source, lignes) {
  return (Array.isArray(lignes) ? lignes : [])
    .map((r) => ({ id: `${source.entite}:${r.id}`, titre: String(source.titre(r) || "").trim(), sousTitre: String(source.sousTitre(r) || "").trim(), image: source.image(r) || "", route: source.route(r) }))
    .filter((x) => x.titre && x.route);
}

// Rubriques de l'app, trouvées par leur nom ou des mots proches.
export const RUBRIQUES = [
  { titre: "Bible", mots: "bible baiboly lire lecture", route: "/bible" },
  { titre: "Concordance", mots: "concordance mot bible chercher", route: "/bible?view=concordance" },
  { titre: "Dictionnaire biblique", mots: "dictionnaire westphal definition", route: "/bible?view=dictionary" },
  { titre: "Mes notes et surlignages", mots: "notes surlignage favoris bible", route: "/bible?view=notes" },
  { titre: "Sagesse en audio", mots: "sagesse audio proverbes ecouter", route: "/bible?view=sagesse" },
  { titre: "Radio Chay", mots: "radio webradio direct ecouter", route: "/media?cat=radio" },
  { titre: "Musique", mots: "musique chants chansons", route: "/media?cat=music" },
  { titre: "Prédications", mots: "predications predication sermons enseignement", route: "/media?cat=sermons" },
  { titre: "Films", mots: "films videos", route: "/media?cat=films" },
  { titre: "YouTube", mots: "youtube cultes videos", route: "/media?cat=youtube" },
  { titre: "Articles", mots: "articles lecture", route: "/media?cat=articles" },
  { titre: "Galerie", mots: "galerie photos images fonds ecran", route: "/media?cat=gallery" },
  { titre: "Paroles", mots: "paroles chants textes", route: "/media?cat=paroles" },
  { titre: "Verset", mots: "verset versets", route: "/media?cat=verset" },
  { titre: "Votre playlist", mots: "playlist favoris ma playlist", route: "/media?cat=playlist" },
  { titre: "Jeux", mots: "jeux jouer", route: "/games" },
  { titre: "Quiz", mots: "quiz questions jeu", route: "/quiz" },
  { titre: "Brique", mots: "brique block blast jeu", route: "/kids?vue=jeux&jeu=brique" },
  { titre: "Émojis", mots: "emojis jeu", route: "/games/emojis" },
  { titre: "Mots mélangés", mots: "mots melanges jeu lettres", route: "/word-scramble" },
  { titre: "Puzzle", mots: "puzzle jeu enfants", route: "/kids?vue=jeux&jeu=puzzle" },
  { titre: "Personnalité biblique", mots: "personnalite biblique quiz test", route: "/personality-quiz" },
  { titre: "Espace enfants", mots: "enfants kids", route: "/kids" },
  { titre: "Vidéos des enfants", mots: "enfants kids videos dessins animes", route: "/kids?vue=videos" },
  { titre: "Jeux des enfants", mots: "enfants kids jeux coloriage memory cartes puzzle", route: "/kids?vue=jeux" },
  { titre: "Coloriage", mots: "coloriage colorier dessin enfants", route: "/kids?vue=jeux&jeu=coloriage" },
  { titre: "Jeux Carte", mots: "jeux carte memory paires enfants", route: "/kids?vue=jeux&jeu=memory" },
  { titre: "Communauté", mots: "communaute publications fil actualites", route: "/community" },
  { titre: "Messages", mots: "messages discussions conversation ecrire", route: "/messages" },
  { titre: "Notifications", mots: "notifications alertes", route: "/notifications" },
  { titre: "Requêtes et prière", mots: "requetes priere sujets theme demande", route: "/requests" },
  { titre: "Faire un don", mots: "don dons donner offrande soutenir", route: "/donate" },
  { titre: "Contact", mots: "contact ecrire question", route: "/contact" },
  { titre: "Histoire de l'Église", mots: "histoire eglise", route: "/eglise/histoire" },
  { titre: "Vision de l'Église", mots: "vision eglise", route: "/eglise/vision" },
  { titre: "But de l'Église", mots: "but eglise mission", route: "/eglise/but" },
  { titre: "Confession de foi", mots: "confession foi croyance", route: "/eglise/confession" },
  { titre: "Personnel", mots: "personnel equipe pasteurs responsables", route: "/eglise/personnel" },
  { titre: "Réglages", mots: "reglages parametres compte profil theme police confidentialite", route: "/settings" },
];

/** Rubriques dont le nom ou les mots contiennent le texte (sans accents ni majuscules). */
export function chercherRubriques(texte) {
  const t = plier(texte).trim();
  if (t.length < 2) return [];
  return RUBRIQUES.filter((r) => plier(r.titre).includes(t) || r.mots.split(" ").some((m) => m.startsWith(t)))
    .map((r) => ({ id: `rubrique:${r.route}`, titre: r.titre, sousTitre: "", image: "", route: r.route }));
}

/** Verset trouvé par la concordance -> écran du lecteur, au bon verset et dans la bonne langue. */
export function routeVersetBible(versionId, bookId, chapter, verse) {
  return `/bible?view=reader&translation=${q(versionId)}&ref=${q(`${bookId} ${chapter}`)}&verse=${q(verse)}`;
}
