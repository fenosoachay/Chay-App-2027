// Bible › « Sagesse en audio » (1.3.7) : collection BibleAudio. Le schéma borne le chapitre de 1 à 150 ; ici, le
// chapitre maximal du livre (Proverbes : 31, Psaumes : 150). Création et modification (admins seulement : règles).

function verifierChapitreBible(e) {
  const max = { proverbes: 31, psaumes: 150 }[e.record.getString('book')];
  const chapitre = e.record.getInt('chapter');
  if (max && (chapitre < 1 || chapitre > max)) {
    throw new BadRequestError(`Chapitre invalide : ${e.record.getString('book')} compte ${max} chapitres.`);
  }
  e.next();
}

onRecordCreateRequest(verifierChapitreBible, 'BibleAudio');
onRecordUpdateRequest(verifierChapitreBible, 'BibleAudio');
