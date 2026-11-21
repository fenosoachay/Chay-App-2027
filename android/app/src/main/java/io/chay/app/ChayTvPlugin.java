package io.chay.app;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Diffusion sur TV depuis l'app : le téléphone devient la télécommande.
 * Deux familles de TV, trouvées ensemble :
 *  - DLNA (Samsung, LG, Hisense VIDAA, Sony Bravia, Panasonic, Philips…) : DlnaTv + relais du téléphone ;
 *  - Chromecast / Google TV / Android TV (Sony, TCL, Philips, clés Chromecast) : ChromecastTv.
 * Une TV qui sait faire les deux n'apparaît qu'une fois (Chromecast, plus fiable).
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
    private static final Map<String, String> nomsCast = new ConcurrentHashMap<>();
    private static final ExecutorService commandes = Executors.newSingleThreadExecutor();
    private static final ExecutorService recherche = Executors.newSingleThreadExecutor();
    private static final ExecutorService rechercheCast = Executors.newSingleThreadExecutor();
    private static WeakReference<ChayTvPlugin> instance = new WeakReference<>(null);

    private static volatile DlnaTv.Appareil actif;      // diffusion DLNA en cours
    private static volatile String castActif;            // nom de la TV Chromecast en cours
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

    private static String cle(String nom) {
        return nom == null ? "" : nom.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean enCours() {
        return actif != null || castActif != null;
    }

    @PluginMethod
    public void chercher(PluginCall call) {
        final Context ctx = getContext();
        recherche.execute(() -> {
            Future<List<ChromecastTv.Appareil>> casts = rechercheCast.submit(() -> ChromecastTv.chercher(ctx, 3500));
            List<DlnaTv.Appareil> dlna = new ArrayList<>();
            Exception erreurDlna = null;
            try {
                dlna = DlnaTv.chercher(ctx, 3500);
            } catch (Exception e) {
                erreurDlna = e;
            }
            List<ChromecastTv.Appareil> cast = new ArrayList<>();
            try {
                cast = casts.get(8, TimeUnit.SECONDS);
            } catch (Exception ignore) {
                // pas de Chromecast (ou pas de services Google) : DLNA seulement
            }
            if (erreurDlna != null && cast.isEmpty()) {
                call.reject(message(erreurDlna, "Recherche des TV impossible. Vérifiez le Wi-Fi."));
                return;
            }
            JSArray tab = new JSArray();
            Set<String> vus = new HashSet<>();
            for (ChromecastTv.Appareil c : cast) {
                nomsCast.put(c.id, c.nom);
                vus.add(cle(c.nom));
                JSObject o = new JSObject();
                o.put("id", c.id);
                o.put("nom", c.nom);
                o.put("modele", "Chromecast");
                tab.put(o);
            }
            for (DlnaTv.Appareil a : dlna) {
                if (vus.contains(cle(a.nom))) continue;
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
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Ce média ne peut pas être envoyé sur la TV.");
            return;
        }
        if (id != null && id.startsWith(ChromecastTv.PREFIXE)) {
            lancerCast(call, id, url, titre, video, direct, position);
            return;
        }
        final DlnaTv.Appareil a = appareils.get(id);
        if (a == null) {
            call.reject("TV introuvable : relancez la recherche.");
            return;
        }
        commandes.execute(() -> {
            try {
                String ip = RelaisTv.ipLocale();
                if (ip == null) throw new Exception("Connectez le téléphone au Wi-Fi de la TV.");
                arreterCast();
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
                if (!enCours()) {
                    RelaisTv.arreter();
                    ChayTvService.arreter(getContext());
                }
                call.reject(message(e, "La TV n'a pas pu lire ce média."));
            }
        });
    }

    /** Chromecast : la TV lit l'adresse https elle-même ; une adresse http passe par le relais du téléphone. */
    private void lancerCast(PluginCall call, String id, String url, String titre, boolean video, boolean direct, double position) {
        final Context ctx = getContext();
        final String nom = nomsCast.containsKey(id) ? nomsCast.get(id) : "TV";
        commandes.execute(() -> {
            try {
                String mime = DlnaTv.typeDistant(url, video, direct);
                String adresse = url;
                if (url.startsWith("http://")) {
                    String ip = RelaisTv.ipLocale();
                    if (ip == null) throw new Exception("Connectez le téléphone au Wi-Fi de la TV.");
                    RelaisTv relais = RelaisTv.demarrer();
                    adresse = relais.adresse(ip, relais.publier(url, mime), mime);
                }
                final DlnaTv.Appareil ancien = actif;
                if (ancien != null) {
                    actif = null;
                    try {
                        DlnaTv.stop(ancien);
                    } catch (Exception ignore) {
                        // TV DLNA déjà arrêtée
                    }
                }
                ChayTvService.demarrer(ctx, nom, titre);
                ChromecastTv.lancer(ctx, id, adresse, mime, titre, video, direct, position, new ChromecastTv.Resultat<String>() {
                    @Override
                    public void ok(String nomTv) {
                        castActif = nomTv;
                        titreActif = titre;
                        directActif = direct;
                        JSObject r = new JSObject();
                        r.put("nom", nomTv);
                        call.resolve(r);
                    }

                    @Override
                    public void erreur(String m) {
                        if (!enCours()) {
                            RelaisTv.arreter();
                            ChayTvService.arreter(ctx);
                        }
                        call.reject(m);
                    }
                });
            } catch (Exception e) {
                if (!enCours()) {
                    RelaisTv.arreter();
                    ChayTvService.arreter(ctx);
                }
                call.reject(message(e, "La TV n'a pas pu lire ce média."));
            }
        });
    }

    @PluginMethod
    public void commande(PluginCall call) {
        final String action = call.getString("action", "");
        final double position = call.getDouble("position", 0.0);
        if ("arreter".equals(action)) {
            arreterTout(getContext(), false);
            call.resolve();
            return;
        }
        if (castActif != null) {
            ChromecastTv.commande(action, position, new ChromecastTv.Resultat<Boolean>() {
                @Override public void ok(Boolean v) { call.resolve(); }
                @Override public void erreur(String m) { call.reject(m); }
            });
            return;
        }
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
        if (castActif != null) {
            ChromecastTv.volume(delta, new ChromecastTv.Resultat<Integer>() {
                @Override
                public void ok(Integer v) {
                    JSObject r = new JSObject();
                    r.put("volume", v);
                    call.resolve(r);
                }

                @Override public void erreur(String m) { call.reject(m); }
            });
            return;
        }
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
        final String cast = castActif;
        if (cast != null) {
            ChromecastTv.etat(new ChromecastTv.Resultat<ChromecastTv.Etat>() {
                @Override
                public void ok(ChromecastTv.Etat e) {
                    JSObject r = new JSObject();
                    r.put("actif", castActif != null);
                    r.put("nom", cast);
                    r.put("titre", titreActif);
                    r.put("direct", directActif);
                    r.put("etat", e.etat);
                    r.put("position", e.position);
                    r.put("duree", e.duree);
                    call.resolve(r);
                }

                @Override public void erreur(String m) { call.reject(m); }
            });
            return;
        }
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

    private static void arreterCast() {
        if (castActif != null) {
            castActif = null;
            ChromecastTv.arreter();
        }
    }

    /** Fin de la diffusion (bouton de l'app ou de la notification). */
    static void arreterTout(Context ctx, boolean depuisNotification) {
        final DlnaTv.Appareil a = actif;
        actif = null;
        titreActif = "";
        arreterCast();
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
