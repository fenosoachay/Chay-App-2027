import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lireReponse, traiterReponseRapide } from "./reponseRapide.js";

const brut = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const JAVA = "android/app/src/main/java/io/chay/app/";

test("réponse rapide : envoyée comme depuis la conversation, notification retirée, conversation ouverte", async () => {
  const appels = [];
  const deps = {
    invoke: async (name, body) => { appels.push([name, body]); return { data: { id: "m1" } }; },
    updateConversation: async () => {},
    enqueue: () => appels.push(["file"]),
    effacer: (c) => appels.push(["effacer", c]),
    navigate: (r) => appels.push(["navigate", r]),
  };
  assert.equal(await traiterReponseRapide(deps, { conversation: "conv1", texte: "  Amen  ", route: "/messages?c=conv1" }), "envoye");
  assert.deepEqual(appels, [
    ["createMessage", { conversation_id: "conv1", text: "Amen", reply_to_id: null }],
    ["effacer", "conv1"],
    ["navigate", "/messages?c=conv1"],
  ]);
  appels.length = 0;
  assert.equal(await traiterReponseRapide(deps, { conversation: "conv1", texte: "" }), "vide"); // ouvre seulement
  assert.deepEqual(appels.map((a) => a[0]), ["effacer", "navigate"]);
  assert.equal(await traiterReponseRapide(deps, { conversation: "../x", texte: "a" }), "ignore");
  assert.equal(lireReponse({ conversation: "c", texte: "x", route: "//evil" }).route, "/messages?c=c");
  // Réseau coupé : file d'attente hors ligne, comme ConversationView.
  const hors = { ...deps, invoke: async () => { throw new TypeError("Failed to fetch"); } };
  appels.length = 0;
  assert.equal(await traiterReponseRapide(hors, { conversation: "c", texte: "plus tard" }), "en-attente");
  assert.equal(appels[0][0], "file");
});

test("natif : bulle Android 11+ avec repli conversation (photo, nom, réponse rapide)", () => {
  const n = brut(`${JAVA}ConversationNotifier.java`);
  for (const motif of [
    /NotificationCompat\.MessagingStyle/, /new Person\.Builder\(\)/, /setLongLived\(true\)/, /pushDynamicShortcut/,
    /setShortcutId\(raccourci\)/, /Build\.VERSION_CODES\.R\) \{[\s\S]*setBubbleMetadata/, /BubbleActivity\.class/,
    /new RemoteInput\.Builder\(CLE_REPONSE\)/, /SEMANTIC_ACTION_REPLY/, /setAllowBubbles\(true\)/, /PendingIntent\.FLAG_MUTABLE/,
    /putExtra\("google\.message_id"/, /startsWith\("https:\/\/"\)/,
  ]) assert.match(n, motif);
  const svc = brut(`${JAVA}ChayMessagingService.java`);
  assert.match(svc, /extends MessagingService/);
  assert.match(svc, /"conversation"\.equals\(data\.getString\("style"\)\)/);
  assert.match(svc, /super\.handleIntent\(intent\);/); // tout le reste : chemin habituel du plugin
  const man = brut("android/app/src/main/AndroidManifest.xml");
  assert.match(man, /com\.capacitorjs\.plugins\.pushnotifications\.MessagingService"\s+tools:node="remove"/);
  assert.match(man, /android:name="\.ChayMessagingService"/);
  assert.match(man, /android:name="\.BubbleActivity"[\s\S]*?android:allowEmbedded="true"[\s\S]*?android:resizeableActivity="true"[\s\S]*?android:documentLaunchMode="always"[\s\S]*?android:exported="false"/);
  assert.match(brut(`${JAVA}MainActivity.java`), /registerPlugin\(ChayConversationPlugin\.class\)/);
  assert.match(brut(`${JAVA}ChayConversationPlugin.java`), /notifyListeners\("reponse", data, true\)/);
  assert.match(brut("android/app/build.gradle"), /firebase-messaging:23\.3\.1/);
  assert.match(brut("src/hooks/usePushNotifications.js"), /ChayConversation\.addListener\("reponse"/);
});

test("serveur : push d'un message en style conversation (nom, photo https), priorité haute ; anciennes APK inchangées", () => {
  const notif = brut("pocketbase/pb_hooks/lib/notifications.js");
  assert.match(notif, /style: 'conversation', expediteur: senderName, avatar:/);
  const push = brut("pocketbase/pb_hooks/lib/push.js");
  assert.match(push, /out\.target_type === 'message' && n\.style === 'conversation'/);
  const side = brut("pocketbase/sidecar-push/serveur.mjs");
  assert.match(side, /android\.priority = 'HIGH'/);
  assert.match(side, /notification: \{ title: n\.title, body: n\.body \}/); // toujours présente : repli des APK ≤ 1.3.4
});
