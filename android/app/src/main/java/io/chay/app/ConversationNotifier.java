package io.chay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.LocusIdCompat;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

/**
 * Notification d'un message privé construite par l'app (et non par Android) :
 *  - Android 11+ : bulle (Bubbles API) si l'utilisateur l'autorise (réglage « Bulles » du téléphone / de l'app /
 *    de la conversation) ;
 *  - sinon, et toujours en plus : notification de style conversation (photo, nom, réponse rapide).
 * Le système choisit tout seul : si les bulles ne sont pas disponibles, la même notification s'affiche en
 * conversation classique (repli automatique).
 */
final class ConversationNotifier {

    static final String CANAL = "chay-messages";
    static final String TAG = "chay-conversation";
    static final String ACTION_REPONDRE = "io.chay.app.REPONDRE";
    static final String CLE_REPONSE = "chay_reponse";
    static final String EXTRA_CONVERSATION = "chay_conversation";
    static final String EXTRA_ROUTE = "chay_route";
    /** 1.3.34 : texte envoyé tel quel, sans saisie (bouton « J'aime 👍 » de la notification). */
    static final String EXTRA_TEXTE = "chay_texte";
    static final String AIME = "\uD83D\uDC4D";

    private ConversationNotifier() {}

    /** Identifiant de conversation sûr (identifiant PocketBase). */
    static boolean idValide(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{1,64}");
    }

    static int notificationId(String conversation) {
        return conversation.hashCode();
    }

    /** Affiche la notification ; false si les données sont incomplètes (Android affiche alors la classique). */
    static boolean afficher(Context ctx, Bundle data) {
        String conversation = data.getString("target_id");
        if (!idValide(conversation)) return false;
        String expediteur = texte(data.getString("expediteur"), "Message");
        String corps = texte(data.getString("gcm.notification.body"), texte(data.getString("body"), ""));
        String route = data.getString("route");
        if (route == null || !route.startsWith("/") || route.startsWith("//")) route = "/messages?c=" + conversation;

        creerCanal(ctx);
        IconCompat icone = IconCompat.createWithAdaptiveBitmap(avatar(data.getString("avatar"), expediteur));
        Person moi = new Person.Builder().setName("Vous").setKey("moi").build();
        Person lui = new Person.Builder().setName(expediteur).setKey("u_" + conversation).setIcon(icone).setImportant(true).build();

        // Raccourci de conversation durable : obligatoire pour les bulles et la section « Conversations ».
        String raccourci = "conv_" + conversation;
        Intent ouvrirRaccourci = intentionOuvrir(ctx, MainActivity.class, conversation, route).setAction(Intent.ACTION_VIEW);
        ShortcutInfoCompat sc = new ShortcutInfoCompat.Builder(ctx, raccourci)
            .setLongLived(true)
            .setShortLabel(expediteur)
            .setIcon(icone)
            .setPerson(lui)
            .setLocusId(new LocusIdCompat(raccourci))
            .setIntent(ouvrirRaccourci)
            .build();
        try {
            ShortcutManagerCompat.pushDynamicShortcut(ctx, sc);
        } catch (RuntimeException ignored) {
            // limite de raccourcis atteinte : notification sans bulle
        }

        // Seulement le DERNIER message : les anciens ne restent plus dans la notification (ils étaient souvent
        // déjà lus ou répondus depuis l'app). La notification est aussi retirée quand la conversation est ouverte.
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(moi);
        style.addMessage(corps, System.currentTimeMillis(), lui);

        int code = notificationId(conversation);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent ouvrir = PendingIntent.getActivity(ctx, code,
            intentionOuvrir(ctx, MainActivity.class, conversation, route),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Réponse rapide : le texte est transmis à l'app, qui envoie le message puis ouvre la conversation.
        Intent repondre = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_REPONDRE)
            .putExtra(EXTRA_CONVERSATION, conversation)
            .putExtra(EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent piRepondre = PendingIntent.getActivity(ctx, code + 1, repondre, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
        RemoteInput saisie = new RemoteInput.Builder(CLE_REPONSE).setLabel("Répondre…").build();
        NotificationCompat.Action actionRepondre = new NotificationCompat.Action.Builder(
            IconCompat.createWithResource(ctx, R.drawable.ic_stat_chay), "Répondre", piRepondre)
            .addRemoteInput(saisie)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(true)
            .setAllowGeneratedReplies(true)
            .build();

        // 1.3.34 : « J'aime » envoie un pouce 👍 en réponse, en un geste.
        Intent aimer = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_REPONDRE)
            .putExtra(EXTRA_CONVERSATION, conversation)
            .putExtra(EXTRA_ROUTE, route)
            .putExtra(EXTRA_TEXTE, AIME)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent piAimer = PendingIntent.getActivity(ctx, code + 3, aimer, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Action actionAimer = new NotificationCompat.Action.Builder(
            IconCompat.createWithResource(ctx, R.drawable.ic_stat_chay), "J'aime", piAimer) // 1.3.35 : sans l'emoji (le pouce reste ce qui est envoyé)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_THUMBS_UP)
            .build();

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_stat_chay)
            .setContentTitle(expediteur)
            .setContentText(corps)
            .setStyle(style)
            .setShortcutId(raccourci)
            .setLocusId(new LocusIdCompat(raccourci))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(ouvrir)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .addPerson(lui)
            .addAction(actionAimer)
            .addAction(actionRepondre);

        // Bulle (Android 11+) : la conversation s'ouvre dans BubbleActivity, une fenêtre flottante.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent bulle = intentionOuvrir(ctx, BubbleActivity.class, conversation, route);
            PendingIntent piBulle = PendingIntent.getActivity(ctx, code + 2, bulle, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
            b.setBubbleMetadata(new NotificationCompat.BubbleMetadata.Builder(piBulle, icone)
                .setDesiredHeight(640)
                .setAutoExpandBubble(false)
                .setSuppressNotification(false)
                .build());
        }

        try {
            NotificationManagerCompat.from(ctx).notify(TAG, code, b.build());
            return true;
        } catch (SecurityException refus) {
            return false; // autorisation POST_NOTIFICATIONS refusée
        }
    }

    /** Retire la notification d'une conversation (après une réponse rapide, ou conversation ouverte). */
    static void effacer(Context ctx, String conversation) {
        if (idValide(conversation)) NotificationManagerCompat.from(ctx).cancel(TAG, notificationId(conversation));
    }

    /**
     * Même extras qu'une notification FCM (google.message_id + données) : le plugin PushNotifications
     * déclenche pushNotificationActionPerformed et l'app ouvre la conversation (routesNotification.js).
     */
    private static Intent intentionOuvrir(Context ctx, Class<?> activite, String conversation, String route) {
        return new Intent(ctx, activite)
            .putExtra("google.message_id", "chay-" + conversation + "-" + System.currentTimeMillis())
            .putExtra("target_type", "message")
            .putExtra("target_id", conversation)
            .putExtra("route", route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private static void creerCanal(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Messages privés", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Messages reçus dans l'application (bulles et conversations).");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) canal.setAllowBubbles(true);
        nm.createNotificationChannel(canal);
    }

    private static String texte(String v, String defaut) {
        return v == null || v.trim().isEmpty() ? defaut : v;
    }

    /** Photo de l'expéditeur (https, 3 s maximum), sinon pastille avec son initiale. */
    private static Bitmap avatar(String url, String nom) {
        Bitmap photo = null;
        if (url != null && url.startsWith("https://")) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                c.setInstanceFollowRedirects(true);
                if (c.getResponseCode() == 200) {
                    try (InputStream in = c.getInputStream()) {
                        photo = BitmapFactory.decodeStream(in);
                    }
                }
            } catch (Exception ignored) {
                photo = null;
            } finally {
                if (c != null) c.disconnect();
            }
        }
        int taille = 192;
        Bitmap out = Bitmap.createBitmap(taille, taille, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        if (photo != null) {
            int cote = Math.min(photo.getWidth(), photo.getHeight());
            Rect src = new Rect((photo.getWidth() - cote) / 2, (photo.getHeight() - cote) / 2,
                (photo.getWidth() + cote) / 2, (photo.getHeight() + cote) / 2);
            canvas.drawBitmap(photo, src, new Rect(0, 0, taille, taille), new Paint(Paint.FILTER_BITMAP_FLAG));
            return out;
        }
        canvas.drawColor(Color.rgb(138, 86, 226));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextSize(taille * 0.42f);
        p.setTextAlign(Paint.Align.CENTER);
        String initiale = nom.trim().isEmpty() ? "?" : nom.trim().substring(0, 1).toUpperCase();
        canvas.drawText(initiale, taille / 2f, taille / 2f - (p.descent() + p.ascent()) / 2f, p);
        return out;
    }
}
