package io.chay.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Partage d'un texte (verset du jour, lien de l'app) : la fenêtre de partage d'Android s'ouvre avec toutes les
 * applications du téléphone (WhatsApp, Messenger, SMS, e-mail…). La WebView ne connaît pas navigator.share.
 */
@CapacitorPlugin(name = "ChayPartage")
public class ChayPartagePlugin extends Plugin {
    @PluginMethod
    public void partager(PluginCall call) {
        String texte = call.getString("texte", "");
        String titre = call.getString("titre", "Partager");
        if (texte == null || texte.trim().isEmpty()) {
            call.reject("Rien à partager.");
            return;
        }
        Intent envoi = new Intent(Intent.ACTION_SEND);
        envoi.setType("text/plain");
        envoi.putExtra(Intent.EXTRA_TEXT, texte);
        Intent choix = Intent.createChooser(envoi, titre);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(choix);
                call.resolve();
            } catch (ActivityNotFoundException erreur) {
                call.reject("Aucune application ne peut partager ce texte.", erreur);
            }
        });
    }
}
