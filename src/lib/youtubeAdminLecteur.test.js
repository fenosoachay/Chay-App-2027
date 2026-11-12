import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../components/media/YouTubeCategoryView.jsx", import.meta.url), "utf8");

test("admin YouTube : même lecteur que les membres, « Gérer » ouvre l'écran de réorganisation", () => {
  assert.match(src, /const \[gerer, setGerer\] = useState\(false\);/); // lecteur par défaut
  assert.match(src, /if \(isAdmin && gerer\) \{/); // écran de gestion seulement sur demande
  assert.doesNotMatch(src, /if \(isAdmin\) \{\n\s+const orderOf/);
  assert.match(src, /\{isAdmin && !sansGestion && \([\s\S]{0,200}onClick=\{\(\) => setGerer\(true\)\}[\s\S]{0,300}Gérer/);
  assert.match(src, /onClick=\{\(\) => setGerer\(false\)\}[\s\S]{0,300}Retour au lecteur/);
  // L'écran de gestion reste celui d'avant : cadenas, toutes les sections, glisser-déposer, suppression.
  const gestion = src.slice(src.indexOf("if (isAdmin && gerer) {"), src.indexOf("// ── Lecteur (membres ET admins)"));
  for (const motif of [/setYtLocked/, /YouTubeSortableList/, /deleteLink\(v\.id\)/, /Gestion admin — toutes les sections YouTube/]) assert.match(gestion, motif);
  // Le lecteur des membres (cartes + lecture) est commun.
  const lecteur = src.slice(src.indexOf("// ── Lecteur (membres ET admins)"));
  assert.match(lecteur, /<YouTubeCard/);
  assert.match(lecteur, /onPlay=\{startVideoAt\}/);
});
