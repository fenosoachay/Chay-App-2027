// Compatibilité Base44 sur toutes les collections non système :
//  - base44_created_date / base44_updated_date tenues à jour (équivalents de created_date / updated_date) ;
//  - valeurs par défaut du schéma Base44 (lib/defaults.js) à la création ;
//  - users : role = "user" si vide.
// Rappel : sous Windows, PocketBase ne recharge pas les hooks ; redémarrer après modification.

// ── Création : toutes origines (API, import, $app.save) ──────────────────────
onRecordCreate((e) => {
  const col = e.record.collection();
  if (!col.system) {
    const fields = col.fields;
    const now = new DateTime();
    if (fields.getByName('base44_created_date') && !e.record.getString('base44_created_date')) {
      e.record.set('base44_created_date', now);
    }
    if (fields.getByName('base44_updated_date') && !e.record.getString('base44_updated_date')) {
      e.record.set('base44_updated_date', e.record.get('base44_created_date') || now);
    }

    // Valeurs par défaut des champs texte / select / date / json restés vides.
    // (bool et nombre : seulement via l'API, quand le champ est absent du corps — voir plus bas.)
    const defaults = require(`${__hooks}/lib/defaults.js`)[col.name] || {};
    for (const name of Object.keys(defaults)) {
      const field = fields.getByName(name);
      if (!field) continue;
      const type = field.type();
      if (type === 'bool' || type === 'number') continue;
      const current = e.record.get(name);
      const empty = type === 'json'
        ? (current === null || current === undefined || String(current) === '' || String(current) === 'null')
        : !e.record.getString(name);
      if (empty) e.record.set(name, defaults[name]);
    }

    if (col.name === 'users' && !e.record.getString('role')) e.record.set('role', 'user');
  }
  e.next();
});

// ── Création via l'API ───────────────────────────────────────────────────────
onRecordCreateRequest((e) => {
  const col = e.record.collection();
  if (!col.system) {
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }

    // bool / nombre : défaut seulement si le champ est absent du corps (false / 0 envoyés restent tels quels).
    const defaults = require(`${__hooks}/lib/defaults.js`)[col.name] || {};
    for (const name of Object.keys(defaults)) {
      const field = col.fields.getByName(name);
      if (!field) continue;
      const type = field.type();
      if ((type === 'bool' || type === 'number') && (body[name] === undefined || body[name] === null)) {
        e.record.set(name, defaults[name]);
      }
    }

    // Un client (non superuser) ne fixe pas lui-même les dates système.
    if (!e.hasSuperuserAuth()) {
      const now = new DateTime();
      if (col.fields.getByName('base44_created_date')) e.record.set('base44_created_date', now);
      if (col.fields.getByName('base44_updated_date')) e.record.set('base44_updated_date', now);
    }
  }
  e.next();
});

// ── Mise à jour via l'API ────────────────────────────────────────────────────
onRecordUpdateRequest((e) => {
  const col = e.record.collection();
  if (!col.system && !e.hasSuperuserAuth()) {
    // Un client ne modifie ni la date de création ni la date de mise à jour.
    if (col.fields.getByName('base44_created_date')) {
      e.record.set('base44_created_date', e.record.original().get('base44_created_date'));
    }
    if (col.fields.getByName('base44_updated_date')) e.record.set('base44_updated_date', new DateTime());
  }
  e.next();
});

// ── Mise à jour : toutes origines ────────────────────────────────────────────
// base44_updated_date = maintenant, sauf si l'appelant l'a explicitement changée
// (import des données d'origine par un superuser, ou valeur déjà posée ci-dessus).
onRecordUpdate((e) => {
  const col = e.record.collection();
  if (!col.system && col.fields.getByName('base44_updated_date')) {
    const before = e.record.original().getString('base44_updated_date');
    if (before === e.record.getString('base44_updated_date')) {
      e.record.set('base44_updated_date', new DateTime());
    }
  }
  e.next();
});
