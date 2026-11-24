package io.chay.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Widget « Verset du jour » de l'écran d'accueil du téléphone (1.3.25).
 *  - Affiche le verset du jour (GET https://api.chay.fr/api/chay/verset-du-jour, public) toute la journée ; gardé en
 *    mémoire pour rester visible hors connexion. Nouveau verset juste après minuit (heure de Paris, ~0 h 05, réveil
 *    d'Android) ; contrôles de secours toutes les 3 heures et à chaque ouverture de l'app (connexion revenue…).
 *  - Le toucher ouvre l'app sur l'accueil (même chemin que la notification de lecture : RouteMedia, route « / »).
 */
public class VersetWidget extends AppWidgetProvider {
    static final String ADRESSE = "https://api.chay.fr/api/chay/verset-du-jour";
    private static final String PREFS = "chay_widget_verset";
    private static final int CODE_OUVRIR = 7302;
    private static final int CODE_MINUIT = 7303;
    static final String ACTION_MINUIT = "io.chay.app.WIDGET_VERSET_MINUIT";
    private static final String TEXTE_DEFAUT = "Je puis tout par celui qui me fortifie.";
    private static final String REF_DEFAUT = "Philippiens 4:13";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_MINUIT.equals(intent.getAction())) {
            final PendingResult attente = goAsync();
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, VersetWidget.class));
            programmerMinuit(context);
            new Thread(() -> {
                try {
                    if (ids != null && ids.length > 0 && telecharger(context)) afficher(context, manager, ids);
                } finally {
                    attente.finish();
                }
            }).start();
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onDisabled(Context context) {
        // Plus aucun widget posé : plus de réveil à minuit.
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(intentionMinuit(context));
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        afficher(context, manager, ids);
        programmerMinuit(context);
        final PendingResult attente = goAsync();
        new Thread(() -> {
            try {
                if (telecharger(context)) afficher(context, manager, ids);
            } finally {
                attente.finish();
            }
        }).start();
    }

    /** Met à jour tous les widgets posés (appelé aussi par l'app au démarrage). */
    static void toutRafraichir(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, VersetWidget.class));
        if (ids == null || ids.length == 0) return;
        programmerMinuit(context);
        new Thread(() -> {
            if (telecharger(context)) afficher(context, manager, ids);
        }).start();
    }

    /** Réveil (non exact, sans permission spéciale) au prochain 0 h 05, heure de Paris : jour du verset du serveur. */
    static void programmerMinuit(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Paris"));
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 5);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        am.set(AlarmManager.RTC, c.getTimeInMillis(), intentionMinuit(context));
    }

    private static PendingIntent intentionMinuit(Context context) {
        Intent i = new Intent(context, VersetWidget.class).setAction(ACTION_MINUIT);
        int immuable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        return PendingIntent.getBroadcast(context, CODE_MINUIT, i, PendingIntent.FLAG_UPDATE_CURRENT | immuable);
    }

    private static void afficher(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String texte = p.getString("texte", TEXTE_DEFAUT);
        String ref = p.getString("reference", REF_DEFAUT);
        for (int id : ids) {
            RemoteViews vue = new RemoteViews(context.getPackageName(), R.layout.widget_verset);
            vue.setTextViewText(R.id.widget_verset_texte, "« " + texte + " »");
            vue.setTextViewText(R.id.widget_verset_reference, "— " + ref);
            vue.setOnClickPendingIntent(R.id.widget_verset_racine, ouvrirAccueil(context));
            manager.updateAppWidget(id, vue);
        }
    }

    private static PendingIntent ouvrirAccueil(Context context) {
        Intent i = new Intent(context, MainActivity.class)
            .setAction(RouteMedia.ACTION)
            .putExtra(RouteMedia.EXTRA, "/")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int immuable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        return PendingIntent.getActivity(context, CODE_OUVRIR, i, PendingIntent.FLAG_UPDATE_CURRENT | immuable);
    }

    /** Télécharge le verset du jour ; vrai s'il a été enregistré. */
    private static boolean telecharger(Context context) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(ADRESSE).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() != 200) return false;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String ligne;
                while ((ligne = r.readLine()) != null && sb.length() < 20000) sb.append(ligne);
            }
            JSONObject j = new JSONObject(sb.toString());
            String texte = j.optString("texte", "").trim();
            String ref = j.optString("reference", "").trim();
            if (texte.isEmpty() || ref.isEmpty()) return false;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("texte", texte)
                .putString("reference", ref)
                .apply();
            return true;
        } catch (Exception erreur) {
            return false; // hors connexion : le dernier verset reste affiché
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
