package io.chay.app;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
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
        return context.createConfigurationContext(config);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalLinkPlugin.class);
        registerPlugin(AndroidExoPlayerPlugin.class);
        registerPlugin(AndroidMediaNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Lecture sans geste utilisateur (enchaînement des vidéos/musiques).
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
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