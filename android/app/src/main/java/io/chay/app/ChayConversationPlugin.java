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
 *  - effacer({ conversation }) : retire la notification de cette conversation ;
 *  - « ouvrir » : toucher la notification de lecture -> route du titre en cours (RouteMedia).
 */
@CapacitorPlugin(name = "ChayConversation")
public class ChayConversationPlugin extends Plugin {

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // Toucher la notification de lecture (RouteMedia) : « ouvrir » avec la route du titre en cours.
        if (intent != null && RouteMedia.ACTION.equals(intent.getAction())) {
            String route = intent.getStringExtra(RouteMedia.EXTRA);
            if (RouteMedia.valide(route)) {
                JSObject data = new JSObject();
                data.put("route", route);
                notifyListeners("ouvrir", data, true); // gardé jusqu'à l'écoute de l'app (lancement à froid)
            }
            intent.setAction(Intent.ACTION_MAIN);
            return;
        }
        if (intent == null || !ConversationNotifier.ACTION_REPONDRE.equals(intent.getAction())) return;
        Bundle saisie = RemoteInput.getResultsFromIntent(intent);
        CharSequence texte = saisie != null ? saisie.getCharSequence(ConversationNotifier.CLE_REPONSE) : null;
        // 1.3.34 : bouton « J'aime 👍 » : texte fixe, sans saisie ; l'app l'envoie sans ouvrir la conversation.
        String fixe = intent.getStringExtra(ConversationNotifier.EXTRA_TEXTE);
        boolean aime = texte == null && ConversationNotifier.AIME.equals(fixe);
        if (aime) texte = fixe;
        String conversation = intent.getStringExtra(ConversationNotifier.EXTRA_CONVERSATION);
        if (!ConversationNotifier.idValide(conversation)) return;
        JSObject data = new JSObject();
        data.put("conversation", conversation);
        data.put("texte", texte != null ? texte.toString() : "");
        data.put("route", intent.getStringExtra(ConversationNotifier.EXTRA_ROUTE));
        data.put("aime", aime);
        // Gardé jusqu'à l'écoute de l'app (lancement à froid compris).
        notifyListeners("reponse", data, true);
        // Une réponse ne doit pas être traitée deux fois (rotation, retour à l'activité).
        intent.setAction(Intent.ACTION_MAIN);
    }

    @PluginMethod
    public void effacer(PluginCall call) {
        // Dans la bulle de discussion : on ne retire pas la notification, sinon la bulle disparaît avec elle.
        if (!(getActivity() instanceof BubbleActivity)) {
            ConversationNotifier.effacer(getContext(), call.getString("conversation"));
        }
        call.resolve();
    }

    /** L'app a-t-elle été ouverte en touchant une notification (ou dans une bulle) ? -> pas d'animation d'accueil. */
    @PluginMethod
    public void lancement(PluginCall call) {
        Intent i = getActivity() != null ? getActivity().getIntent() : null;
        boolean depuisNotification = getActivity() instanceof BubbleActivity
            || (i != null && (i.hasExtra("google.message_id") || i.hasExtra("target_type")
                || RouteMedia.ACTION.equals(i.getAction())));
        JSObject res = new JSObject();
        res.put("notification", depuisNotification);
        call.resolve(res);
    }
}
