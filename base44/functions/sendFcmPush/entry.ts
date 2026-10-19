import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Envoi de notifications push natives via Firebase Cloud Messaging (API HTTP v1).
// - Compte de service stocké dans le secret FIREBASE_SERVICE_ACCOUNT (jamais côté frontend).
// - Auth : accepte (a) un test direct limité à l'utilisateur connecté,
//   (b) un appel direct admin, ou (c) un appel interne prouvé par
//   INTERNAL_INVOKE_SECRET (seul le backend connaît cette valeur).
// - Récupère les tokens actifs des destinataires, envoie, et désactive les tokens
//   invalides (UNREGISTERED). Envoi par lots (concurrence 20).
const CHANNEL_ID = "chay-default";

function b64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function jsonB64(obj) {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(obj)));
}
function pemToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = jsonB64(header) + "." + jsonB64(payload);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = signingInput + "." + b64urlBytes(new Uint8Array(sig));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error("Token FCM non obtenu : " + (json.error_description || JSON.stringify(json)));
  }
  return json.access_token;
}

async function sendOne(projectId, accessToken, token, title, body, targetType, targetId) {
  const url = "https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send";
  const message = {
    token,
    notification: { title, body },
    android: {
      notification: {
        channel_id: CHANNEL_ID,
        default_vibrate_timings: true,
        notification_count: 1,
      },
    },
    data: {
      target_type: String(targetType || ""),
      target_id: String(targetId || ""),
    },
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    return {
      ok: false,
      invalid: false,
      httpStatus: null,
      errorCodes: [],
      classification: "transport_error",
      raw: { status: "transport_error" },
    };
  }
  let raw = null;
  try { raw = await res.json(); } catch { raw = { status: res.status }; }
  if (res.ok) return { ok: true, httpStatus: res.status, raw };
  const errName =
    (raw && raw.error && raw.error.details && raw.error.details[0] && raw.error.details[0].errorCode) ||
    (raw && raw.error && raw.error.status) ||
    "";
  const errorCodes = [
    ...(Array.isArray(raw?.error?.details)
      ? raw.error.details.map((detail) => detail?.errorCode).filter(Boolean)
      : []),
    raw?.error?.status,
  ].filter(Boolean);
  const classification = errName === "UNREGISTERED"
    ? "unregistered_token"
    : errName === "INVALID_ARGUMENT"
    ? "invalid_argument_not_deactivated"
    : errName || `http_${res.status}`;
  return {
    ok: false,
    invalid: errName === "UNREGISTERED",
    httpStatus: res.status,
    errorCodes,
    classification,
    raw,
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Authentification : admin direct (test) OU appel interne prouvé.
    let user = null;
    try { user = await base44.auth.me(); } catch { /* appel interne */ }
    const internalProof = body.internal_secret && body.internal_secret === secrets.get("INTERNAL_INVOKE_SECRET");
    const isAdmin = user?.role === "admin";
    const isUserTest = Boolean(user && body.test === true);
    if (!isAdmin && !internalProof && !isUserTest) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Destinataires.
    let userIds = Array.isArray(body.user_ids) ? body.user_ids.filter(Boolean) : [];
    if (isUserTest) userIds = [user.id];
    if (userIds.length === 0) {
      return Response.json({ sent: 0, tokensFound: 0, failed: 0, firebaseResponses: [] });
    }

    const title = String(body.title || "Chay").slice(0, 100);
    const msgBody = String(body.body || "").slice(0, 100);
    const targetType = body.target_type || "";
    const targetId = body.target_id || "";

    // Push navigateur (Web Push) — indépendant de la configuration FCM.
    // Invoqué AVANT la vérification des tokens : un utilisateur sans app
    // Android reçoit quand même la notification sur son navigateur.
    let webPush = { sent: 0, failed: 0, subscriptions: 0, deactivated: 0, skipped: null, byUser: [] };
    try {
      const res = await base44.asServiceRole.functions.invoke("sendWebPush", {
        user_ids: userIds,
        title,
        body: msgBody,
        target_type: targetType,
        target_id: targetId,
        internal_secret: secrets.get("INTERNAL_INVOKE_SECRET"),
      });
      const r = (res && (res.data || res)) || {};
      webPush = {
        sent: r.sent || 0,
        failed: r.failed || 0,
        subscriptions: r.subscriptions || 0,
        deactivated: r.deactivated || 0,
        skipped: r.skipped || null,
        byUser: Array.isArray(r.byUser) ? r.byUser : [],
      };
    } catch {
      // Le push natif doit continuer même si le push navigateur échoue.
      webPush.skipped = "invoke_failed";
      console.error("[sendFcmPush] Appel Web Push impossible.", {
        classification: "web_push_invoke_failed",
      });
    }

    const saRaw = secrets.get("FIREBASE_SERVICE_ACCOUNT");
    let sa = null;
    let fcmConfigError = null;
    if (saRaw) {
      try {
        sa = JSON.parse(saRaw);
      } catch (error) {
        fcmConfigError = "FIREBASE_SERVICE_ACCOUNT invalide : " + (error?.message || String(error));
      }
    } else {
      fcmConfigError = "FIREBASE_SERVICE_ACCOUNT manquant";
    }

    // Récupération des tokens actifs.
    const tokenRecords = [];
    const recipientResults = [];
    for (const uid of userIds) {
      const rows = await base44.asServiceRole.entities.DeviceToken
        .filter({ user_id: uid, is_active: true }, null, 50);
      // Sécurité : `user_id` est un champ client-writable. On n'envoie qu'aux
      // tokens dont le créateur (created_by_id, fixé côté serveur) correspond
      // au user_id revendiqué. Un attaquant peut créer un DeviceToken avec
      // user_id = victime, mais created_by_id restera son propre id : la ligne
      // est ignorée et la notification de la victime ne fuit pas vers lui.
      const validRows = (Array.isArray(rows) ? rows : []).filter(
        (r) => r.created_by_id === uid
      );
      const recipient = {
        recipientIndex: recipientResults.length + 1,
        tokensFound: validRows.length,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        deactivated: 0,
        tokenResults: [],
      };
      const recipientIndex = recipientResults.push(recipient) - 1;
      for (const r of validRows) {
        tokenRecords.push({ ...r, recipientIndex });
      }
    }

    if (!sa || tokenRecords.length === 0) {
      for (let i = 0; i < recipientResults.length; i += 1) {
        const recipient = recipientResults[i];
        const webResult = webPush.byUser?.[i];
        console.info("[sendFcmPush] Résultat destinataire.", {
          recipientIndex: recipient.recipientIndex,
          android: {
            tokensFound: recipient.tokensFound,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            deactivated: 0,
            classification: fcmConfigError ? "configuration_error" : "no_active_tokens",
          },
          web: {
            attempted: webResult?.attempted || 0,
            succeeded: webResult?.succeeded || 0,
            failed: webResult?.failed || 0,
            deactivated: webResult?.deactivated || 0,
            skipped: webPush.skipped,
          },
        });
      }
      return Response.json({
        sent: 0,
        tokensFound: tokenRecords.length,
        failed: 0,
        firebaseResponses: [],
        fcmError: fcmConfigError,
        webPush,
        recipients: recipientResults,
      });
    }

    let accessToken;
    try {
      accessToken = await getAccessToken(sa);
    } catch (error) {
      for (let i = 0; i < recipientResults.length; i += 1) {
        const recipient = recipientResults[i];
        const webResult = webPush.byUser?.[i];
        console.error("[sendFcmPush] Authentification Firebase impossible.", {
          recipientIndex: recipient.recipientIndex,
          android: {
            tokensFound: recipient.tokensFound,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            deactivated: 0,
            classification: "firebase_authentication_failed",
          },
          web: {
            attempted: webResult?.attempted || 0,
            succeeded: webResult?.succeeded || 0,
            failed: webResult?.failed || 0,
            deactivated: webResult?.deactivated || 0,
            skipped: webPush.skipped,
          },
        });
      }
      throw error;
    }
    const projectId = sa.project_id;

    let sent = 0, failed = 0;
    let deactivated = 0;
    const invalidIds = [];
    const firebaseResponses = [];

    // Envoi par lots (concurrence 20).
    const CHUNK = 20;
    for (let i = 0; i < tokenRecords.length; i += CHUNK) {
      const chunk = tokenRecords.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async (rec) => {
        const r = await sendOne(projectId, accessToken, rec.token, title, msgBody, targetType, targetId);
        firebaseResponses.push(r.raw);
        const recipient = recipientResults[rec.recipientIndex];
        recipient.attempted += 1;
        const result = r.ok
          ? {
            httpStatus: r.httpStatus || 200,
            classification: "accepted",
          }
          : {
            httpStatus: r.httpStatus,
            errorCodes: r.errorCodes,
            classification: r.classification,
          };
        recipient.tokenResults.push(result);
        if (r.ok) {
          sent += 1;
          recipient.succeeded += 1;
        }
        else {
          failed += 1;
          recipient.failed += 1;
          if (r.invalid) {
            invalidIds.push({ id: rec.id, recipientIndex: rec.recipientIndex });
          }
        }
      }));
    }

    // Désactivation des tokens invalides.
    for (const invalid of invalidIds) {
      await base44.asServiceRole.entities.DeviceToken
        .update(invalid.id, { is_active: false })
        .then(() => {
          deactivated += 1;
          recipientResults[invalid.recipientIndex].deactivated += 1;
        })
        .catch(() => {});
    }

    for (let i = 0; i < recipientResults.length; i += 1) {
      const recipient = recipientResults[i];
      const webResult = webPush.byUser?.[i];
      console.info("[sendFcmPush] Résultat destinataire.", {
        recipientIndex: recipient.recipientIndex,
        android: {
          tokensFound: recipient.tokensFound,
          attempted: recipient.attempted,
          succeeded: recipient.succeeded,
          failed: recipient.failed,
          deactivated: recipient.deactivated,
          responses: recipient.tokenResults,
        },
        web: {
          attempted: webResult?.attempted || 0,
          succeeded: webResult?.succeeded || 0,
          failed: webResult?.failed || 0,
          deactivated: webResult?.deactivated || 0,
          skipped: webPush.skipped,
        },
      });
    }

    return Response.json({
      sent,
      failed,
      tokensFound: tokenRecords.length,
      invalidDeactivated: deactivated,
      firebaseResponses,
      webPush,
      recipients: recipientResults,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}