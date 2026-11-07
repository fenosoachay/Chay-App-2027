// Intégrité des données écrites directement par les membres (bloc 3) :
//  - nom affiché imposé côté serveur (pas d'usurpation du nom d'un autre membre) ;
//  - read_by (Message), pinned_by / muted_by (Conversation) : un membre n'ajoute ou ne retire que son propre id.
// Les admins (role = "admin") et les superusers ne sont pas concernés.
// Rappel : sous Windows, redémarrer PocketBase après modification.

// ── Nom affiché ──────────────────────────────────────────────────────────────
function integriteNomAffiche(e) {
  const auth = e.auth;
  if (!e.hasSuperuserAuth() && auth && auth.collection().name === 'users' && auth.getString('role') !== 'admin') {
    const fields = { Comment: 'author_name', ChatMessage: 'author_name', ChatPresence: 'display_name', MemberProfile: 'display_name', PostReaction: 'user_name' };
    const field = fields[e.record.collection().name];
    const name = auth.getString('name')
      || [auth.getString('first_name'), auth.getString('last_name')].filter(Boolean).join(' ')
      || 'Membre';
    e.record.set(field, name);
  }
  e.next();
}
onRecordCreateRequest(integriteNomAffiche, 'Comment', 'ChatMessage', 'ChatPresence', 'MemberProfile', 'PostReaction');
onRecordUpdateRequest(integriteNomAffiche, 'Comment', 'ChatMessage', 'ChatPresence', 'MemberProfile', 'PostReaction');

// ── Listes d'identifiants : seulement son propre id ──────────────────────────
onRecordUpdateRequest((e) => {
  const auth = e.auth;
  if (!e.hasSuperuserAuth() && auth && auth.getString('role') !== 'admin') {
    const lists = e.record.collection().name === 'Message' ? ['read_by'] : ['pinned_by', 'muted_by'];
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }
    const before = JSON.parse(JSON.stringify(e.record.original()));
    const after = JSON.parse(JSON.stringify(e.record));
    for (const field of lists) {
      if (!(field in body)) continue;
      const a = Array.isArray(before[field]) ? before[field] : [];
      const b = Array.isArray(after[field]) ? after[field] : [];
      const changed = a.filter((x) => b.indexOf(x) === -1).concat(b.filter((x) => a.indexOf(x) === -1));
      if (changed.some((x) => x !== auth.id)) {
        throw new ForbiddenError('Vous ne pouvez ajouter ou retirer que votre propre identifiant.');
      }
    }
  }
  e.next();
}, 'Message', 'Conversation');
