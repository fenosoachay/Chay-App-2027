import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerLib } from "../../pocketbase/tests/charger-cjs.mjs";
import { cibleCloche, routeCible, routeContenu, routeNotification, routeValide } from "./routesNotification.js";
import { annonceVisibleMaintenant, cibleAccueil, genreAnnonce, libelleAnnonce } from "./cibleAccueil.js";

const serveur = chargerLib("cibles.js");
const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

const CONTENUS = [
  { id: "c1", resource_type: "MusicTrack", resource_id: "t1", playlist_id: "charisma" },
  { id: "c2", resource_type: "Sermon", resource_id: "s1", playlist_id: "p2" },
  { id: "c3", resource_type: "Video", resource_id: "v1", playlist_id: "films1" },
  { id: "c4", resource_type: "YouTubeVideo", resource_id: "y1" },
  { id: "c5", resource_type: "Article", resource_id: "a1" },
  { id: "c6", resource_type: "GalleryImage", resource_id: "g1" },
  { id: "c7", resource_type: "Announcement", resource_id: "an1" },
  { id: "c8", type: "annonce" },
  { id: "c9", resource_type: "MusicTrack", resource_id: "t9" },
];

test("chaque type ouvre l'écran précis de son contenu", () => {
  const r = CONTENUS.map(routeContenu);
  assert.deepEqual(r, [
    "/media?cat=music&playlist=charisma&track=t1", // Musique > Charisma > le titre
    "/media?cat=sermons&playlist=p2&track=s1",
    "/media?cat=films&playlist=films1&track=v1", // vidéo mp4
    "/media?cat=youtube&video=y1",
    "/media?cat=articles&article=a1",
    "/media?cat=gallery&image=g1",
    "/?annonce=an1",
    "/?contenu=c8",
    "/media?cat=music&track=t9", // playlist retrouvée par Multimédia (PlaylistTrack)
  ]);
  assert.equal(routeCible("message", "conv1"), "/messages?c=conv1");
  assert.equal(routeCible("daily_verse", "d1"), "/?verset=d1");
  assert.equal(routeCible("announcement", "an1"), "/?annonce=an1");
  assert.equal(routeCible("prayer", "p1"), "/requests?tab=my-prayers");
  assert.equal(routeCible("theme_answer", "x"), "/requests?tab=theme");
  assert.equal(routeCible("content", "c1"), null);
  assert.equal(routeCible("message", "a&b"), "/messages?c=a%26b");
});

test("parité : le serveur (pb_hooks/lib/cibles.js) applique exactement les mêmes règles", () => {
  for (const c of CONTENUS) assert.equal(serveur.routeContenu(c), routeContenu(c));
  for (const t of ["message", "community", "daily_verse", "announcement", "theme_request", "theme_answer", "prayer", "app_update", "content", "inconnu", ""]) {
    for (const id of ["x1", "", "a&b"]) assert.equal(serveur.routeCible(t, id), routeCible(t, id), `${t}/${id}`);
  }
  for (const r of ["/media?cat=music&track=1", "//evil.example", "https://x", "/a b", "/" + "x".repeat(250), null, "/messages?c=a%26b"]) {
    assert.equal(serveur.routeValide(r), routeValide(r), String(r));
  }
  // Le service worker (sans modules) reprend les mêmes routes : sa fonction routeFor est EXÉCUTÉE et comparée.
  const sw = lire("public/sw.js");
  const brut = fs.readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"); // lire() retire les « // »
  const debut = brut.indexOf("function routeFor(data)");
  const suite = /\r?\n\}\r?\n/.exec(brut.slice(debut)); // fin de la fonction (fins de ligne LF ou CRLF)
  const routeFor = new Function(`${brut.slice(debut, debut + suite.index + suite[0].length)}; return routeFor;`)();
  for (const t of ["message", "community", "daily_verse", "announcement", "theme_request", "theme_answer", "prayer", "app_update", "inconnu", ""]) {
    for (const id of ["x1", ""]) assert.equal(routeFor({ target_type: t, target_id: id }), routeCible(t, id), `service worker ${t}/${id}`);
  }
  assert.equal(routeFor({ target_type: "content", target_id: "c1" }), "/media");
  for (const motif of [/"\/messages\?c=" \+ id/, /"\/\?verset=" \+ id/, /"\/\?annonce=" \+ id/, /"\/requests\?tab=my-prayers"/, /var r = data\.route;/]) assert.match(sw, motif);
});

test("routes externes refusées (pas de redirection hors de l'app)", () => {
  assert.equal(routeValide("//evil.example/x"), false);
  assert.equal(routeValide("https://evil.example"), false);
  assert.equal(routeValide("/media?cat=music"), true);
  assert.equal(routeValide("javascript:alert(1)"), false);
});

test("push : route transmise utilisée, sinon déduite ; contenu chargé par son id (ancien push, file de reprise)", async () => {
  assert.equal(await routeNotification({ route: "/media?cat=youtube&video=y1", target_type: "content" }), "/media?cat=youtube&video=y1");
  assert.equal(await routeNotification({ route: "//evil", target_type: "message", target_id: "c" }), "/messages?c=c");
  const charge = [];
  const charger = async (id) => { charge.push(id); return CONTENUS.find((c) => c.id === id); };
  assert.equal(await routeNotification({ target_type: "content", target_id: "c1" }, charger), "/media?cat=music&playlist=charisma&track=t1");
  assert.deepEqual(charge, ["c1"]);
  assert.equal(await routeNotification({ target_type: "content", target_id: "zz" }, async () => { throw new Error("404"); }), "/media");
});

test("cloche : chaque UserNotification retrouve la même cible que son push", async () => {
  const charger = async (id) => CONTENUS.find((c) => c.id === id);
  const cas = [
    [{ type: "new_content", content_id: "c5" }, "/media?cat=articles&article=a1"],
    [{ type: "daily_verse", content_id: "d1", content_type: "devotional" }, "/?verset=d1"],
    [{ type: "message", content_id: "conv", content_type: "message" }, "/messages?c=conv"],
    [{ type: "prayer_taken", content_type: "prayer", content_id: "p1" }, "/requests?tab=my-prayers"],
    [{ type: "theme_answer", content_id: "t" }, "/requests?tab=theme"],
    [{ type: "like", post_id: "post1" }, "/community"],
  ];
  for (const [n, attendu] of cas) assert.equal(await routeNotification(cibleCloche(n), charger), attendu, n.type);
});

test("accueil : ?verset= / ?annonce= / ?contenu= chargés par id ; réunion = annonce de type event", () => {
  assert.deepEqual(cibleAccueil(new URLSearchParams("verset=d1")), { collection: "Devotional", id: "d1" });
  assert.deepEqual(cibleAccueil(new URLSearchParams("annonce=an1")), { collection: "Announcement", id: "an1" });
  assert.deepEqual(cibleAccueil(new URLSearchParams("contenu=c8")), { collection: "Content", id: "c8" });
  assert.equal(cibleAccueil(new URLSearchParams("verset=../x")), null);
  assert.equal(libelleAnnonce({ type: "event" }), "Réunion");
  assert.equal(libelleAnnonce({ type: "news" }), "Annonce");
  assert.equal(genreAnnonce({ type: "event" }), "reunion");
  const now = new Date(2026, 10, 12, 10);
  assert.equal(annonceVisibleMaintenant("2026-11-12", now), true);
  assert.equal(annonceVisibleMaintenant("2026-11-01", now), true);
  assert.equal(annonceVisibleMaintenant("2026-12-01", now), false); // programmée : pas encore de notification
});

test("app : push Android, cloche et bandeau passent tous par la même règle ; Multimédia recharge la cible", () => {
  const push = lire("src/hooks/usePushNotifications.js");
  assert.match(push, /ouvrirNotification\(action\?\.notification\?\.data \|\| \{\}, navigate\)/);
  assert.doesNotMatch(push, /navigate\("\/media"\)/);
  for (const f of ["src/pages/Notifications.jsx", "src/components/NotificationBanner.jsx"]) {
    const s = lire(f);
    assert.match(s, /ouvrirNotification\(cibleCloche\(n\), navigate\)/, f);
    assert.doesNotMatch(s, /navigate\("\/media"\)/, f);
  }
  const media = lire("src/pages/Media.jsx");
  assert.match(media, /\}, \[targetTrackId, targetPlaylistId, targetVideoId, targetArticleId, targetImageId\]\);/);
  assert.match(lire("src/pages/Home.jsx"), /<CibleNotificationAccueil \/>/);
  assert.match(lire("src/pages/Requests.jsx"), /setActiveTab\(urlTab\)/);
  // Nouvelles notifications : articles, annonces et réunions (aucune notification avant).
  assert.match(lire("src/components/admin/EntityCrud.jsx"), /Article: "article"/);
  assert.match(lire("src/components/admin/EntityCrud.jsx"), /entity === "Announcement"/);
  assert.match(lire("src/components/home/ProchaineReunionSection.jsx"), /kind: "reunion"/);
});

test("serveur : le push du contenu porte la route exacte, le sidecar la transmet (FCM et navigateur)", () => {
  assert.match(lire("pocketbase/pb_hooks/lib/notifications.js"), /route: cibles\.routeContenu\(c\)/);
  const push = lire("pocketbase/pb_hooks/lib/push.js");
  assert.match(push, /c\.routeCible\(out\.target_type, out\.target_id\)/);
  const side = fs.readFileSync(new URL("../../pocketbase/sidecar-push/serveur.mjs", import.meta.url), "utf8");
  assert.match(side, /route: String\(n\.route \|\| ''\)/);
  assert.match(side, /notification\.route = n\.route/);
});
