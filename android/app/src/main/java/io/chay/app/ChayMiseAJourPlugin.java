package io.chay.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour de l'application DEPUIS l'application (sans navigateur ni fichier à ouvrir) :
 *  1. la première fois, Android demande d'autoriser Chay à installer des applications (réglage ouvert directement) ;
 *  2. l'APK est téléchargé dans une session PackageInstaller, avec la progression envoyée à l'app (« progression ») ;
 *  3. la fenêtre de confirmation d'Android s'affiche (obligatoire hors Play Store) ; Chay se ferme pendant
 *     l'installation, puis MiseAJourTermineeReceiver affiche « Chay est à jour ».
 * Seule l'adresse officielle (https://membres.chay.fr/telechargements/) est acceptée. Android refuse de lui-même
 * un APK qui ne serait pas signé avec la même clé que l'application installée.
 */
@CapacitorPlugin(name = "ChayMiseAJour")
public class ChayMiseAJourPlugin extends Plugin {
    static final String ORIGINE = "https://membres.chay.fr/telechargements/";
    static final String ACTION_STATUT = "io.chay.app.MISE_A_JOUR_STATUT";
    static final long MAX_OCTETS = 300L * 1024 * 1024;

    private static WeakReference<ChayMiseAJourPlugin> actif = new WeakReference<>(null);
    private volatile boolean enCours = false;

    @Override
    public void load() {
        actif = new WeakReference<>(this);
    }

    /** Appelé par MiseAJourReceiver quand Android signale un échec (ou une annulation) de l'installation. */
    static void signalerEchec(String message) {
        ChayMiseAJourPlugin p = actif.get();
        if (p == null) return;
        p.enCours = false;
        JSObject data = new JSObject();
        data.put("message", message == null ? "" : message);
        p.notifyListeners("echec", data);
    }

    private boolean peutInstaller() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void autorise(PluginCall call) {
        JSObject r = new JSObject();
        r.put("autorise", peutInstaller());
        call.resolve(r);
    }

    @PluginMethod
    public void installer(PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || !url.startsWith(ORIGINE) || !url.endsWith(".apk")) {
            call.reject("Adresse de mise à jour non autorisée.");
            return;
        }
        if (!peutInstaller()) {
            // Réglage « Installer des applications inconnues » de Chay, ouvert directement.
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) {
                // Réglage introuvable sur ce téléphone : l'app affiche l'explication.
            }
            JSObject r = new JSObject();
            r.put("etat", "autorisation");
            call.resolve(r);
            return;
        }
        if (enCours) {
            call.reject("Une mise à jour est déjà en cours.");
            return;
        }
        enCours = true;
        new Thread(() -> telechargerEtInstaller(url, call), "chay-mise-a-jour").start();
    }

    private void progression(long recus, long total) {
        JSObject d = new JSObject();
        d.put("recus", recus);
        d.put("total", total);
        d.put("pourcent", total > 0 ? (int) Math.min(100, (recus * 100) / total) : -1);
        notifyListeners("progression", d);
    }

    private void telechargerEtInstaller(String adresse, PluginCall call) {
        Context ctx = getContext();
        PackageInstaller installeur = ctx.getPackageManager().getPackageInstaller();
        HttpURLConnection cnx = null;
        PackageInstaller.Session session = null;
        int idSession = -1;
        try {
            cnx = (HttpURLConnection) new URL(adresse).openConnection();
            cnx.setConnectTimeout(20000);
            cnx.setReadTimeout(30000);
            cnx.setUseCaches(false);
            cnx.setRequestProperty("Cache-Control", "no-cache");
            int code = cnx.getResponseCode();
            if (code != 200) throw new Exception("Téléchargement impossible (HTTP " + code + ").");
            long total = cnx.getContentLength(); // -1 si inconnue (getContentLengthLong : Android 7+ seulement)
            if (total > MAX_OCTETS) throw new Exception("Fichier trop gros.");

            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(ctx.getPackageName());
            if (total > 0) params.setSize(total);
            idSession = installeur.createSession(params);
            session = installeur.openSession(idSession);

            long recus = 0;
            int dernier = -1;
            progression(0, total);
            try (InputStream in = cnx.getInputStream(); OutputStream out = session.openWrite("chay.apk", 0, total > 0 ? total : -1)) {
                byte[] tampon = new byte[64 * 1024];
                int n;
                while ((n = in.read(tampon)) != -1) {
                    out.write(tampon, 0, n);
                    recus += n;
                    if (recus > MAX_OCTETS) throw new Exception("Fichier trop gros.");
                    int pc = total > 0 ? (int) ((recus * 100) / total) : (int) (recus / (1024 * 1024));
                    if (pc != dernier) {
                        dernier = pc;
                        progression(recus, total);
                    }
                }
                session.fsync(out);
            }
            if (total > 0 && recus != total) throw new Exception("Téléchargement interrompu.");
            progression(recus, recus);

            Intent statut = new Intent(ctx, MiseAJourReceiver.class).setAction(ACTION_STATUT);
            int drapeaux = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) drapeaux |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, idSession, statut, drapeaux);
            session.commit(pi.getIntentSender());
            session.close();
            session = null;

            JSObject r = new JSObject();
            r.put("etat", "confirmation");
            call.resolve(r);
        } catch (Exception e) {
            enCours = false;
            if (session != null) {
                try { session.abandon(); } catch (Exception ignore) { /* déjà fermée */ }
            } else if (idSession != -1) {
                try { installeur.abandonSession(idSession); } catch (Exception ignore) { /* déjà fermée */ }
            }
            String m = e.getMessage();
            call.reject(m == null || m.isEmpty() ? "Connexion interrompue. Réessaie avec une bonne connexion." : m);
        } finally {
            if (cnx != null) cnx.disconnect();
        }
    }
}
