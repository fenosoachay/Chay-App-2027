package io.chay.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Widget « Verset du jour » posé depuis l'app (Réglages) : Android affiche sa propre fenêtre « Ajouter à l'écran
 * d'accueil ? », sans passer par la liste des widgets du téléphone (certains, comme Xiaomi, ne la montrent pas).
 *  - etat() : { pose: nombre de widgets déjà posés, possible: le téléphone accepte la demande }
 *  - ajouter() : { demande: vrai si la fenêtre d'Android a été ouverte }
 */
@CapacitorPlugin(name = "ChayWidget")
public class ChayWidgetPlugin extends Plugin {
    private ComponentName composant() {
        return new ComponentName(getContext(), VersetWidget.class);
    }

    private boolean possible(AppWidgetManager m) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && m != null && m.isRequestPinAppWidgetSupported();
    }

    @PluginMethod
    public void etat(PluginCall call) {
        Context ctx = getContext();
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m != null ? m.getAppWidgetIds(composant()) : null;
        JSObject res = new JSObject();
        res.put("pose", ids != null ? ids.length : 0);
        res.put("possible", possible(m));
        call.resolve(res);
    }

    @PluginMethod
    public void ajouter(PluginCall call) {
        AppWidgetManager m = AppWidgetManager.getInstance(getContext());
        JSObject res = new JSObject();
        if (!possible(m)) {
            res.put("demande", false);
            call.resolve(res);
            return;
        }
        boolean ok = false;
        try {
            ok = m.requestPinAppWidget(composant(), null, null);
        } catch (Exception erreur) {
            ok = false;
        }
        res.put("demande", ok);
        call.resolve(res);
    }
}
