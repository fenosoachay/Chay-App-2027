// Novembre 2026 : marges des barres système. Sur les anciens Android (Galaxy Note 9, Android 10), la WebView renvoie 0
// pour env(safe-area-inset-*) alors que la barre de navigation recouvre le bas de l'app : le champ « Message… »
// passait sous les boutons d'Android. Toute l'app doit donc passer par --sa-top / --sa-bottom / --sa-left / --sa-right
// (src/index.css), qui prennent aussi la place mesurée par MainActivity.java.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");

function fichiers(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return fichiers(p);
    return /\.(jsx?|css)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : [];
  });
}

test("aucun env(safe-area-inset-*) direct dans l'app (sauf la définition des variables --sa-*)", () => {
  const fautifs = [];
  for (const f of fichiers(racine)) {
    const lignes = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lignes.forEach((l, i) => {
      if (!/env\(\s*safe-area-inset/.test(l)) return;
      const definition = f.endsWith(`${path.sep}index.css`) && (/^\s*--sa-(top|bottom|left|right):/.test(l) || /^\s*\*/.test(l) || /^\s*\/\*/.test(l));
      if (!definition) fautifs.push(`${path.relative(racine, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(fautifs, [], "utiliser var(--sa-top|bottom|left|right) à la place de env(safe-area-inset-*)");
});

test("les quatre variables --sa-* prennent la plus grande valeur entre env() et la mesure d'Android", () => {
  const css = fs.readFileSync(path.join(racine, "index.css"), "utf8");
  for (const [cote, mesure] of [["top", "etat"], ["bottom", "bas"], ["left", "gauche"], ["right", "droite"]]) {
    assert.match(css, new RegExp(`--sa-${cote}: max\\(env\\(safe-area-inset-${cote}, 0px\\), var\\(--chay-barre-${mesure}, 0px\\)\\);`));
  }
});

test("MainActivity transmet les quatre mesures à la page", () => {
  const java = fs.readFileSync(path.join(racine, "..", "android/app/src/main/java/io/chay/app/MainActivity.java"), "utf8");
  for (const nom of ["--chay-barre-etat", "--chay-barre-bas", "--chay-barre-gauche", "--chay-barre-droite"]) assert.ok(java.includes(`"${nom}"`), nom);
  assert.match(java, /WindowInsetsCompat\.Type\.systemBars\(\)/);
});
