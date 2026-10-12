import { base44 } from "@/api/base44Client";
import { getQueue, removeFromQueue } from "@/lib/offlineQueue";
import { pushProgress } from "@/lib/readingProgress";

// Rejoue une action en attente. Lève une erreur en cas d'échec (elle reste alors en file).
async function replay(action) {
  const p = action.payload;
  if (action.type === "annotation") {
    const found = await base44.entities.BibleAnnotation.filter(
      { translation_id: p.translation_id, book_id: p.book_id, chapter: p.chapter, verse: p.verse },
      "-verse",
      1
    );
    const existing = Array.isArray(found) ? found[0] : found?.items?.[0];
    if (existing) await base44.entities.BibleAnnotation.update(existing.id, p.data);
    else {
      await base44.entities.BibleAnnotation.create({
        translation_id: p.translation_id,
        book_id: p.book_id,
        chapter: p.chapter,
        verse: p.verse,
        highlight_color: null,
        note: null,
        ...p.data,
      });
    }
    return;
  }
  if (action.type === "progress") {
    await pushProgress(p.versionId, p.progress);
    return;
  }
  if (action.type === "message") {
    const result = await base44.functions.invoke("createMessage", p.body);
    await base44.entities.Conversation.update(p.body.conversation_id, {
      last_message_text: p.body.text,
      last_message_at: result?.data?.created_date || new Date().toISOString(),
    });
  }
}

let running = false;

// Envoie en arrière-plan tout ce qui attend. Retourne le nombre d'actions envoyées.
export async function flushQueue() {
  if (running || typeof navigator !== "undefined" && !navigator.onLine) return 0;
  running = true;
  let sent = 0;
  try {
    for (const action of getQueue()) {
      try {
        await replay(action);
        removeFromQueue(action.id);
        sent += 1;
      } catch {
        break; // réseau toujours instable : on réessaiera au prochain retour
      }
    }
  } finally {
    running = false;
  }
  return sent;
}