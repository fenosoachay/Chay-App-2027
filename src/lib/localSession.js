const KEY = 'chay-local-session';

// Un profil pour l'affichage local, jamais une autorisation serveur.
// Le jeton de session est conservé par le SDK, pas le mot de passe.
export function readLocalSession(token) {
  if (!token) return null;
  try {
    const profile = JSON.parse(localStorage.getItem(KEY));
    return profile?.id ? profile : null;
  } catch { return null; }
}

export function saveLocalSession(user) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      id: user.id, first_name: user.first_name, full_name: user.full_name,
      settings: user.settings, bible_last_book: user.bible_last_book,
      bible_last_chapter: user.bible_last_chapter,
    }));
  } catch { /* Le stockage peut être indisponible. */ }
}

export function clearLocalSession() {
  localStorage.removeItem(KEY);
}