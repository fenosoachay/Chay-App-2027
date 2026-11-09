# À faire après le basculement

Améliorations et corrections repérées pendant les tests du 9 novembre 2026. Elles ne bloquent pas la mise en service.

## Lecteur vidéo
- Retirer la **croix** à côté du bouton lecture/pause : elle réduit le lecteur, comme la croix du haut.
- Ajouter un bouton **plein écran horizontal**.
- Ajouter un **verrouillage des touches** (cadenas), pour éviter les appuis involontaires pendant la lecture.

## Envoi des vidéos
- **Barre de progression pour toutes les vidéos**. Aujourd'hui, elle n'apparaît qu'au-dessus de 15 Mo : seuil `CHUNKED_UI_THRESHOLD` dans `src/components/admin/FieldInput.jsx`.
- **Progression continue** avec `XMLHttpRequest`. Avec `fetch`, la barre n'avance qu'une fois par part de 8 Mo.

## Bible
- **Jaona (Jean) 8 en malgache** : le seul chapitre manquant (1 188 / 1 189). La source publique (`back.baiboly.antonionavira.mg`) répond HTTP 500 pour ce chapitre. Pistes : réessayer plus tard, l'interroger par petites plages de versets, ou saisir le chapitre depuis une autre édition du Baiboly 1865. Ensuite : `importer-baiboly.mjs --telecharger --autoriser-post`, puis `--appliquer` avec `PB_SU_EMAIL` / `PB_SU_PASSWORD` (voir `docs/REPETITION-GENERALE.md`, étape 5).

## Divers
- Bouton **« Tester le push Android »** : aucune notification visible.
- **Block Blast** : placement des blocs.

## Sécurité et exploitation
- **Clé API Firebase** : la restreindre à l'application Android `io.chay.app` (console Google Cloud).
- **CSP** : passer de `Content-Security-Policy-Report-Only` à `Content-Security-Policy` (blocage réel), une fois les écarts signalés corrigés (`docs/CADDY-APP.md`).
- **Journaux PocketBase** : réduire la durée de conservation (Settings → Logs, `maxDays`, 5 jours aujourd'hui).

## Déjà corrigé (avant le basculement)
- **Abonnement Web Push** : la mise à jour n'envoie plus `user_id` ; un abonnement désactivé peut de nouveau être réactivé (commit `100b497f`).
- **Conversation ouverte** : `active_conversation_id` est vidé quand l'onglet ou l'app passe en arrière-plan ; le destinataire est de nouveau notifié (commit `100b497f`).
- **Alerte rouge chez l'expéditeur** : un vieux jeton ou abonnement du destinataire (APK Base44, navigateur) n'est plus signalé comme une erreur d'envoi ; il est nettoyé automatiquement (commit `95b57672`).
