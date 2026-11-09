# À faire après le basculement

Améliorations et corrections repérées pendant les tests du 9 novembre 2026. Elles ne bloquent pas la mise en service.

## Lecteur vidéo
- Retirer la **croix** à côté du bouton lecture/pause : elle réduit le lecteur, comme la croix du haut.
- Ajouter un bouton **plein écran horizontal**.
- Ajouter un **verrouillage des touches** (cadenas), pour éviter les appuis involontaires pendant la lecture.

## Envoi des vidéos
- **Barre de progression pour toutes les vidéos**. Aujourd'hui, elle n'apparaît qu'au-dessus de 15 Mo : seuil `CHUNKED_UI_THRESHOLD` dans `src/components/admin/FieldInput.jsx`.
- **Progression continue** avec `XMLHttpRequest`. Avec `fetch`, la barre n'avance qu'une fois par part de 8 Mo.

## Push navigateur
- **Abonnement Web Push** : ne pas renvoyer `user_id` lors de la mise à jour (`saveSubscriptionRecord` dans `src/lib/webPushCore.js`). La règle de mise à jour de `WebPushSubscription` le refuse : un abonnement désactivé ne peut donc plus être réactivé.
- **Conversation ouverte** : vider `active_conversation_id` quand l'onglet passe en arrière-plan. Aujourd'hui, un onglet caché sur la conversation empêche toute notification du destinataire.

## Divers
- Bouton **« Tester le push Android »** : aucune notification visible.
- **Block Blast** : placement des blocs.

## Sécurité et exploitation
- **Clé API Firebase** : la restreindre à l'application Android `io.chay.app` (console Google Cloud).
- **CSP** : passer de `Content-Security-Policy-Report-Only` à `Content-Security-Policy` (blocage réel), une fois les écarts signalés corrigés (`docs/CADDY-APP.md`).
- **Journaux PocketBase** : réduire la durée de conservation (Settings → Logs, `maxDays`, 5 jours aujourd'hui).
