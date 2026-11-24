import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  normalizeTheme,
  readStoredTheme,
  persistTheme,
  shouldApplyDark,
} from "./theme.js";

// --- Storage factice compatible localStorage -----------------------------
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => delete data[k],
    _data: data,
  };
}

// --- Défauts --------------------------------------------------------------
test("DEFAULT_THEME is dark (clair n'est plus le thème par défaut)", () => {
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(THEME_STORAGE_KEY, "chay-theme");
});

test("sans préférence enregistrée => mode sombre", () => {
  const storage = makeStorage(); // aucun "chay-theme"
  assert.equal(readStoredTheme(storage), "dark");
  assert.equal(shouldApplyDark(readStoredTheme(storage), false), true);
});

test("une préférence 'light' est prioritaire sur le défaut sombre", () => {
  const storage = makeStorage({ [THEME_STORAGE_KEY]: "light" });
  assert.equal(readStoredTheme(storage), "light");
  assert.equal(shouldApplyDark(readStoredTheme(storage), true), false);
});

test("une préférence 'dark' est restaurée", () => {
  const storage = makeStorage({ [THEME_STORAGE_KEY]: "dark" });
  assert.equal(readStoredTheme(storage), "dark");
  assert.equal(shouldApplyDark("dark", false), true);
});

test("la lecture ne modifie jamais le stockage (pas d'écrasement de la préférence)", () => {
  const storage = makeStorage({ [THEME_STORAGE_KEY]: "light" });
  readStoredTheme(storage);
  assert.equal(storage._data[THEME_STORAGE_KEY], "light");

  const empty = makeStorage();
  readStoredTheme(empty);
  assert.equal(empty.getItem(THEME_STORAGE_KEY), null);
});

// --- Normalisation --------------------------------------------------------
test("les valeurs inconnues / corrompues retombent sur le défaut sombre", () => {
  for (const bad of [null, undefined, "", "system", "DAY", "0", "{"]) {
    assert.equal(normalizeTheme(bad), "dark");
  }
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("auto"), "auto");
});

test("un stockage inaccessible (throw) => défaut sombre", () => {
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readStoredTheme(broken), "dark");
  assert.equal(readStoredTheme(null), "dark");
});

// --- Persistance ----------------------------------------------------------
test("persistTheme enregistre une valeur normalisée", () => {
  const storage = makeStorage();
  persistTheme(storage, "light");
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "light");
  persistTheme(storage, "bogus");
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "dark");
});

// --- Résolution "auto" ----------------------------------------------------
test("'auto' suit la préférence système", () => {
  assert.equal(shouldApplyDark("auto", true), true);
  assert.equal(shouldApplyDark("auto", false), false);
});

// --- Cycle complet : choix -> fermeture -> réouverture --------------------
function simulateSession(storage, systemDark = false) {
  // index.html (script inline, lecture seule)
  const themeAtBoot = readStoredTheme(storage);
  const appliedDark = shouldApplyDark(themeAtBoot, systemDark);
  // React (useTheme) : même source de vérité
  assert.equal(appliedDark, shouldApplyDark(readStoredTheme(storage), systemDark));
  return { themeAtBoot, appliedDark };
}

test("première installation => démarrage en sombre", () => {
  const storage = makeStorage();
  const { themeAtBoot, appliedDark } = simulateSession(storage);
  assert.equal(themeAtBoot, "dark");
  assert.equal(appliedDark, true);
});

test("utilisateur choisit clair, ferme, rouvre => clair restauré", () => {
  const storage = makeStorage();
  // Session 1 : l'utilisateur sélectionne "light" (setPref + useTheme écrivent tous deux)
  persistTheme(storage, "light");
  // Session 2 : nouvelle ouverture
  const { themeAtBoot, appliedDark } = simulateSession(storage);
  assert.equal(themeAtBoot, "light");
  assert.equal(appliedDark, false);
});

test("utilisateur choisit sombre, ferme, rouvre => sombre restauré", () => {
  const storage = makeStorage();
  persistTheme(storage, "dark");
  const { themeAtBoot, appliedDark } = simulateSession(storage);
  assert.equal(themeAtBoot, "dark");
  assert.equal(appliedDark, true);
});

// --- Script anti-flash (public/demarrage.js, chargé en <head> par index.html) ---
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
function extractInlineThemeScript() {
  const html = readFileSync(path.join(racine, "index.html"), "utf8");
  assert.match(html, /<head>[\s\S]*<script src="\/demarrage\.js"><\/script>[\s\S]*<\/head>/, "demarrage.js chargé dans <head>");
  return readFileSync(path.join(racine, "public/demarrage.js"), "utf8");
}

test("index.html : aucun script écrit dans la page (protection CSP de membres.chay.fr)", () => {
  const html = readFileSync(path.join(racine, "index.html"), "utf8");
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  assert.ok(scripts.length >= 3);
  for (const s of scripts) assert.match(s, /\ssrc="/, `script sans fichier : ${s}`);
  assert.doesNotMatch(html, /\son[a-z]+="/, "pas de onclick=… dans la page");
});

function runInlineScript({ storedTheme, systemDark }) {
  const store = new Map();
  if (storedTheme !== null && storedTheme !== undefined) {
    store.set(THEME_STORAGE_KEY, storedTheme);
  }
  const classes = new Set();
  const sandbox = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    document: {
      documentElement: {
        classList: {
          add: (c) => classes.add(c),
          toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
        },
      },
    },
    window: {
      matchMedia: (q) => ({ matches: q.includes("dark") ? systemDark : !systemDark }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractInlineThemeScript(), sandbox);
  return {
    darkApplied: classes.has("dark"),
    persistedValue: store.has(THEME_STORAGE_KEY) ? store.get(THEME_STORAGE_KEY) : null,
  };
}

test("script inline : aucune préférence => sombre appliqué avant React", () => {
  const { darkApplied } = runInlineScript({ storedTheme: null, systemDark: false });
  assert.equal(darkApplied, true);
});

test("script inline : préférence 'light' respectée (pas d'écrasement)", () => {
  const { darkApplied, persistedValue } = runInlineScript({
    storedTheme: "light",
    systemDark: true, // même si le système est sombre, le choix prime
  });
  assert.equal(darkApplied, false);
  assert.equal(persistedValue, "light", "le script ne doit pas modifier la préférence");
});

test("script inline : préférence 'dark' appliquée", () => {
  const { darkApplied } = runInlineScript({ storedTheme: "dark", systemDark: false });
  assert.equal(darkApplied, true);
});

test("script inline : 'auto' suit le système", () => {
  assert.equal(runInlineScript({ storedTheme: "auto", systemDark: true }).darkApplied, true);
  assert.equal(runInlineScript({ storedTheme: "auto", systemDark: false }).darkApplied, false);
});

test("script inline : valeur corrompue => sombre", () => {
  const { darkApplied } = runInlineScript({ storedTheme: "nimporte-quoi", systemDark: false });
  assert.equal(darkApplied, true);
});
