// Bible › « Sagesse en audio » : collection BibleAudio. Chapitre maximal du livre (1.3.8 : Proverbes 31,
// Ecclésiaste 12 ; les Psaumes sont retirés). Un livre inconnu est refusé ici aussi (en plus du schéma).
// Création et modification par les admins de l'app (règles) ; le superuser n'est pas contrôlé ici.

function verifierChapitreBible(e) {
  // Superuser (tableau d'administration, scripts de réparation) : pas de contrôle ici, le schéma s'applique.
  if (e.hasSuperuserAuth()) return e.next();
  const max = { proverbes: 31, ecclesiaste: 12, hebreux: 13 }[e.record.getString('book')];
  const chapitre = e.record.getInt('chapter');
  if (!max) throw new BadRequestError('Livre inconnu : proverbes, ecclesiaste ou hebreux.');
  if (chapitre < 1 || chapitre > max) {
    throw new BadRequestError(`Chapitre invalide : ${e.record.getString('book')} compte ${max} chapitres.`);
  }
  e.next();
}

onRecordCreateRequest(verifierChapitreBible, 'BibleAudio');
onRecordUpdateRequest(verifierChapitreBible, 'BibleAudio');
