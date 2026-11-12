import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("Musique et Prédication : vignettes de playlists carrées à coins légèrement arrondis", () => {
  const g = lire("src/components/media/GrillePlaylists.jsx");
  assert.match(g, /export const COINS_VIGNETTE = "rounded-\[18%\]/);
  assert.match(g, /className=\{`mx-auto aspect-square w-full mb-1\.5 \$\{COINS_VIGNETTE\}`\}/);
  assert.doesNotMatch(g, /rounded-none/);
  // La vue Musique / Prédication utilise cette grille (playlists et sous-playlists).
  const v = lire("src/components/media/PlaylistCategoryView.jsx");
  assert.match(v, /import GrillePlaylists from "@\/components\/media\/GrillePlaylists";/);
  assert.equal((v.match(/<GrillePlaylists/g) || []).length, 2);
  assert.match(lire("src/components/media/PlaylistCover.jsx"), /overflow-hidden/); // l'image suit l'arrondi
});
