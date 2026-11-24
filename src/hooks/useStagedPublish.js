import { useRef, useState } from "react";

/**
 * File d'attente de publication (« à publier »).
 *
 * On ajoute autant d'entrées que voulu dans la fenêtre — rien n'est envoyé au
 * serveur — puis un seul « Publier » les écrit toutes d'un coup.
 *
 * La file vit dans l'état du composant : elle survit à la fermeture de la
 * fenêtre (fermer, revenir, tout y est toujours), mais pas au rechargement de
 * la page.
 *
 * @param entity     handler Base44 (base44.entities.Devotional, …)
 * @param dateField  champ date de l'entité (« reading_date » ou « date »)
 * @param build      (draft) => payload serveur
 * @param resolveId  (draft, prev, server) => id de l'entrée à mettre à jour,
 *                   undefined pour en créer une, null pour refuser la date
 *                   (déjà occupée par une autre entrée)
 * @param onCreated  (created, payload) => void, après chaque création réussie (facultatif)
 */
export default function useStagedPublish({
  entity,
  dateField,
  build,
  resolveId,
  allowMultiplePerDate = false,
  onCreated,
}) {
  const [pending, setPending] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const pendingKey = useRef(0);

  const atDate = (list, day) =>
    (Array.isArray(list) ? list : []).find((e) => e && e[dateField] === day) ||
    null;

  // Ajoute (ou remplace) l'entrée du jour dans la file. Rien n'est envoyé.
  const stage = (draft, serverEntries, blockedMessage) => {
    const day = draft[dateField];
    const sameEntry = (entry) =>
      (draft.__pendingKey && entry.__pendingKey === draft.__pendingKey) ||
      (draft.id && entry.id === draft.id);
    const prev = allowMultiplePerDate
      ? pending.find(sameEntry) || null
      : atDate(pending, day);
    const server = allowMultiplePerDate
      ? serverEntries?.find((entry) => draft.id && entry.id === draft.id) || null
      : atDate(serverEntries, day);
    const id = resolveId(draft, prev, server);
    if (id === null) {
      return { ok: false, error: blockedMessage || "Date déjà occupée" };
    }
    const staged = {
      ...draft,
      id,
      ...(allowMultiplePerDate
        ? { __pendingKey: draft.__pendingKey || `pending-${++pendingKey.current}` }
        : {}),
      __pending: true,
    };
    const next = allowMultiplePerDate
      ? prev
        ? pending.map((entry) => (sameEntry(entry) ? staged : entry))
        : [...pending, staged]
      : [...pending.filter((p) => p[dateField] !== day), staged];
    setPending(next);
    return { ok: true, pendingCount: next.length };
  };

  // Retire une entrée précise, ou l'entrée d'une date pour les anciens appels.
  const discard = (target) => {
    const removed = typeof target === "object" && target !== null
      ? pending.find((entry) =>
        (target.__pendingKey && entry.__pendingKey === target.__pendingKey) ||
        (target.id && entry.id === target.id)
      )
      : atDate(pending, target);
    if (removed) {
      setPending((list) =>
        list.filter((entry) =>
          typeof target === "object" && target !== null
            ? entry !== removed
            : entry[dateField] !== target
        )
      );
    }
    return removed;
  };

  // Plusieurs entrées d'un coup (1.3.27 : 50 versets du jour importés), une par date : même règle que `stage`,
  // appliquée en chaîne (un seul changement d'état). Les dates refusées (resolveId -> null) sont renvoyées.
  const stageMany = (drafts, serverEntries) => {
    let next = [...pending];
    const refusees = [];
    for (const draft of drafts || []) {
      const day = draft[dateField];
      const id = resolveId(draft, atDate(next, day), atDate(serverEntries, day));
      if (id === null) { refusees.push(day); continue; }
      next = [...next.filter((p) => p[dateField] !== day), { ...draft, id, __pending: true }];
    }
    setPending(next);
    return { ok: (drafts || []).length - refusees.length, refusees, pendingCount: next.length };
  };

  // Écrit toute la file. Le serveur accepte au plus 20 créations par 5 secondes (limite PocketBase « *:create ») :
  // 4 écritures à la fois, et une écriture refusée pour cette raison (429) est retentée après une courte attente
  // (1.3.28 : 50 versets d'un coup donnaient « 20 publié(s), 30 en échec »). Les autres échecs restent dans la file.
  const publish = async (serverEntries) => {
    const list = [...pending];
    if (!list.length) return { ok: 0, failed: 0 };
    setPublishing(true);
    const attendre = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
    const ecrire = async (entry) => {
      const server = allowMultiplePerDate
        ? (entry.id && serverEntries?.find((item) => item.id === entry.id)) || null
        : atDate(serverEntries, entry[dateField]);
      const id = resolveId(entry, null, server);
      if (id === null) {
        throw new Error("Date déjà occupée par une autre entrée");
      }
      const payload = build(entry);
      for (let essai = 0; ; essai += 1) {
        try {
          if (id) await entity.update(id, payload);
          else {
            const created = await entity.create(payload);
            // Après une création réussie seulement (ex. notification de la nouvelle réunion) ; jamais bloquant.
            try { onCreated?.(created, payload); } catch { /* best-effort */ }
          }
          return;
        } catch (e) {
          if (e?.status !== 429 || essai >= 8) throw e;
          await attendre(5500);
        }
      }
    };
    try {
      const echecs = new Set();
      let suivant = 0;
      const travailleur = async () => {
        while (suivant < list.length) {
          const i = suivant;
          suivant += 1;
          try { await ecrire(list[i]); } catch { echecs.add(i); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, list.length) }, travailleur));
      const failed = list.filter((_, i) => echecs.has(i));
      setPending(failed);
      return { ok: list.length - failed.length, failed: failed.length };
    } finally {
      setPublishing(false);
    }
  };

  return { pending, publishing, stage, stageMany, discard, publish };
}
