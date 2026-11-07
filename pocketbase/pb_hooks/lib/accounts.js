// Suppression d'un compte et de ses données (bloc 3). Liste détaillée : docs/SUPPRESSION-COMPTE.md.
// Toutes les opérations reçoivent `app` (txApp) : elles s'exécutent dans UNE transaction.

const ANCIEN = 'Ancien membre';

// Données personnelles supprimées : [collection, champs désignant le membre].
const DELETE_ROWS = [
  ['DeviceToken', ['user_id', 'created_by_id']],
  ['WebPushSubscription', ['user_id', 'created_by_id']],
  ['UserNotification', ['user_id']],
  ['PostReaction', ['user_id', 'created_by_id']],
  ['MemberProfile', ['created_by_id']],
  ['ChatPresence', ['created_by_id']],
  ['BibleAnnotation', ['created_by_id']],
  ['ConcordanceFavorite', ['created_by_id']],
  ['DictionaryFavorite', ['created_by_id']],
  ['PlaylistItem', ['created_by_id']],
  ['QuizUserProgress', ['user_id']],
  ['QuizAnswerHistory', ['user_id']],
  ['WordScrambleProgress', ['user_id']],
  ['WordScrambleHistory', ['user_id']],
  ['WordScrambleCredits', ['user_id']],
  ['BlockBlastScore', ['user_id', 'created_by_id']],
  ['PersonalityQuizResult', ['user_id']],
  ['ThemeRequest', ['user_id']],
  ['DonationRequest', ['userId']],
  ['ContactMessage', ['created_by_id']],
];

// Contenus conservés mais anonymisés : [collection, champ auteur (id), champ nom à remplacer].
const ANONYMIZE = [
  ['Message', 'sender_id', 'sender_name'],
  ['Comment', 'created_by_id', 'author_name'],
  ['ChatMessage', 'created_by_id', 'author_name'],
  ['CommunityPost', 'created_by_id', 'author_name'],
];

// Listes json d'identifiants dont on retire le membre.
const ARRAY_FIELDS = [
  ['Message', ['participant_ids', 'read_by']],
  ['Conversation', ['participant_ids', 'pinned_by', 'muted_by']],
  ['Video', ['viewed_by']],
];

// Valeur mise à la place d'un identifiant OBLIGATOIRE (ex. PrayerRequest.requester_id) :
// elle ne correspond à aucun compte, donc à aucune règle d'accès.
const DELETED_ID = 'compte-supprime';
const REQUIRED_ID = { PrayerRequest: ['requester_id'] };

// Champs texte d'identifiant vidés (le contenu est conservé).
const CLEAR_FIELDS = [
  ['PrayerRequest', ['requester_id', 'taken_by']],
  ['ThemeRequest', ['handled_by']],
  ['Conversation', ['typing_user_id']],
  ['UserNotification', ['actor_id']],
];

function each(app, collection, filter, params, fn) {
  for (;;) {
    const rows = app.findRecordsByFilter(collection, filter, '', 200, 0, params);
    if (!rows.length) return;
    let progressed = false;
    for (const r of rows) progressed = fn(r) || progressed;
    if (!progressed || rows.length < 200) return;
  }
}

/** Nombre d'administrateurs restants si `userId` disparaît. */
function remainingAdmins(app, userId) {
  return app.countRecords('users', $dbx.and($dbx.hashExp({ role: 'admin' }), $dbx.not($dbx.hashExp({ id: userId }))));
}

/** Supprime / anonymise toutes les données du membre, puis le compte. Renvoie un résumé (nombres seulement). */
function deleteAccount(app, userId) {
  const summary = { supprimes: 0, anonymises: 0 };
  const p = { u: userId, q: `"${userId}"` };

  for (const [collection, fields] of DELETE_ROWS) {
    const filter = fields.map((f) => `${f} = {:u}`).join(' || ');
    each(app, collection, filter, p, (r) => { app.delete(r); summary.supprimes++; return true; });
  }

  for (const [collection, idField, nameField] of ANONYMIZE) {
    const filter = idField === 'created_by_id' ? 'created_by_id = {:u}' : `${idField} = {:u} || created_by_id = {:u}`;
    each(app, collection, filter, p, (r) => {
      r.set(nameField, ANCIEN);
      if (idField !== 'created_by_id') r.set(idField, '');
      r.set('created_by_id', '');
      app.save(r);
      summary.anonymises++;
      return true;
    });
  }

  for (const [collection, fields] of ARRAY_FIELDS) {
    for (const field of fields) {
      each(app, collection, `${field} ~ {:q}`, p, (r) => {
        const list = JSON.parse(JSON.stringify(r))[field] || [];
        const rest = list.filter((x) => x !== userId);
        // participant_ids est obligatoire : sans plus aucun participant, la conversation (et ses
        // messages) ou le message est supprimé au lieu d'être enregistré vide.
        if (field === 'participant_ids' && rest.length === 0) {
          if (collection === 'Conversation') {
            each(app, 'Message', 'conversation_id = {:c}', { c: r.id }, (m) => { app.delete(m); summary.supprimes++; return true; });
          }
          app.delete(r);
          summary.supprimes++;
          return true;
        }
        r.set(field, rest);
        if (collection === 'Conversation' && field === 'participant_ids' && r.getString('admin_id') === userId) {
          r.set('admin_id', rest[0] || '');
        }
        app.save(r);
        summary.anonymises++;
        return true;
      });
    }
  }

  for (const [collection, fields] of CLEAR_FIELDS) {
    for (const field of fields) {
      each(app, collection, `${field} = {:u}`, p, (r) => {
        r.set(field, (REQUIRED_ID[collection] || []).indexOf(field) !== -1 ? DELETED_ID : '');
        if (collection === 'UserNotification') r.set('actor_name', ANCIEN);
        app.save(r);
        summary.anonymises++;
        return true;
      });
    }
  }

  // Toute autre trace d'auteur (contenus publiés par un admin, etc.) : created_by_id vidé.
  for (const col of app.findAllCollections('base')) {
    if (col.system || !col.fields.getByName('created_by_id')) continue;
    each(app, col.name, 'created_by_id = {:u}', p, (r) => { r.set('created_by_id', ''); app.save(r); summary.anonymises++; return true; });
  }

  app.delete(app.findRecordById('users', userId));
  return summary;
}

module.exports = { ANCIEN, DELETED_ID, DELETE_ROWS, ANONYMIZE, ARRAY_FIELDS, CLEAR_FIELDS, remainingAdmins, deleteAccount };
