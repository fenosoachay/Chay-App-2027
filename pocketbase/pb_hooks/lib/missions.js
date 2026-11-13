// Requêtes › « Se missionner » : validation du formulaire (fonction pure, testée hors de PocketBase) et
// e-mail aux admins. La route est dans missions.pb.js ; l'enregistrement va dans la collection MissionRequest
// (lecture et traitement : admins seulement ; création : par la route uniquement, règle null).

const TYPES_MISSION = {
  evangeliser: "Évangéliser au nom de l'église",
  batir_eglise: 'Bâtir une église',
  association: "Travailler avec l'association Chay",
  droits_videos: "Droit d'utilisation des vidéos",
  autre: 'Autre demande',
};
const MAX = { last_name: 100, first_name: 100, phone: 30, address: 300, other_text: 300, details: 3000 };
const LIMITE_PAR_JOUR = 5;

const texte = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const texteLong = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

/**
 * Valide le formulaire. Renvoie { data } (champs nettoyés) ou { erreur } (message en français).
 * Tous les champs d'identité sont obligatoires ; « Autre demande » exige sa précision.
 */
function validerMission(body) {
  const b = body && typeof body === 'object' ? body : {};
  const data = {
    last_name: texte(b.last_name),
    first_name: texte(b.first_name),
    phone: texte(b.phone),
    address: texte(b.address),
    kind: texte(b.kind),
    other_text: texte(b.other_text),
    details: texteLong(b.details),
  };
  const requis = [['last_name', 'Le nom'], ['first_name', 'Le prénom'], ['phone', 'Le numéro de téléphone'], ['address', "L'adresse"]];
  for (const [k, libelle] of requis) if (!data[k]) return { erreur: `${libelle} est obligatoire.` };
  const age = Number(typeof b.age === 'string' ? b.age.trim() : b.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) return { erreur: "L'âge doit être un nombre entier entre 1 et 120." };
  data.age = age;
  if (!/^\+?[0-9 .()-]{6,30}$/.test(data.phone) || (data.phone.match(/[0-9]/g) || []).length < 6) {
    return { erreur: 'Le numéro de téléphone est invalide.' };
  }
  if (!Object.prototype.hasOwnProperty.call(TYPES_MISSION, data.kind)) return { erreur: 'Choisissez le type de demande.' };
  if (data.kind === 'autre' && !data.other_text) return { erreur: 'Précisez votre demande.' };
  if (data.kind !== 'autre') data.other_text = '';
  for (const k of Object.keys(MAX)) {
    if (data[k].length > MAX[k]) return { erreur: `Le champ « ${k} » dépasse ${MAX[k]} caractères.` };
  }
  return { data };
}

/** Libellé lisible du type de demande (avec la précision pour « Autre demande »). */
function libelleMission(kind, otherText) {
  const base = TYPES_MISSION[kind] || 'Demande';
  return kind === 'autre' && otherText ? `${base} : ${otherText}` : base;
}

/** Contenu de l'e-mail aux admins : { sujet, html, texte }. `mail` = lib/courriel.js. */
function courrielMission(mail, d, lien) {
  const sujet = `Se missionner : ${libelleMission(d.kind, d.other_text)} — ${d.first_name} ${d.last_name}`;
  const lignes = [
    ['Demande', libelleMission(d.kind, d.other_text)],
    ['Nom', d.last_name],
    ['Prénom', d.first_name],
    ['Âge', String(d.age)],
    ['Téléphone', d.phone],
    ['Adresse', d.address],
  ];
  const html = mail.shell('Nouvelle demande « Se missionner »',
    lignes.map(([k, v]) => mail.paragraph(`<strong>${mail.escapeHtml(k)} :</strong> ${mail.escapeHtml(v)}`)).join('')
    + (d.details ? mail.paragraph(`<strong>Dites-nous un peu plus :</strong><br>${mail.escapeHtml(d.details).replace(/\n/g, '<br>')}`) : '')
    + mail.button(lien, 'Voir dans le panneau admin'));
  const texteBrut = `${lignes.map(([k, v]) => `${k} : ${v}`).join('\n')}${d.details ? `\n\nDites-nous un peu plus :\n${d.details}` : ''}\n\n${lien}`;
  return { sujet, html, texte: texteBrut };
}

module.exports = { TYPES_MISSION, LIMITE_PAR_JOUR, validerMission, libelleMission, courrielMission };
