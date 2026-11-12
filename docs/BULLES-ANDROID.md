# Messages privés : bulles Android et notification de conversation (APK 1.3.5)

## Fonctionnement

1. Le hook `sendMessagePush` envoie le push avec `style: 'conversation'`, le nom et la photo (`avatar_url` du profil, https seulement) de l'expéditeur. Le sidecar ajoute ces données au message FCM et met la priorité haute.
2. Dans l'APK 1.3.5 et suivantes, `ChayMessagingService` remplace le service FCM du plugin. Il intercepte ces messages **avant** l'affichage automatique d'Android et appelle `ConversationNotifier` :
   - **notification de conversation** : style `MessagingStyle`, photo ronde (ou initiale), nom, historique des derniers messages de la conversation, bouton **Répondre** ;
   - **bulle** (Android 11+) : raccourci de conversation durable et `BubbleMetadata` vers `BubbleActivity` (l'app dans une fenêtre flottante, ouverte sur la conversation).
3. **Repli automatique** : c'est la même notification. Si les bulles ne sont pas disponibles (Android 10 ou moins, bulles désactivées, surcouche sans bulles), Android l'affiche en conversation classique.
4. **Réponse rapide** : le texte saisi ouvre l'app, est envoyé comme depuis la conversation (file hors ligne comprise), puis la conversation s'affiche (`src/lib/reponseRapide.js`).
5. Les APK 1.3.4 et antérieures reçoivent toujours la notification classique : le bloc `notification` du message FCM est conservé.

## Réglages côté téléphone (Android 11+)

Réglages > Notifications > Bulles : « Toutes les conversations » ou « Conversations sélectionnées ». La conversation peut aussi être réglée depuis la notification elle-même : appui long, puis « Bulle ».

## Limites par fabricant

| Fabricant | Bulles | Remarques |
|---|---|---|
| Google Pixel, Android One, Motorola, Nokia (Android proche d'origine) | Oui (Android 11+) | Comportement de référence. |
| Samsung (One UI 3+) | Oui | One UI a ses propres « bulles » et « fenêtres contextuelles intelligentes » (Réglages > Notifications > Paramètres avancés > Notifications flottantes). Il faut choisir **Bulles** (et non « Fenêtres contextuelles intelligentes »). |
| Xiaomi / Redmi / POCO (MIUI, HyperOS) | Souvent non | MIUI remplace les bulles par ses « fenêtres flottantes » : seule la notification de conversation s'affiche. Il faut aussi autoriser le démarrage automatique et désactiver l'économie de batterie pour Chay, sinon les push peuvent arriver en retard. |
| Huawei / Honor (EMUI, sans services Google) | Non | Sans services Google, il n'y a pas de FCM, donc pas de push. Avec services Google : notification de conversation seulement. |
| OPPO, Realme, OnePlus (ColorOS, OxygenOS 12+) | Variable | Bulles présentes selon la version. La gestion de batterie agressive peut retarder les push (autoriser l'activité en arrière-plan). |
| Vivo (Funtouch, OriginOS) | Rarement | Notification de conversation. |
| Android 10 et moins (tous fabricants) | Non | Notification avec réponse rapide. Android 7 à 10 affichent l'historique ; Android 6 et moins, un affichage simplifié. |

## Autres limites

- **La réponse rapide ouvre l'app.** L'envoi a besoin de la session de l'app : le jeton de connexion vit dans la WebView, pas dans le code natif.
- **La bulle charge l'app complète** dans une seconde fenêtre. Au premier affichage, l'écran de lancement de 4 s peut apparaître (un toucher le passe). Dans la bulle, seuls les plugins « lien externe » et « conversation » sont enregistrés : la lecture vidéo ExoPlayer et la notification média restent dans la fenêtre principale.
- **Photo de l'expéditeur** : téléchargée en 3 s maximum et en https uniquement. Sinon, une pastille avec son initiale s'affiche.
- **Push remis en file** (`PushEnvoi`, échec temporaire) : la file ne garde ni le style ni la photo. Ces push sont affichés en notification classique.
