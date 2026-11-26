package io.chay.app;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    // Hauteur réelle (en px CSS) de la barre d'état au-dessus de la WebView : 0 si Android place déjà
    // la WebView sous la barre d'état, sa hauteur si l'appli s'affiche bord à bord (Android 15 et plus).
    private int hautBarreEtat = 0;

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
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets barres = insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
                float densite = getResources().getDisplayMetrics().density;
                hautBarreEtat = Math.round(barres.top / densite);
                transmettreBarreEtat((WebView) v);
                // La WebView garde son propre traitement (env(safe-area-inset-*) dans la page).
                return ViewCompat.onApplyWindowInsets(v, insets);
            });
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
                transmettreBarreEtat(view);
            }
        });
    }

    private void transmettreBarreEtat(WebView view) {
        if (view == null) return;
        view.post(() -> view.evaluateJavascript(
            "document.documentElement.style.setProperty('--chay-barre-etat','" + hautBarreEtat + "px')", null));
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