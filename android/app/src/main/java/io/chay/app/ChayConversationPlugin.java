package io.chay.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pont entre les notifications de conversation (ConversationNotifier) et l'app :
 *  - « reponse » : texte saisi dans la réponse rapide (l'app envoie le message, puis ouvre la conversation) ;
 *  - effacer({ conversation }) : retire la notification de cette conversation.
 */
@CapacitorPlugin(name = "ChayConversation")
public class ChayConversationPlugin extends Plugin {

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !ConversationNotifier.ACTION_REPONDRE.equals(intent.getAction())) return;
        Bundle saisie = RemoteInput.getResultsFromIntent(intent);
        CharSequence texte = saisie != null ? saisie.getCharSequence(ConversationNotifier.CLE_REPONSE) : null;
        String conversation = intent.getStringExtra(ConversationNotifier.EXTRA_CONVERSATION);
        if (!ConversationNotifier.idValide(conversation)) return;
        JSObject data = new JSObject();
        data.put("conversation", conversation);
        data.put("texte", texte != null ? texte.toString() : "");
        data.put("route", intent.getStringExtra(ConversationNotifier.EXTRA_ROUTE));
        // Gardé jusqu'à l'écoute de l'app (lancement à froid compris).
        notifyListeners("reponse", data, true);
        // Une réponse ne doit pas être traitée deux fois (rotation, retour à l'activité).
        intent.setAction(Intent.ACTION_MAIN);
    }

    @PluginMethod
    public void effacer(PluginCall call) {
        ConversationNotifier.effacer(getContext(), call.getString("conversation"));
        call.resolve();
    }
}
