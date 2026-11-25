export function isUnreadIncomingMessage(message, userId) {
  return Boolean(
    isRenderableMessage(message) &&
    message &&
      userId &&
      message.sender_id !== userId &&
      !(message.read_by || []).includes(userId)
  );
}

export function isRenderableMessage(message) {
  if (!message) return false;
  if (message.image_url) return true;
  // 1.3.35 : message vocal, vidéo, document, fichier.
  if (message.piece_jointe && typeof message.piece_jointe === "object" && message.piece_jointe.url) return true;
  const text = typeof message.text === "string"
    ? message.text.trim()
    : String(message.text ?? "").trim();
  return Boolean(text && text !== "0");
}

export function countUnreadMessages(messages, userId) {
  return (Array.isArray(messages) ? messages : []).filter((message) =>
    isUnreadIncomingMessage(message, userId)
  ).length;
}

export function groupMessagesByConversation(messages) {
  const grouped = {};
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message?.conversation_id || !isRenderableMessage(message)) continue;
    (grouped[message.conversation_id] ||= []).push(message);
  }
  Object.values(grouped).forEach((items) =>
    items.sort(
      (left, right) =>
        new Date(left.created_date || 0).getTime() -
        new Date(right.created_date || 0).getTime()
    )
  );
  return grouped;
}

export function canShowMessageNotification(user, prefs) {
  return (
    user?.in_app_messages !== false &&
    prefs?.notifications_enabled !== false &&
    prefs?.notif_messages !== false
  );
}
