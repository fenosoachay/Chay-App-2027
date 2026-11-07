# Suppression d'un compte

Routes serveur (PocketBase, `pocketbase/pb_hooks/auth.pb.js`) — logique dans `pocketbase/pb_hooks/lib/accounts.js` :

| Route | Qui | Effet |
|---|---|---|
| `POST /api/fn/deleteMyAccount` | le membre connecté | supprime **son** compte |
| `POST /api/fn/deleteUserAccount` `{ user_id }` | un admin (`role = "admin"`) | supprime le compte d'un membre |

Dans l'app (mode PocketBase), `entities.User.delete(id)` appelle la première si `id` est l'utilisateur connecté (`DangerZone`, via `AuthContext.deleteAccount`), sinon la seconde (`Community.jsx`).

## Garde-fous

- **Dernier administrateur** : refus (409 « Impossible de supprimer le dernier administrateur. ») si le compte visé est admin et qu'il n'en resterait aucun — y compris pour sa propre suppression.
- **Superusers** : jamais atteignables. Les routes ne visent que la collection `users` ; un identifiant de superuser donne 404. La règle `users.deleteRule` reste `null` (aucune suppression directe par l'API).
- **Une seule transaction** : en cas d'erreur, rien n'est modifié.
- **Journal** : seulement le nom de la route en cas d'échec ; la réponse contient des nombres (`supprimes`, `anonymises`), jamais de données.

## Ce qui est fait, collection par collection

### Supprimé (données personnelles)

| Collection | Lignes visées |
|---|---|
| DeviceToken | `user_id` ou `created_by_id` = membre |
| WebPushSubscription | `user_id` ou `created_by_id` = membre |
| UserNotification | `user_id` = membre (ses notifications) |
| PostReaction | `user_id` ou `created_by_id` = membre |
| MemberProfile | `created_by_id` = membre (profil public) |
| ChatPresence | `created_by_id` = membre |
| BibleAnnotation | `created_by_id` = membre |
| ConcordanceFavorite | `created_by_id` = membre |
| DictionaryFavorite | `created_by_id` = membre |
| PlaylistItem | `created_by_id` = membre (favoris audio) |
| QuizUserProgress, QuizAnswerHistory | `user_id` = membre |
| WordScrambleProgress, WordScrambleHistory, WordScrambleCredits | `user_id` = membre |
| BlockBlastScore | `user_id` ou `created_by_id` = membre |
| PersonalityQuizResult | `user_id` = membre |
| ThemeRequest | `user_id` = membre (ses demandes de thème) |
| DonationRequest | `userId` = membre (contient son nom) |
| ContactMessage | `created_by_id` = membre (contient nom et e-mail) |
| Conversation, Message | conversations (avec leurs messages) et messages dont le membre était le **seul** participant restant |
| users | le compte lui-même (en dernier) |

### Anonymisé (contenu conservé, auteur « Ancien membre »)

| Collection | Changement |
|---|---|
| Message | `sender_name` = « Ancien membre », `sender_id` et `created_by_id` vidés |
| Comment | `author_name` = « Ancien membre », `created_by_id` vidé |
| ChatMessage | `author_name` = « Ancien membre », `created_by_id` vidé |
| CommunityPost | `author_name` = « Ancien membre », `created_by_id` vidé |
| UserNotification (des autres membres) | `actor_id` vidé, `actor_name` = « Ancien membre » |

### Identifiant retiré (contenu conservé)

| Collection | Champ |
|---|---|
| PrayerRequest | `requester_id` (champ obligatoire) remplacé par `compte-supprime`, `taken_by` vidé (la prière reste, sans identité) |
| ThemeRequest | `handled_by` vidé |
| Conversation | membre retiré de `participant_ids`, `pinned_by`, `muted_by` ; `typing_user_id` vidé ; `admin_id` transmis au premier participant restant (ou vidé) |
| Message | membre retiré de `participant_ids` et `read_by` |
| Video | membre retiré de `viewed_by` |
| Toute autre collection avec `created_by_id` (contenus publiés par un admin : annonces, articles, vidéos, quiz…) | `created_by_id` vidé, contenu conservé |

## Limites

- **Fichiers** (photos de profil, images) : pas encore migrés (bloc « fichiers ») ; leurs URL disparaissent avec le profil mais les fichiers sur R2 ne sont pas encore effacés.
- **Sauvegardes** : les données restent dans les sauvegardes antérieures jusqu'à leur expiration (à préciser dans la politique de confidentialité).
- **Compteurs agrégés** (vues, écoutes) : conservés, ils ne désignent personne.
