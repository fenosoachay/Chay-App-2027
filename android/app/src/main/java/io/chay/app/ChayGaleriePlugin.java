package io.chay.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Multimédia › « Fond d'écran » : télécharge une image (http/https) et l'enregistre dans la galerie du téléphone,
 * dossier « Images/Chay ». Android 10+ : MediaStore, sans permission. Android 5 à 9 : permission d'écriture
 * (WRITE_EXTERNAL_STORAGE, maxSdkVersion 28 dans le manifeste), demandée au premier enregistrement.
 * Plafond : 200 Mo (même limite que l'envoi par l'admin). Le contenu doit être une image (Content-Type image/*).
 */
@CapacitorPlugin(
    name = "ChayGalerie",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "stockage") }
)
public class ChayGaleriePlugin extends Plugin {
    static final long MAX_OCTETS = 200L * 1024 * 1024;
    static final String DOSSIER = "Chay";

    @PluginMethod
    public void enregistrerImage(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (uri.getHost() == null || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
            call.reject("Adresse de l'image invalide.");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("stockage") != PermissionState.GRANTED) {
            requestPermissionForAlias("stockage", call, "apresPermission");
            return;
        }
        lancer(call);
    }

    @PermissionCallback
    private void apresPermission(PluginCall call) {
        if (getPermissionState("stockage") != PermissionState.GRANTED) {
            call.reject("Autorisation refusée : impossible d'enregistrer l'image dans la galerie.");
            return;
        }
        lancer(call);
    }

    private void lancer(PluginCall call) {
        new Thread(() -> {
            try {
                JSObject res = new JSObject();
                res.put("nom", telecharger(call.getString("url"), call.getString("nom", "fond-ecran")));
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Enregistrement impossible.");
            }
        }, "chay-galerie").start();
    }

    /** Nom de fichier sûr (lettres, chiffres, tirets), sans extension. */
    static String nomSur(String nom) {
        String s = nom == null ? "" : nom.replaceAll("[^A-Za-z0-9_-]+", "-").replaceAll("^-+|-+$", "");
        if (s.isEmpty()) s = "fond-ecran";
        return s.length() > 60 ? s.substring(0, 60) : s;
    }

    static String extension(String mime) {
        switch (mime) {
            case "image/png": return "png";
            case "image/webp": return "webp";
            case "image/gif": return "gif";
            case "image/heic": return "heic";
            case "image/avif": return "avif";
            default: return "jpg";
        }
    }

    private String telecharger(String adresse, String nom) throws IOException {
        HttpURLConnection cx = (HttpURLConnection) new URL(adresse).openConnection();
        cx.setConnectTimeout(20000);
        cx.setReadTimeout(60000);
        cx.setInstanceFollowRedirects(true);
        try {
            int code = cx.getResponseCode();
            if (code != 200) throw new IOException("Téléchargement impossible (HTTP " + code + ").");
            String mime = String.valueOf(cx.getContentType()).split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (!mime.startsWith("image/")) throw new IOException("Le fichier reçu n'est pas une image.");
            if (cx.getContentLengthLong() > MAX_OCTETS) throw new IOException("Image trop volumineuse (max 200 Mo).");
            String fichier = nomSur(nom) + "-" + System.currentTimeMillis() + "." + extension(mime);
            try (InputStream in = cx.getInputStream()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) enregistrerMediaStore(in, fichier, mime);
                else enregistrerFichier(in, fichier, mime);
            }
            return fichier;
        } finally {
            cx.disconnect();
        }
    }

    private static void copier(InputStream in, OutputStream out) throws IOException {
        byte[] tampon = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(tampon)) > 0) {
            total += n;
            if (total > MAX_OCTETS) throw new IOException("Image trop volumineuse (max 200 Mo).");
            out.write(tampon, 0, n);
        }
    }

    private void enregistrerMediaStore(InputStream in, String fichier, String mime) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, fichier);
        v.put(MediaStore.Images.Media.MIME_TYPE, mime);
        v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + DOSSIER);
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri cible = cr.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
        if (cible == null) throw new IOException("La galerie refuse l'enregistrement.");
        try (OutputStream out = cr.openOutputStream(cible)) {
            if (out == null) throw new IOException("La galerie refuse l'enregistrement.");
            copier(in, out);
        } catch (IOException e) {
            cr.delete(cible, null, null);
            throw e;
        }
        ContentValues fin = new ContentValues();
        fin.put(MediaStore.Images.Media.IS_PENDING, 0);
        cr.update(cible, fin, null, null);
    }

    @SuppressWarnings("deprecation")
    private void enregistrerFichier(InputStream in, String fichier, String mime) throws IOException {
        File dossier = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), DOSSIER);
        if (!dossier.isDirectory() && !dossier.mkdirs()) throw new IOException("Dossier Images/Chay impossible à créer.");
        File f = new File(dossier, fichier);
        try (OutputStream out = new FileOutputStream(f)) {
            copier(in, out);
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            throw e;
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
    }
}
