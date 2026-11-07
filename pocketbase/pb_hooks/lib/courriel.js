// E-mails de notification (français), envoyés par le client SMTP de PocketBase (réglages « Mail settings »).
// Tout texte venant d'un membre est échappé ; le sujet est nettoyé (pas de retour à la ligne).

const AMP = String.fromCharCode(38);

function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, `${AMP}amp;`)
    .replace(/</g, `${AMP}lt;`)
    .replace(/>/g, `${AMP}gt;`)
    .replace(/"/g, `${AMP}quot;`)
    .replace(/'/g, `${AMP}#39;`);
}

/** Sujet sur une ligne, sans caractère de contrôle, 150 caractères au plus. */
function cleanSubject(s) {
  const ctrl = new RegExp('[\u0000-\u001f\u007f\u2028\u2029]+', 'g');
  return String(s || '').replace(ctrl, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
}

/** Adresse publique de l'app (réglage « Application URL » de PocketBase), sans / final. */
function appUrl() {
  return String($app.settings().meta.appURL || '').replace(/\/+$/, '');
}

function button(href, label) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:18px;background:linear-gradient(100deg,#4A6CFE 0%,#8A56E2 50%,#FF57B2 100%);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:999px;">${escapeHtml(label)}</a>`;
}

function paragraph(htmlInner, style) {
  return `<p style="margin:0 0 8px;font-size:15px;color:#3f3f46;${style || ''}">${htmlInner}</p>`;
}

/** Gabarit commun (repris de Base44). `bodyHtml` doit déjà être échappé. */
function shell(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
    + '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e4e4e7;">'
    + '<div style="background:linear-gradient(100deg,#4A6CFE 0%,#8A56E2 50%,#FF57B2 100%);padding:24px 32px;color:#fff;font-size:20px;font-weight:800;">Église Chay</div>'
    + `<div style="padding:28px 32px;"><h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#18181b;">${escapeHtml(title)}</h1>${bodyHtml}`
    + '<p style="margin-top:24px;font-size:13px;color:#71717a;">— L\'équipe de l\'Église Chay</p></div>'
    + '<div style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center;">'
    + `<a href="${escapeHtml(`${appUrl()}/settings`)}" style="color:#71717a;text-decoration:underline;">Gérer mes préférences de notifications / Se désabonner</a></div>`
    + '</div></body></html>';
}

/** Envoie un e-mail ; lève une erreur si l'envoi échoue. */
function send(to, subject, html, text) {
  const meta = $app.settings().meta;
  const message = new MailerMessage({
    from: { address: meta.senderAddress, name: meta.senderName || 'Église Chay' },
    to: [{ address: to }],
    subject: cleanSubject(subject),
    html,
    text: text || '',
  });
  $app.newMailClient().send(message);
}

/** Envoi « au mieux » : renvoie true / false, journalise sans adresse ni contenu. */
function trySend(context, to, subject, html, text) {
  if (!to) return false;
  try {
    send(to, subject, html, text);
    return true;
  } catch (_) {
    $app.logger().warn('[courriel] envoi impossible', 'contexte', context);
    return false;
  }
}

module.exports = { escapeHtml, cleanSubject, appUrl, button, paragraph, shell, send, trySend };
