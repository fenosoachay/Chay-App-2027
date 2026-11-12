package io.chay.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Fenêtre de la bulle d'un message privé (Android 11+). L'app y est chargée comme dans MainActivity ;
 * l'intention de la bulle porte les mêmes données qu'un clic sur la notification (google.message_id,
 * target_type=message, target_id, route), donc l'app ouvre directement la conversation.
 * Activité séparée : MainActivity est en singleTask, ce qu'une bulle n'accepte pas.
 */
public class BubbleActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalLinkPlugin.class);
        registerPlugin(ChayConversationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
