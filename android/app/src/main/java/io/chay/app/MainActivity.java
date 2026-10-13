package io.chay.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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