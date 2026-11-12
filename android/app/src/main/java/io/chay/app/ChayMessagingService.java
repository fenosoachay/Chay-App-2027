package io.chay.app;

import android.content.Intent;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.MessagingService;

/**
 * Remplace le service FCM du plugin PushNotifications (AndroidManifest : tools:node="remove").
 * Un message privé en style conversation (données style=conversation, envoyées par le sidecar) est affiché par
 * l'app elle-même (ConversationNotifier : bulle ou conversation), AVANT l'affichage automatique d'Android, qui
 * ne sait faire ni bulle ni réponse rapide. Tout le reste (contenus, verset, jeton FCM…) suit le chemin habituel
 * du plugin, sans changement.
 */
public class ChayMessagingService extends MessagingService {

    private static final String RECEPTION = "com.google.android.c2dm.intent.RECEIVE";

    @Override
    public void handleIntent(Intent intent) {
        Bundle data = intent != null ? intent.getExtras() : null;
        if (intent != null && RECEPTION.equals(intent.getAction()) && data != null
            && "message".equals(data.getString("target_type"))
            && "conversation".equals(data.getString("style"))) {
            try {
                if (ConversationNotifier.afficher(getApplicationContext(), data)) return;
            } catch (RuntimeException erreur) {
                // repli : notification classique d'Android ci-dessous
            }
        }
        super.handleIntent(intent);
    }
}
