package io.chay.app;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Relais du téléphone pour la diffusion sur TV : la TV lit http://<téléphone>:<port>/m/<jeton>, et le téléphone
 * lui transmet le média (https) au fil de l'eau, avec les plages (avance / retour). Marche même avec les TV qui
 * refusent le https. Seuls les médias envoyés par l'app (jetons aléatoires) sont servis ; rien n'est enregistré.
 */
final class RelaisTv {
    private static RelaisTv instance;

    private ServerSocket serveur;
    private final Map<String, String> sources = new ConcurrentHashMap<>();
    private final Map<String, String> types = new ConcurrentHashMap<>();

    static synchronized RelaisTv demarrer() throws IOException {
        if (instance == null || instance.serveur == null || instance.serveur.isClosed()) {
            RelaisTv r = new RelaisTv();
            r.serveur = new ServerSocket(0);
            Thread t = new Thread(r::accepter, "chay-tv-relais");
            t.setDaemon(true);
            t.start();
            instance = r;
        }
        return instance;
    }

    static synchronized void arreter() {
        if (instance == null) return;
        try {
            instance.serveur.close();
        } catch (IOException ignore) {
            // déjà fermé
        }
        instance.sources.clear();
        instance.types.clear();
        instance = null;
    }

    String publier(String source, String type) {
        sources.clear(); // un seul média diffusé à la fois
        types.clear();
        String jeton = UUID.randomUUID().toString().replace("-", "");
        sources.put(jeton, source);
        if (type != null) types.put(jeton, type);
        return jeton;
    }

    String adresse(String ip, String jeton, String type) {
        String ext = type == null ? "" : type.startsWith("video/mp4") ? ".mp4" : type.startsWith("video/webm") ? ".webm"
            : type.startsWith("audio/mpeg") ? ".mp3" : type.startsWith("audio/mp4") ? ".m4a" : type.startsWith("audio/aac") ? ".aac" : "";
        return "http://" + ip + ":" + serveur.getLocalPort() + "/m/" + jeton + ext;
    }

    /** Adresse IPv4 du téléphone sur le réseau local (Wi-Fi de préférence). */
    static String ipLocale() {
        String autre = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    String nom = ni.getName() == null ? "" : ni.getName();
                    if (nom.startsWith("wlan") || nom.startsWith("eth")) return a.getHostAddress();
                    if (autre == null) autre = a.getHostAddress();
                }
            }
        } catch (Exception ignore) {
            // pas de réseau
        }
        return autre;
    }

    private void accepter() {
        while (serveur != null && !serveur.isClosed()) {
            try {
                Socket c = serveur.accept();
                Thread t = new Thread(() -> servir(c), "chay-tv-relais-client");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                break;
            }
        }
    }

    private static void ecrire(OutputStream out, String s) throws IOException {
        out.write(s.getBytes(StandardCharsets.ISO_8859_1));
    }

    private void servir(Socket client) {
        HttpURLConnection amont = null;
        try (Socket s = client) {
            s.setSoTimeout(60000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            String req = DlnaTv.ligne(in);
            if (req == null) return;
            String[] p = req.split(" ");
            Map<String, String> h = DlnaTv.entetes(in);
            OutputStream out = s.getOutputStream();
            String methode = p.length > 0 ? p[0] : "";
            String chemin = p.length > 1 ? p[1] : "";
            String jeton = chemin.startsWith("/m/") ? chemin.substring(3) : "";
            int fin = jeton.indexOf('.');
            if (fin >= 0) jeton = jeton.substring(0, fin);
            String source = sources.get(jeton);
            if (source == null || !("GET".equals(methode) || "HEAD".equals(methode))) {
                ecrire(out, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                return;
            }
            amont = (HttpURLConnection) new URL(source).openConnection();
            amont.setInstanceFollowRedirects(true);
            amont.setConnectTimeout(15000);
            amont.setReadTimeout(60000);
            amont.setRequestProperty("User-Agent", "Chay-TV/1.0");
            String plage = h.get("range");
            if (plage != null) amont.setRequestProperty("Range", plage);
            if ("HEAD".equals(methode)) amont.setRequestMethod("HEAD");
            int code = amont.getResponseCode();
            String type = types.get(jeton);
            if (type == null) type = amont.getContentType() != null ? amont.getContentType() : "application/octet-stream";
            String longueur = amont.getHeaderField("Content-Length");
            String zone = amont.getHeaderField("Content-Range");
            String plages = amont.getHeaderField("Accept-Ranges");
            StringBuilder r = new StringBuilder("HTTP/1.1 ");
            r.append(code == 206 ? "206 Partial Content" : code >= 200 && code < 300 ? "200 OK" : code + " Erreur").append("\r\n");
            r.append("Content-Type: ").append(type).append("\r\n");
            if (longueur != null) r.append("Content-Length: ").append(longueur).append("\r\n");
            if (zone != null) r.append("Content-Range: ").append(zone).append("\r\n");
            if (longueur != null || (plages != null && plages.contains("bytes"))) r.append("Accept-Ranges: bytes\r\n");
            r.append("transferMode.dlna.org: Streaming\r\n");
            r.append("contentFeatures.dlna.org: DLNA.ORG_OP=").append(longueur != null ? "01" : "00")
                .append(";DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000\r\n");
            r.append("Connection: close\r\n\r\n");
            ecrire(out, r.toString());
            if ("HEAD".equals(methode) || code >= 400) return;
            try (InputStream corps = amont.getInputStream()) {
                byte[] t = new byte[64 * 1024];
                int k;
                while ((k = corps.read(t)) != -1) out.write(t, 0, k);
                out.flush();
            }
        } catch (IOException ignore) {
            // la TV a coupé (pause, avance, fin) : normal
        } finally {
            if (amont != null) amont.disconnect();
        }
    }
}
