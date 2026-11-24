import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { migrer, nouvellesCollections, BLOCS_DEPART, VERSETS_DEPART, BANDEAU_DEPART, GROUPES, TOUS_LES_BLOCS, PAGES, TYPES_BLOC, ICONES } from '../scripts/migrer-site-chay.mjs';

const site = chargerLib('siteChay.js');

test('contact : champs valides, nettoyés, sujet connu sinon « Autre »', () => {
  const ok = site.lireContact({ nom: '  Hery  ', email: 'Hery@Exemple.FR ', sujet: 'Question', message: ' Bonjour ', t: 8000 });
  assert.deepEqual(ok, { valeurs: { nom: 'Hery', email: 'hery@exemple.fr', sujet: 'Question', message: 'Bonjour' } });
  assert.equal(site.lireContact({ nom: 'A', email: 'a@b.fr', sujet: '<script>', message: 'x', t: 8000 }).valeurs.sujet, 'Autre');
});

test('contact : erreurs lisibles', () => {
  const base = { nom: 'A', email: 'a@b.fr', message: 'x', t: 8000 };
  assert.equal(site.lireContact({ ...base, nom: '' }).erreur, 'Indiquez votre nom.');
  assert.equal(site.lireContact({ ...base, email: 'pas-une-adresse' }).erreur, 'Adresse e-mail invalide.');
  assert.equal(site.lireContact({ ...base, message: '   ' }).erreur, 'Écrivez votre message.');
  assert.match(site.lireContact({ ...base, message: 'x'.repeat(5001) }).erreur, /trop long/);
  assert.match(site.lireContact({ ...base, nom: 'n'.repeat(101) }).erreur, /trop long/);
});

test('contact : robots ignorés en silence (champ piège, envoi trop rapide)', () => {
  const base = { nom: 'A', email: 'a@b.fr', message: 'x', t: 8000 };
  assert.deepEqual(site.lireContact({ ...base, site_web: 'http://spam' }), { robot: true });
  assert.deepEqual(site.lireContact({ ...base, t: 500 }), { robot: true });
  assert.deepEqual(site.lireContact({ ...base, t: undefined }), { robot: true });
  assert.deepEqual(site.lireContact(null), { robot: true });
});

test('notification des admins : ouvre Administration › Messages', () => {
  const n = site.notificationMessage('m1', 'Hery', 'Question');
  assert.equal(n.route, '/admin/messages');
  assert.equal(n.notification_id, 'message_site_m1');
  assert.equal(n.body, 'Hery : Question');
});

test('liens YouTube reconnus', () => {
  for (const lien of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://www.youtube.com/live/dQw4w9WgXcQ?si=x',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ',
  ]) assert.equal(site.idYoutube(lien), 'dQw4w9WgXcQ', lien);
  for (const lien of ['', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@EgliseChay.fr-tv', 'javascript:alert(1)']) {
    assert.equal(site.idYoutube(lien), '', lien);
  }
});

test('titre oEmbed et détection du direct', () => {
  assert.equal(site.titreOembed('{"title":" Culte du dimanche "}'), 'Culte du dimanche');
  assert.equal(site.titreOembed('pas du json'), '');
  const page = (canon, live) => `<html><link rel="canonical" href="${canon}"><script>{"isLiveNow":${live}}</script>`;
  assert.deepEqual(site.lireDirect(page('https://www.youtube.com/watch?v=abcdefghijk', 'true')), { en_direct: true, video_id: 'abcdefghijk' });
  assert.deepEqual(site.lireDirect(page('https://www.youtube.com/watch?v=abcdefghijk', 'false')), { en_direct: false, video_id: '' });
  assert.deepEqual(site.lireDirect(page('https://www.youtube.com/@EgliseChay.fr-tv', 'true')), { en_direct: false, video_id: '' });
});

test('schéma : lecture publique, écriture admins ; SiteEtat écrit par le serveur seulement', () => {
  const cols = Object.fromEntries(nouvellesCollections().map((c) => [c.name, c]));
  for (const nom of ['SiteVerset', 'SiteBandeau', 'SiteCarrousel', 'SiteCulte', 'SiteAssoPhoto', 'SiteBloc']) {
    assert.equal(cols[nom].listRule, '');
    assert.equal(cols[nom].createRule, '@request.auth.role = "admin"');
    assert.ok(cols[nom].fields.some((f) => f.name === 'base44_created_date'), `${nom} : tri par date possible`);
    assert.ok(cols[nom].fields.some((f) => f.name === 'order'), `${nom} : ordre`);
  }
  assert.equal(cols.SiteEtat.createRule, null);
  assert.equal(cols.SiteEtat.updateRule, null);
});

test('contenus de départ cohérents avec le schéma', () => {
  assert.equal(VERSETS_DEPART.length, 2);
  for (const bloc of TOUS_LES_BLOCS) {
    assert.ok(PAGES.includes(bloc.page), bloc.page);
    assert.ok(TYPES_BLOC.includes(bloc.type), bloc.type);
    if (bloc.icone) assert.ok(ICONES.includes(bloc.icone), bloc.icone);
    assert.ok(bloc.texte.length <= 8000 && bloc.titre.length <= 200 && bloc.reference.length <= 300);
  }
  for (const p of ['foi', 'apropos', 'contact', 'association', 'application']) assert.ok(BLOCS_DEPART.some((x) => x.page === p && x.type === 'intro'), `intro ${p}`);
  assert.equal(BLOCS_DEPART.filter((x) => x.page === 'application' && x.type === 'fonction').length, 14);
  assert.equal(GROUPES.pied.filter((x) => x.type === 'reseau').length, 4);
});

// Faux serveur PocketBase (collections, enregistrements, filtre « cle="…" », tri -order, PATCH).
function fauxServeur(etat) {
  let n = 0;
  return async (u, opt = {}) => {
    const { pathname, searchParams } = new URL(u);
    const m = opt.method || 'GET';
    const json = (st, o) => ({ ok: st < 400, status: st, json: async () => o, text: async () => JSON.stringify(o) });
    if (m !== 'GET') etat.ecritures++;
    let r;
    if ((r = pathname.match(/^\/api\/collections\/([^/]+)$/))) {
      const nom = r[1];
      if (m === 'GET') return etat.collections.has(nom) ? json(200, structuredClone(etat.collections.get(nom))) : json(404, {});
      if (m === 'PATCH') { Object.assign(etat.collections.get(nom), JSON.parse(opt.body)); return json(200, {}); }
    }
    if (pathname === '/api/collections' && m === 'POST') {
      const def = JSON.parse(opt.body); etat.collections.set(def.name, def); etat.lignes.set(def.name, []); return json(200, def);
    }
    if ((r = pathname.match(/^\/api\/collections\/([^/]+)\/records$/))) {
      const nom = r[1];
      let items = [...(etat.lignes.get(nom) || [])];
      const f = (searchParams.get('filter') || '').match(/^cle="(.+)"$/);
      if (f) items = items.filter((x) => x.cle === f[1]);
      if (searchParams.get('sort') === '-order') items.sort((a, z) => (z.order || 0) - (a.order || 0));
      if (m === 'GET') return json(200, { totalItems: items.length, items: items.slice(0, Number(searchParams.get('perPage')) || 30) });
      const rec = { id: `r${++n}`, ...JSON.parse(opt.body) };
      etat.lignes.get(nom).push(rec); return json(200, rec);
    }
    if ((r = pathname.match(/^\/api\/collections\/([^/]+)\/records\/([^/]+)$/)) && m === 'PATCH') {
      Object.assign(etat.lignes.get(r[1]).find((x) => x.id === r[2]), JSON.parse(opt.body)); return json(200, {});
    }
    return json(500, { inconnu: pathname });
  };
}

test('migration : base neuve, simulation sans écriture, puis application idempotente', async () => {
  const etat = { collections: new Map([['ContactMessage', { name: 'ContactMessage', fields: [{ name: 'name' }] }]]), lignes: new Map(), ecritures: 0 };
  const vrai = globalThis.fetch;
  globalThis.fetch = fauxServeur(etat);
  try {
    const sim = await migrer('http://pb', {});
    assert.equal(etat.ecritures, 0);
    assert.ok(sim.includes('SiteBloc') && sim.includes('SiteVisite') && sim.includes('ContactMessage (source)'));
    await migrer('http://pb', {}, { appliquer: true });
    assert.equal(etat.lignes.get('SiteBloc').length, TOUS_LES_BLOCS.length + 1);
    const numero = etat.lignes.get('SiteBloc').filter((x) => x.page === 'association' && x.type === 'whatsapp');
    assert.equal(numero.length, 1, "un seul numéro pour l'association");
    assert.equal(numero[0].texte, BLOCS_DEPART.find((x) => x.type === 'don').reference);
    assert.equal(etat.lignes.get('SiteVerset')[1].order, 1);
    assert.equal(etat.lignes.get('SiteBandeau').length, BANDEAU_DEPART.length);
    assert.deepEqual(JSON.parse(etat.lignes.get('SiteEtat').find((x) => x.cle === 'graines_site').valeur), [...Object.keys(GROUPES), 'association-numero']);
    const avant = etat.ecritures;
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
    assert.equal(etat.ecritures, avant);
  } finally {
    globalThis.fetch = vrai;
  }
});

test('migration : base en ligne (1re version) -> listes élargies, nouveaux groupes ajoutés une seule fois', async () => {
  const anciennes = nouvellesCollections().filter((c) => c.name !== 'SiteVisite').map((c) => structuredClone(c));
  const bloc = anciennes.find((c) => c.name === 'SiteBloc');
  for (const f of bloc.fields) {
    if (f.name === 'page') f.values = ['foi', 'apropos', 'contact', 'association', 'application'];
    if (f.name === 'type') f.values = f.values.filter((v) => !['titre', 'entete', 'pied', 'reseau', 'copyright', 'bouton'].includes(v));
    if (f.name === 'icone') f.values = f.values.slice(0, 20);
  }
  const etat = {
    collections: new Map([...anciennes.map((c) => [c.name, c]), ['ContactMessage', { name: 'ContactMessage', fields: [{ name: 'source' }] }]]),
    lignes: new Map(anciennes.map((c) => [c.name, []])),
    ecritures: 0,
  };
  etat.lignes.set('SiteVerset', [{ id: 'v1' }]);
  etat.lignes.set('SiteBandeau', [{ id: 'b1' }]);
  etat.lignes.set('SiteBloc', BLOCS_DEPART.map((x, i) => ({ id: `x${i}`, ...x, order: i })));
  const vrai = globalThis.fetch;
  globalThis.fetch = fauxServeur(etat);
  try {
    const sim = await migrer('http://pb', {});
    assert.equal(etat.ecritures, 0);
    assert.ok(sim.includes('SiteVisite'));
    assert.ok(sim.some((c) => c.startsWith('SiteBloc (listes')));
    assert.ok(sim.includes('SiteBloc pied (5)'));
    await migrer('http://pb', {}, { appliquer: true });
    const pages = bloc.fields.find((f) => f.name === 'page').values;
    assert.ok(pages.includes('pied') && pages.includes('copyright') && pages.includes('accueil'));
    const lignes = etat.lignes.get('SiteBloc');
    assert.equal(lignes.length, TOUS_LES_BLOCS.length + 1);
    assert.ok(lignes.filter((x) => x.type !== 'whatsapp' || x.page !== 'association').every((x, i) => x.order === i), 'les nouveaux blocs se placent après les anciens');
    assert.ok(sim.some((c) => c.startsWith("SiteBloc numéro de l'association")));
    // Un bloc supprimé dans l'app (copyright, numéro) ne revient pas au passage suivant.
    etat.lignes.set('SiteBloc', lignes.filter((x) => x.type !== 'copyright' && !(x.page === 'association' && x.type === 'whatsapp')));
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
    assert.ok(!etat.lignes.get('SiteBloc').some((x) => x.type === 'copyright' || (x.page === 'association' && x.type === 'whatsapp')));
  } finally {
    globalThis.fetch = vrai;
  }
});

test('visites : jour à Paris, heure d’hiver et d’été', () => {
  assert.equal(site.jourParis(Date.UTC(2026, 10, 23, 22, 59)), '2026-11-23');
  assert.equal(site.jourParis(Date.UTC(2026, 10, 23, 23, 0)), '2026-11-24'); // minuit à Paris (UTC+1)
  assert.equal(site.jourParis(Date.UTC(2026, 6, 1, 21, 59)), '2026-07-01');
  assert.equal(site.jourParis(Date.UTC(2026, 6, 1, 22, 0)), '2026-07-02'); // minuit à Paris (UTC+2)
});
