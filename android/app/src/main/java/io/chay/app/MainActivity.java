package io.chay.app;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    // Place réelle (en px CSS) cachée sous les barres système de chaque côté de la WebView : 0 si Android place
    // déjà la WebView à côté de la barre, sa taille si l'appli s'affiche bord à bord. Ordre : haut (barre d'état),
    // bas (barre de navigation), gauche, droite. Novembre 2026 : les quatre côtés, car sur les anciens Android
    // (Galaxy Note 9, Android 10) la WebView renvoie 0 pour env(safe-area-inset-*) alors que la barre de
    // navigation recouvre le bas de la page (src/index.css, variables --sa-*).
    private final int[] barres = new int[4];
    private static final String[] NOMS_BARRES = { "--chay-barre-etat", "--chay-barre-bas", "--chay-barre-gauche", "--chay-barre-droite" };

    // L'application est exclusivement en français : on force la locale française
    // sur le contexte de l'activité pour que TOUS les textes fournis par Android
    // (boutons OK / Annuler des dialogues, demande d'autorisation, sélecteur de
    // liens externes…) s'affichent en français, quelle que soit la langue du
    // téléphone.
    @Override
    protected void attachBaseContext(Context newBase) {
        super.attachBaseContext(withFrenchLocale(newBase));
    }

    private static Context withFrenchLocale(Context context) {
        Locale french = Locale.FRENCH;
        Locale.setDefault(french);
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.setLocale(french);
        // Taille de police du téléphone neutralisée pour toute l'app (la WebView en dérive sa taille de texte).
        config.fontScale = 1.0f;
        return context.createConfigurationContext(config);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalLinkPlugin.class);
        registerPlugin(AndroidExoPlayerPlugin.class);
        registerPlugin(AndroidMediaNotificationPlugin.class);
        registerPlugin(ChayConversationPlugin.class);
        registerPlugin(ChayGaleriePlugin.class);
        registerPlugin(ChayMiseAJourPlugin.class);
        registerPlugin(ChayTvPlugin.class);
        registerPlugin(ChayPartagePlugin.class);
        registerPlugin(ChayWidgetPlugin.class);
        registerPlugin(ChayIdentifiantsPlugin.class);
        // Android 16 (API 36) : l'appli s'affiche toujours bord à bord. Capacitor 8 (SystemBars, insetsHandling
        // « native ») garde la page sous les barres ou lui donne les bons env(safe-area-inset-*).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // Widget « Verset du jour » : rafraîchi à chaque ouverture de l'app.
        VersetWidget.toutRafraichir(getApplicationContext());
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Lecture sans geste utilisateur (enchaînement des vidéos/musiques).
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            // Taille du texte indépendante du réglage « Taille de police » du téléphone : l'app s'affiche partout
            // comme à 100 %. La taille propre à l'app (Paramètres > Affichage, src/lib/taillePolice.js) reste active.
            webView.getSettings().setTextZoom(100);
            // 1.3.37 : barre du haut de l'appli centrée (même espace au-dessus et en dessous des icônes) :
            // la page reçoit la place exacte prise par la barre d'état (variable CSS --chay-barre-etat).
            // Capacitor 8 : on ne remplace plus l'écouteur d'encarts de la WebView (Capacitor s'en sert) ; on mesure
            // après chaque mise en page la partie de la WebView réellement cachée sous la barre d'état (0 si Capacitor
            // a déjà décalé la WebView), pour ne jamais compter deux fois cet espace.
            webView.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or2, ob) -> mesurerBarreEtat((WebView) v));
        }
        // Fond transparent (capacitor.config.json) seulement pendant le lancement : le dégradé de la fenêtre
        // (styles.xml) apparaît à travers la WebView, sans éclair blanc. Dès que la page est chargée, son propre
        // dégradé (#chay-boot-splash) couvre l'écran : la WebView redevient opaque, car une WebView transparente
        // peut afficher les vidéos (iframe YouTube) en noir.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                view.setBackgroundColor(couleurFondOpaque());
                // Réappliqué une fois la page chargée : rien ne doit avoir remis la taille du téléphone.
                view.getSettings().setTextZoom(100);
                mesurerBarreEtat(view);
                transmettreBarreEtat(view);
            }
        });
    }

    private void mesurerBarreEtat(WebView view) {
        if (view == null) return;
        WindowInsetsCompat encarts = ViewCompat.getRootWindowInsets(view);
        int[] nouvelles = new int[4];
        if (encarts != null) {
            Insets b = encarts.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int[] position = new int[2];
            view.getLocationInWindow(position);
            View racine = view.getRootView();
            int largeur = racine.getWidth(), hauteur = racine.getHeight();
            float densite = getResources().getDisplayMetrics().density;
            int[] cache = {
                b.top - position[1] - view.getPaddingTop(),
                (position[1] + view.getHeight()) - (hauteur - b.bottom) - view.getPaddingBottom(),
                b.left - position[0] - view.getPaddingLeft(),
                (position[0] + view.getWidth()) - (largeur - b.right) - view.getPaddingRight(),
            };
            for (int i = 0; i < 4; i++) nouvelles[i] = Math.round(Math.max(0, cache[i]) / densite);
        }
        if (!java.util.Arrays.equals(nouvelles, barres)) {
            System.arraycopy(nouvelles, 0, barres, 0, 4);
            transmettreBarreEtat(view);
        }
    }

    private void transmettreBarreEtat(WebView view) {
        if (view == null) return;
        StringBuilder js = new StringBuilder("(function(s){");
        for (int i = 0; i < 4; i++) js.append("s.setProperty('").append(NOMS_BARRES[i]).append("','").append(barres[i]).append("px');");
        js.append("})(document.documentElement.style)");
        view.post(() -> view.evaluateJavascript(js.toString(), null));
    }

    // Rotation, clavier, barre de navigation affichée ou masquée (Samsung) : on remesure.
    @Override
    public void onConfigurationChanged(Configuration nouvelle) {
        super.onConfigurationChanged(nouvelle);
        remesurerPlusTard();
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) remesurerPlusTard();
    }

    private void remesurerPlusTard() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.postDelayed(() -> mesurerBarreEtat(webView), 300);
    }

    /** Fond de l'application (--background de src/index.css) : clair #FDFBF7, sombre noir. */
    private int couleurFondOpaque() {
        int nuit = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nuit == Configuration.UI_MODE_NIGHT_YES ? Color.BLACK : Color.rgb(253, 251, 247);
    }

    // Capacitor met le WebView en pause avec l'activité (onPause puis onStop),
    // ce qui coupe le son YouTube / vidéo dès que l'écran s'éteint. On relance
    // aussitôt le WebView pour que la lecture continue en arrière-plan.
    private void keepWebViewRunning() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.onResume();
        webView.resumeTimers();
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewRunning();
    }
}