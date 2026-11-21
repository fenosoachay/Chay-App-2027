package io.chay.app;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Diffusion sur TV (DLNA) depuis l'app : le téléphone devient la télécommande.
 *  - chercher()                 -> { appareils: [{ id, nom, modele }] } (TV du même Wi-Fi)
 *  - lancer({ id, url, titre, video, position, direct })  (direct = radio / flux sans fin)
 *  - commande({ action: pause | reprendre | aller | arreter, position })
 *  - volume({ delta })          -> { volume }
 *  - etat()                     -> { actif, etat, position, duree, nom, titre, direct }
 * Événement « fin » : diffusion arrêtée depuis la notification.
 */
@CapacitorPlugin(name = "ChayTv")
public class ChayTvPlugin extends Plugin {
    private static final Map<String, DlnaTv.Appareil> appareils = new ConcurrentHashMap<>();
    private static final ExecutorService commandes = Executors.newSingleThreadExecutor();
    private static final ExecutorService recherche = Executors.newSingleThreadExecutor();
    private static WeakReference<ChayTvPlugin> instance = new WeakReference<>(null);

    private static volatile DlnaTv.Appareil actif;
    private static volatile String titreActif = "";
    private static volatile boolean directActif = false;

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    private static String message(Exception e, String defaut) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? defaut : m;
    }

    @PluginMethod
    public void chercher(PluginCall call) {
        recherche.execute(() -> {
            try {
                List<DlnaTv.Appareil> liste = DlnaTv.chercher(getContext(), 3500);
                JSArray tab = new JSArray();
                for (DlnaTv.Appareil a : liste) {
                    appareils.put(a.id, a);
                    JSObject o = new JSObject();
                    o.put("id", a.id);
                    o.put("nom", a.nom);
                    o.put("modele", a.modele != null ? a.modele : "");
                    tab.put(o);
                }
                JSObject r = new JSObject();
                r.put("appareils", tab);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(message(e, "Recherche des TV impossible. Vérifiez le Wi-Fi."));
            }
        });
    }

    @PluginMethod
    public void lancer(PluginCall call) {
        final String id = call.getString("id", "");
        final String url = call.getString("url", "");
        final String titre = call.getString("titre", "Chay");
        final boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        final boolean direct = Boolean.TRUE.equals(call.getBoolean("direct", false));
        final double position = call.getDouble("position", 0.0);
        final DlnaTv.Appareil a = appareils.get(id);
        if (a == null) {
            call.reject("TV introuvable : relancez la recherche.");
            return;
        }
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Ce média ne peut pas être envoyé sur la TV.");
            return;
        }
        commandes.execute(() -> {
            try {
                String ip = RelaisTv.ipLocale();
                if (ip == null) throw new Exception("Connectez le téléphone au Wi-Fi de la TV.");
                String mime = DlnaTv.typeDistant(url, video, direct);
                RelaisTv relais = RelaisTv.demarrer();
                String jeton = relais.publier(url, mime);
                String adresse = relais.adresse(ip, jeton, mime);
                ChayTvService.demarrer(getContext(), a.nom, titre);
                try {
                    DlnaTv.stop(a);
                } catch (Exception ignore) {
                    // rien en cours sur la TV
                }
                DlnaTv.charger(a, adresse, titre, mime, video, direct);
                DlnaTv.jouer(a);
                actif = a;
                titreActif = titre;
                directActif = direct;
                if (!direct && position > 3) {
                    for (int i = 0; i < 20; i++) {
                        Thread.sleep(500);
                        String e = DlnaTv.etat(a);
                        if ("PLAYING".equals(e)) break;
                    }
                    try {
                        DlnaTv.aller(a, (long) position);
                    } catch (Exception ignore) {
                        // la TV ne sait pas reprendre au même endroit : lecture depuis le début
                    }
                }
                JSObject r = new JSObject();
                r.put("nom", a.nom);
                call.resolve(r);
            } catch (Exception e) {
                if (actif == null) {
                    RelaisTv.arreter();
                    ChayTvService.arreter(getContext());
                }
                call.reject(message(e, "La TV n'a pas pu lire ce média."));
            }
        });
    }

    @PluginMethod
    public void commande(PluginCall call) {
        final String action = call.getString("action", "");
        final double position = call.getDouble("position", 0.0);
        final DlnaTv.Appareil a = actif;
        if (a == null) {
            call.reject("Aucune diffusion en cours.");
            return;
        }
        commandes.execute(() -> {
            try {
                switch (action) {
                    case "pause": DlnaTv.pause(a); break;
                    case "reprendre": DlnaTv.jouer(a); break;
                    case "aller": DlnaTv.aller(a, (long) position); break;
                    case "arreter": arreterTout(getContext(), false); break;
                    default: throw new Exception("Commande inconnue");
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(message(e, "La TV ne répond pas."));
            }
        });
    }

    @PluginMethod
    public void volume(PluginCall call) {
        final int delta = call.getInt("delta", 0);
        final DlnaTv.Appareil a = actif;
        if (a == null) {
            call.reject("Aucune diffusion en cours.");
            return;
        }
        commandes.execute(() -> {
            try {
                int v = DlnaTv.volume(a);
                if (v < 0) throw new Exception("Réglez le volume avec la télécommande de la TV.");
                JSObject r = new JSObject();
                r.put("volume", DlnaTv.definirVolume(a, v + delta));
                call.resolve(r);
            } catch (Exception e) {
                call.reject(message(e, "Volume indisponible."));
            }
        });
    }

    @PluginMethod
    public void etat(PluginCall call) {
        final DlnaTv.Appareil a = actif;
        if (a == null) {
            JSObject r = new JSObject();
            r.put("actif", false);
            call.resolve(r);
            return;
        }
        commandes.execute(() -> {
            JSObject r = new JSObject();
            r.put("actif", true);
            r.put("nom", a.nom);
            r.put("titre", titreActif);
            r.put("direct", directActif);
            try {
                r.put("etat", DlnaTv.etat(a));
                long[] p = DlnaTv.position(a);
                r.put("position", p[0]);
                r.put("duree", p[1]);
            } catch (Exception e) {
                r.put("etat", "INCONNU");
            }
            call.resolve(r);
        });
    }

    /** Fin de la diffusion (bouton de l'app ou de la notification). */
    static void arreterTout(Context ctx, boolean depuisNotification) {
        final DlnaTv.Appareil a = actif;
        actif = null;
        titreActif = "";
        if (a != null) {
            commandes.execute(() -> {
                try {
                    DlnaTv.stop(a);
                } catch (Exception ignore) {
                    // TV déjà éteinte ou arrêtée
                }
            });
        }
        RelaisTv.arreter();
        ChayTvService.arreter(ctx);
        ChayTvPlugin p = instance.get();
        if (p != null && depuisNotification) p.notifyListeners("fin", new JSObject());
    }
}
