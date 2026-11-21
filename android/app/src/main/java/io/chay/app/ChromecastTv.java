package io.chay.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaRouter;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaSeekOptions;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.api.PendingResult;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Diffusion sur Chromecast / Google TV / Android TV (Sony, Philips, TCL…) avec le récepteur standard de Google.
 * Le SDK Cast exige le thread principal : tout passe par « principal ». Résultats par Resultat (thread principal).
 * Sans services Google sur le téléphone : aucune TV Chromecast trouvée, le DLNA continue de fonctionner.
 */
final class ChromecastTv {
    static final String PREFIXE = "cast:";

    interface Resultat<T> {
        void ok(T valeur);
        void erreur(String message);
    }

    static final class Appareil {
        final String id;
        final String nom;

        Appareil(String id, String nom) {
            this.id = id;
            this.nom = nom;
        }
    }

    static final class Etat {
        String etat = "STOPPED";
        long position = -1;
        long duree = -1;
    }

    private static final Handler principal = new Handler(Looper.getMainLooper());
    private static Context appli;

    private ChromecastTv() {}

    private static CastContext contexte(Context ctx) {
        try {
            if (appli == null) appli = ctx.getApplicationContext();
            return CastContext.getSharedInstance(appli);
        } catch (Exception e) {
            return null; // pas de services Google Play
        }
    }

    private static MediaRouteSelector selecteur() {
        return new MediaRouteSelector.Builder()
            .addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID))
            .build();
    }

    /** Bloquant (hors thread principal) : les Chromecast du Wi-Fi trouvés en « ms ». */
    static List<Appareil> chercher(Context ctx, long ms) throws InterruptedException {
        final List<Appareil> trouves = new ArrayList<>();
        final CountDownLatch fin = new CountDownLatch(1);
        principal.post(() -> {
            if (contexte(ctx) == null) {
                fin.countDown();
                return;
            }
            final MediaRouter routeur = MediaRouter.getInstance(appli);
            final MediaRouteSelector s = selecteur();
            final MediaRouter.Callback ecoute = new MediaRouter.Callback() {};
            routeur.addCallback(s, ecoute, MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN);
            principal.postDelayed(() -> {
                try {
                    for (MediaRouter.RouteInfo r : routeur.getRoutes()) {
                        if (r.isDefault() || !r.isEnabled() || !r.matchesSelector(s)) continue;
                        synchronized (trouves) {
                            trouves.add(new Appareil(PREFIXE + r.getId(), r.getName()));
                        }
                    }
                } catch (Exception ignore) {
                    // recherche interrompue : on rend ce qu'on a
                } finally {
                    routeur.removeCallback(ecoute);
                    fin.countDown();
                }
            }, ms);
        });
        fin.await(ms + 3000, TimeUnit.MILLISECONDS);
        synchronized (trouves) {
            return new ArrayList<>(trouves);
        }
    }

    private static CastSession session() {
        CastContext cc = appli != null ? contexte(appli) : null;
        if (cc == null) return null;
        CastSession s = cc.getSessionManager().getCurrentCastSession();
        return s != null && s.isConnected() ? s : null;
    }

    private static RemoteMediaClient client() {
        CastSession s = session();
        return s != null ? s.getRemoteMediaClient() : null;
    }

    private static MediaLoadRequestData requete(String url, String mime, String titre, boolean video, boolean direct, double position) {
        MediaMetadata meta = new MediaMetadata(video ? MediaMetadata.MEDIA_TYPE_MOVIE : MediaMetadata.MEDIA_TYPE_MUSIC_TRACK);
        meta.putString(MediaMetadata.KEY_TITLE, titre);
        MediaInfo info = new MediaInfo.Builder(url)
            .setStreamType(direct ? MediaInfo.STREAM_TYPE_LIVE : MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(mime)
            .setMetadata(meta)
            .build();
        return new MediaLoadRequestData.Builder()
            .setMediaInfo(info)
            .setAutoplay(true)
            .setCurrentTime(direct || position <= 3 ? 0L : (long) (position * 1000))
            .build();
    }

    private static void charger(CastSession s, MediaLoadRequestData req, Resultat<String> fin) {
        RemoteMediaClient rmc = s.getRemoteMediaClient();
        if (rmc == null) {
            fin.erreur("La TV n'a pas pu lire ce média.");
            return;
        }
        final String nom = s.getCastDevice() != null ? s.getCastDevice().getFriendlyName() : "TV";
        rmc.load(req).setResultCallback(r -> {
            if (r.getStatus().isSuccess()) fin.ok(nom);
            else fin.erreur("La TV n'a pas pu lire ce média.");
        });
    }

    /** Connexion à la TV choisie (session Cast), puis lecture. */
    private static final class Connexion implements SessionManagerListener<CastSession>, Runnable {
        private final SessionManager sm;
        private final MediaLoadRequestData req;
        private final Resultat<String> fin;
        private boolean fait = false;

        Connexion(SessionManager sm, MediaLoadRequestData req, Resultat<String> fin) {
            this.sm = sm;
            this.req = req;
            this.fin = fin;
        }

        private void terminer(CastSession s, String erreur) {
            if (fait) return;
            fait = true;
            sm.removeSessionManagerListener(this, CastSession.class);
            principal.removeCallbacks(this);
            if (s != null) charger(s, req, fin);
            else fin.erreur(erreur);
        }

        @Override public void run() { terminer(null, "La TV ne répond pas."); }
        @Override public void onSessionStarted(CastSession s, String id) { terminer(s, null); }
        @Override public void onSessionResumed(CastSession s, boolean suspendue) { terminer(s, null); }
        @Override public void onSessionStartFailed(CastSession s, int code) { terminer(null, "La TV a refusé la diffusion (code " + code + ")."); }
        @Override public void onSessionResumeFailed(CastSession s, int code) { terminer(null, "La TV a refusé la diffusion (code " + code + ")."); }
        @Override public void onSessionStarting(CastSession s) {}
        @Override public void onSessionEnding(CastSession s) {}
        @Override public void onSessionEnded(CastSession s, int code) {}
        @Override public void onSessionResuming(CastSession s, String id) {}
        @Override public void onSessionSuspended(CastSession s, int raison) {}
    }

    static void lancer(Context ctx, String id, String url, String mime, String titre, boolean video, boolean direct,
                       double position, Resultat<String> fin) {
        principal.post(() -> {
            try {
                CastContext cc = contexte(ctx);
                if (cc == null) {
                    fin.erreur("Chromecast indisponible sur ce téléphone.");
                    return;
                }
                MediaRouter routeur = MediaRouter.getInstance(appli);
                MediaRouter.RouteInfo cible = null;
                for (MediaRouter.RouteInfo r : routeur.getRoutes()) {
                    if ((PREFIXE + r.getId()).equals(id)) cible = r;
                }
                if (cible == null) {
                    fin.erreur("TV introuvable : relancez la recherche.");
                    return;
                }
                MediaLoadRequestData req = requete(url, mime, titre, video, direct, position);
                SessionManager sm = cc.getSessionManager();
                CastSession s = sm.getCurrentCastSession();
                if (s != null && s.isConnected() && cible.isSelected()) {
                    charger(s, req, fin);
                    return;
                }
                Connexion c = new Connexion(sm, req, fin);
                sm.addSessionManagerListener(c, CastSession.class);
                principal.postDelayed(c, 25000);
                routeur.selectRoute(cible);
            } catch (Exception e) {
                fin.erreur("La TV n'a pas pu lire ce média.");
            }
        });
    }

    static void commande(String action, double position, Resultat<Boolean> fin) {
        principal.post(() -> {
            try {
                RemoteMediaClient rmc = client();
                if (rmc == null) {
                    fin.erreur("La diffusion est terminée.");
                    return;
                }
                PendingResult<RemoteMediaClient.MediaChannelResult> p;
                switch (action) {
                    case "pause": p = rmc.pause(); break;
                    case "reprendre": p = rmc.play(); break;
                    case "aller":
                        p = rmc.seek(new MediaSeekOptions.Builder().setPosition((long) (Math.max(0, position) * 1000)).build());
                        break;
                    default:
                        fin.erreur("Commande inconnue");
                        return;
                }
                p.setResultCallback(r -> {
                    if (r.getStatus().isSuccess()) fin.ok(true);
                    else fin.erreur("La TV ne répond pas.");
                });
            } catch (Exception e) {
                fin.erreur("La TV ne répond pas.");
            }
        });
    }

    static void volume(int delta, Resultat<Integer> fin) {
        principal.post(() -> {
            try {
                CastSession s = session();
                if (s == null) {
                    fin.erreur("La diffusion est terminée.");
                    return;
                }
                int v = (int) Math.round(s.getVolume() * 100) + delta;
                v = Math.max(0, Math.min(100, v));
                s.setVolume(v / 100.0);
                fin.ok(v);
            } catch (Exception e) {
                fin.erreur("Réglez le volume avec la télécommande de la TV.");
            }
        });
    }

    static void etat(Resultat<Etat> fin) {
        principal.post(() -> {
            Etat e = new Etat();
            try {
                RemoteMediaClient rmc = client();
                if (rmc != null) {
                    switch (rmc.getPlayerState()) {
                        case MediaStatus.PLAYER_STATE_PLAYING: e.etat = "PLAYING"; break;
                        case MediaStatus.PLAYER_STATE_PAUSED: e.etat = "PAUSED_PLAYBACK"; break;
                        case MediaStatus.PLAYER_STATE_BUFFERING:
                        case MediaStatus.PLAYER_STATE_LOADING: e.etat = "TRANSITIONING"; break;
                        default: e.etat = "STOPPED";
                    }
                    e.position = rmc.getApproximateStreamPosition() / 1000;
                    long d = rmc.getStreamDuration();
                    e.duree = d > 0 ? d / 1000 : -1;
                }
            } catch (Exception ignore) {
                // session perdue : « STOPPED »
            }
            fin.ok(e);
        });
    }

    static void arreter() {
        principal.post(() -> {
            try {
                RemoteMediaClient rmc = client();
                if (rmc != null) rmc.stop();
                CastContext cc = appli != null ? contexte(appli) : null;
                if (cc != null) cc.getSessionManager().endCurrentSession(true);
            } catch (Exception ignore) {
                // TV déjà déconnectée
            }
        });
    }
}
