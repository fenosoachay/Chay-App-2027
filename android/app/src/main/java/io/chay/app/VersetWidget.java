package io.chay.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.BlurMaskFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
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
 *  - Design « Nuit dorée » : carte marine-violet à liseré doré (drawable/widget_verset_fond), et dessus une image
 *    dessinée ici avec les polices du site (assets/polices : Instrument Serif, Poppins) : logo et « VERSET DU
 *    JOUR » dorés, ligne dorée, verset en italique blanc (taille ajustée à la place), ligne, référence dorée.
 */
public class VersetWidget extends AppWidgetProvider {
    static final String ADRESSE = "https://api.chay.fr/api/chay/verset-du-jour";
    private static final String PREFS = "chay_widget_verset";
    private static final int CODE_OUVRIR = 7302;
    private static final int CODE_MINUIT = 7303;
    static final String ACTION_MINUIT = "io.chay.app.WIDGET_VERSET_MINUIT";
    private static final String TEXTE_DEFAUT = "Je puis tout par celui qui me fortifie.";
    private static final String REF_DEFAUT = "Philippiens 4:13";
    /**
     * Animation (1.3.26) : 12 images du décor qui s'enchaînent en fondu, une par seconde (ViewFlipper de
     * layout/widget_verset.xml) : cycle calme de 12 s. Un widget ne peut pas faire mieux qu'un tel diaporama.
     */
    static final int[] CADRES = {
        R.id.widget_verset_cadre0, R.id.widget_verset_cadre1, R.id.widget_verset_cadre2, R.id.widget_verset_cadre3,
        R.id.widget_verset_cadre4, R.id.widget_verset_cadre5, R.id.widget_verset_cadre6, R.id.widget_verset_cadre7,
        R.id.widget_verset_cadre8, R.id.widget_verset_cadre9, R.id.widget_verset_cadre10, R.id.widget_verset_cadre11,
    };

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

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        afficher(context, manager, new int[] { id }); // widget agrandi ou réduit : image redessinée à la bonne taille
    }

    private static void afficher(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String texte = p.getString("texte", TEXTE_DEFAUT);
        String ref = p.getString("reference", REF_DEFAUT);
        for (int id : ids) {
            RemoteViews vue = new RemoteViews(context.getPackageName(), R.layout.widget_verset);
            try {
                Bundle o = manager.getAppWidgetOptions(id);
                int largeur = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
                int hauteur = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
                int l = largeur > 0 ? largeur : 300, ht = hauteur > 0 ? hauteur : 150;
                vue.setImageViewBitmap(R.id.widget_verset_image, dessiner(context, texte, ref, l, ht));
                for (int k = 0; k < CADRES.length; k++) {
                    vue.setImageViewBitmap(CADRES[k], cadre(context, l, ht, k / (float) CADRES.length));
                }
            } catch (Throwable erreur) {
                // Dessin impossible (ou mémoire) : l'aperçu fixe (drawable/widget_verset_apercu) reste affiché.
            }
            vue.setOnClickPendingIntent(R.id.widget_verset_racine, ouvrirAccueil(context));
            manager.updateAppWidget(id, vue);
        }
    }

    private static Typeface police(Context context, String fichier, Typeface secours) {
        try {
            return Typeface.createFromAsset(context.getAssets(), "polices/" + fichier);
        } catch (Exception erreur) {
            return secours;
        }
    }

    /** Ligne dorée qui s'estompe sur les bords. */
    private static void ligne(Canvas c, float x0, float x1, float y, float epaisseur, int alpha) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int or = (alpha << 24) | 0xE8C478;
        p.setShader(new LinearGradient(x0, y, x1, y, new int[] { 0x00E8C478, or, or, 0x00E8C478 },
            new float[] { 0f, 0.25f, 0.75f, 1f }, Shader.TileMode.CLAMP));
        c.drawRect(x0, y, x1, y + epaisseur, p);
    }

    /** Lueur douce (couleur ARGB au centre, transparente au bord), étirée en ovale. */
    private static void lueur(Canvas c, float cx, float cy, float rx, float ry, int couleur) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new RadialGradient(0, 0, 1f, new int[] { couleur, couleur & 0x00FFFFFF }, null, Shader.TileMode.CLAMP));
        c.save();
        c.translate(cx, cy);
        c.scale(rx, ry);
        c.drawCircle(0, 0, 1f, p);
        c.restore();
    }

    /** Point doré lumineux (comme les points qui flottent sur chay.fr). */
    private static void point(Canvas c, float x, float y, float r, int alpha) {
        Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
        halo.setColor((Math.min(255, alpha) * 2 / 5 << 24) | 0xFFB800);
        halo.setMaskFilter(new BlurMaskFilter(r * 2.6f, BlurMaskFilter.Blur.NORMAL));
        c.drawCircle(x, y, r * 2.2f, halo);
        Paint coeur = new Paint(Paint.ANTI_ALIAS_FLAG);
        coeur.setColor((alpha << 24) | 0xFFD66E);
        c.drawCircle(x, y, r, coeur);
    }

    /**
     * Une image du décor animé « Reflet doré » (1.3.26), au moment t du cycle (0 à 1) : fond de la carte, lueurs
     * violette, bleue et dorée qui dérivent, points dorés qui montent en brillant, reflet en diagonale qui traverse
     * la carte pendant la première moitié du cycle (comme les affiches « Nouveauté » de chay.fr).
     * Image opaque (coins arrondis exceptés) pour que le fondu d'une image à l'autre ne fasse pas clignoter.
     * Petite taille (480 px de large au plus) : 12 images doivent tenir dans la mémoire du widget.
     */
    static Bitmap cadre(Context context, int largeurDp, int hauteurDp, float t) {
        float d = context.getResources().getDisplayMetrics().density;
        float echelle = Math.min(1f, Math.min(480f / (largeurDp * d), 300f / (hauteurDp * d)));
        float u = d * echelle;
        int w = Math.max(1, Math.round(largeurDp * u));
        int h = Math.max(1, Math.round(hauteurDp * u));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.save();
        android.graphics.Path coins = new android.graphics.Path();
        coins.addRoundRect(new RectF(0, 0, w, h), 24 * u, 24 * u, android.graphics.Path.Direction.CW);
        c.clipPath(coins);
        // Fond (identique à drawable/widget_verset_fond : marine vers violet, de gauche à droite)
        Paint fond = new Paint();
        fond.setShader(new LinearGradient(0, 0, w, 0, new int[] { 0xFF0C0E2C, 0xFF1E1448, 0xFF2E1A5C }, null, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, fond);
        float S = (float) Math.sin(2 * Math.PI * t), C = (float) Math.cos(2 * Math.PI * t);
        lueur(c, w * (0.12f + 0.10f * S), h * (-0.02f + 0.14f * C), w * 0.42f * (1 + 0.08f * S), h * 0.62f * (1 + 0.08f * S), 0x8C8A56E2);
        lueur(c, w * (0.98f - 0.10f * S), h * (1.00f - 0.14f * C), w * 0.40f * (1 - 0.08f * S), h * 0.62f * (1 - 0.08f * S), 0x734A6CFE);
        int alphaOr = Math.round(255 * 0.28f * (0.85f + 0.25f * S));
        lueur(c, w * (0.50f + 0.06f * C), h * 1.12f, w * 0.30f, h * 0.36f, (alphaOr << 24) | 0xFFB800);
        // Points : x, y de départ, rayon (dp), décalage dans le cycle ; ils montent et s'estompent aux extrémités.
        float[][] points = { { 0.09f, 0.80f, 2.0f, 0f }, { 0.88f, 0.45f, 1.6f, 0.35f }, { 0.74f, 0.95f, 1.5f, 0.6f },
            { 0.20f, 0.40f, 1.1f, 0.8f }, { 0.55f, 0.85f, 1.3f, 0.15f } };
        for (float[] pt : points) {
            float f = (t + pt[3]) % 1f;
            int alpha = Math.round(242 * (float) Math.sin(Math.PI * f));
            if (alpha > 0) point(c, w * pt[0], h * (pt[1] - 0.35f * f), pt[2] * u, alpha);
        }
        if (t < 0.5f) {
            double a = Math.toRadians(115);
            float dx = (float) Math.sin(a), dy = (float) -Math.cos(a);
            float L = Math.abs(w * dx) + Math.abs(h * dy);
            float decalage = (-0.75f + 1.5f * (t / 0.5f)) * L;
            float x0 = w / 2f - dx * L / 2f + dx * decalage, y0 = h / 2f - dy * L / 2f + dy * decalage;
            float x1 = w / 2f + dx * L / 2f + dx * decalage, y1 = h / 2f + dy * L / 2f + dy * decalage;
            Paint reflet = new Paint(Paint.ANTI_ALIAS_FLAG);
            reflet.setShader(new LinearGradient(x0, y0, x1, y1,
                new int[] { 0x00FFFFFF, 0x00FFFFFF, 0x38FFFFFF, 0x00FFFFFF, 0x00FFFFFF },
                new float[] { 0f, 0.40f, 0.50f, 0.60f, 1f }, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, reflet);
        }
        c.restore();
        // Liseré doré (comme drawable/widget_verset_fond)
        Paint bord = new Paint(Paint.ANTI_ALIAS_FLAG);
        bord.setStyle(Paint.Style.STROKE);
        bord.setStrokeWidth(Math.max(1f, u));
        bord.setColor(0x8CC9A052);
        float m = bord.getStrokeWidth() / 2f;
        c.drawRoundRect(new RectF(m, m, w - m, h - m), 24 * u, 24 * u, bord);
        return bmp;
    }

    /** Texte du widget (image transparente posée sur le décor animé), à la taille du widget posé. */
    static Bitmap dessiner(Context context, String texte, String ref, int largeurDp, int hauteurDp) {
        float d = context.getResources().getDisplayMetrics().density;
        // Taille plafonnée (mémoire limitée des widgets) : l'image est ensuite agrandie par l'écran.
        float echelle = Math.min(1f, Math.min(1100f / (largeurDp * d), 700f / (hauteurDp * d)));
        float u = d * echelle; // 1 dp en pixels de l'image
        int w = Math.max(1, Math.round(largeurDp * u));
        int h = Math.max(1, Math.round(hauteurDp * u));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        final int OR = 0xFFE8C478;
        // Le décor (fond, lueurs, points, reflet) est dans les images animées, sous ce texte : voir cadre().

        Typeface italique = police(context, "instrument_serif_italique.ttf", Typeface.create(Typeface.SERIF, Typeface.ITALIC));
        Typeface droite = police(context, "instrument_serif.ttf", Typeface.SERIF);
        Typeface poppins = police(context, "poppins_medium.ttf", Typeface.DEFAULT_BOLD);

        float marge = 18 * u;
        float largeurTexte = w - 2 * marge;

        // En-tête : logo + « VERSET DU JOUR »
        TextPaint titre = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        titre.setTypeface(poppins);
        titre.setColor(OR);
        titre.setTextSize(10 * u);
        titre.setLetterSpacing(0.22f);
        String enTete = "VERSET DU JOUR";
        float logo = 14 * u;
        float largeurTitre = titre.measureText(enTete);
        float hauteurTitre = Math.max(logo, 12 * u);

        // Référence
        TextPaint pRef = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        pRef.setTypeface(droite);
        pRef.setColor(OR);
        pRef.setTextSize(12 * u);
        pRef.setLetterSpacing(0.25f);
        String reference = ref.toUpperCase(java.util.Locale.FRENCH);
        float hauteurRef = 15 * u;

        float ecart = 9 * u;
        float fixe = hauteurTitre + ecart + 1 * u + ecart + ecart + 1 * u + ecart + hauteurRef;
        float placeVerset = Math.max(20 * u, h - 2 * 14 * u - fixe);

        // Verset : la plus grande taille (20 à 12 dp) qui tient dans la place ; sinon coupé avec « … ».
        TextPaint pVerset = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        pVerset.setTypeface(italique);
        pVerset.setColor(0xFFFFFFFF);
        // 1.3.36 : espaces insécables : jamais de guillemet seul sur une ligne.
        String corps = "\u00AB\u00A0" + texte.trim() + "\u00A0\u00BB";
        StaticLayout verset = null;
        for (float taille = 20; taille >= 12; taille -= 1) {
            pVerset.setTextSize(taille * u);
            verset = new StaticLayout(corps, pVerset, (int) largeurTexte, Layout.Alignment.ALIGN_CENTER, 1.08f, 0f, false);
            if (verset.getHeight() <= placeVerset) break;
        }
        String coupe = texte;
        while (verset != null && verset.getHeight() > placeVerset && coupe.length() > 20) {
            coupe = coupe.substring(0, coupe.lastIndexOf(' ') > 10 ? coupe.lastIndexOf(' ') : coupe.length() - 10);
            verset = new StaticLayout("\u00AB\u00A0" + coupe + "\u2026\u00A0\u00BB", pVerset, (int) largeurTexte, Layout.Alignment.ALIGN_CENTER, 1.08f, 0f, false);
        }
        float hauteurVerset = verset != null ? verset.getHeight() : 0;

        float total = fixe + hauteurVerset;
        float y = Math.max(10 * u, (h - total) / 2f);

        // Logo doré + titre, centrés ensemble
        float xTitre = (w - (logo + 8 * u + largeurTitre)) / 2f;
        try {
            Drawable dLogo = context.getResources().getDrawable(R.drawable.ic_stat_chay, null);
            dLogo.setColorFilter(new PorterDuffColorFilter(OR, PorterDuff.Mode.SRC_IN));
            int ly = Math.round(y + (hauteurTitre - logo) / 2f);
            dLogo.setBounds(Math.round(xTitre), ly, Math.round(xTitre + logo), Math.round(ly + logo));
            dLogo.draw(c);
        } catch (Exception erreur) {
            xTitre -= (logo + 8 * u) / 2f;
        }
        Paint.FontMetrics fm = titre.getFontMetrics();
        c.drawText(enTete, xTitre + logo + 8 * u, y + hauteurTitre / 2f - (fm.ascent + fm.descent) / 2f, titre);
        y += hauteurTitre + ecart;

        ligne(c, marge + 24 * u, w - marge - 24 * u, y, 1 * u, 170);
        y += 1 * u + ecart;

        if (verset != null) {
            c.save();
            c.translate(marge, y);
            verset.draw(c);
            c.restore();
        }
        y += hauteurVerset + ecart;

        float courte = Math.min(largeurTexte * 0.35f, 120 * u);
        ligne(c, (w - courte) / 2f, (w + courte) / 2f, y, 1 * u, 200);
        y += 1 * u + ecart;

        Paint.FontMetrics fr = pRef.getFontMetrics();
        float largeurRef = pRef.measureText(reference);
        c.drawText(reference, (w - largeurRef) / 2f, y + hauteurRef / 2f - (fr.ascent + fr.descent) / 2f, pRef);
        return bmp;
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
