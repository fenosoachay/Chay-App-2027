package io.chay.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Diffusion sur TV par DLNA / UPnP (Samsung, LG, Hisense VIDAA, et la plupart des TV connectées) :
 *  - recherche des TV « MediaRenderer » sur le Wi-Fi (SSDP) ;
 *  - commandes à la TV (SOAP : AVTransport pour lecture / pause / position, RenderingControl pour le volume).
 * Les échanges avec la TV passent par des sockets simples (HTTP local, sans chiffrement : l'application
 * interdit le HTTP en clair pour Internet, pas pour ces sockets du réseau local).
 */
final class DlnaTv {
    private DlnaTv() {}

    static final class Appareil {
        String id;
        String nom;
        String modele;
        String avTransportUrl;
        String avTransportType;
        String renduUrl;
        String renduType;
    }

    static final class Reponse {
        int code;
        String corps;
    }

    // ── Recherche (SSDP) ─────────────────────────────────────────────────────────────────────────────────────

    static List<Appareil> chercher(Context ctx, int dureeMs) throws IOException {
        WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock verrou = wm != null ? wm.createMulticastLock("chay-tv") : null;
        if (verrou != null) {
            verrou.setReferenceCounted(false);
            verrou.acquire();
        }
        Set<String> adresses = new LinkedHashSet<>();
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setSoTimeout(400);
            InetAddress groupe = InetAddress.getByName("239.255.255.250");
            String[] cibles = {"urn:schemas-upnp-org:device:MediaRenderer:1", "urn:schemas-upnp-org:service:AVTransport:1"};
            for (int tour = 0; tour < 2; tour++) {
                for (String st : cibles) {
                    String msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: "
                        + st + "\r\nUSER-AGENT: Android UPnP/1.1 Chay/1.0\r\n\r\n";
                    byte[] b = msg.getBytes(StandardCharsets.US_ASCII);
                    socket.send(new DatagramPacket(b, b.length, groupe, 1900));
                }
            }
            long fin = System.currentTimeMillis() + dureeMs;
            byte[] tampon = new byte[8192];
            while (System.currentTimeMillis() < fin) {
                DatagramPacket p = new DatagramPacket(tampon, tampon.length);
                try {
                    socket.receive(p);
                } catch (SocketTimeoutException e) {
                    continue;
                }
                String rep = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                String lieu = entete(rep, "location");
                if (lieu != null && lieu.startsWith("http://")) adresses.add(lieu.trim());
            }
        } finally {
            if (socket != null) socket.close();
            if (verrou != null && verrou.isHeld()) verrou.release();
        }
        Map<String, Appareil> parId = new LinkedHashMap<>();
        for (String lieu : adresses) {
            try {
                Appareil a = decrire(lieu);
                if (a != null && a.avTransportUrl != null && !parId.containsKey(a.id)) parId.put(a.id, a);
            } catch (Exception ignore) {
                // appareil injoignable ou description illisible : ignoré
            }
        }
        return new ArrayList<>(parId.values());
    }

    private static String entete(String message, String nom) {
        for (String l : message.split("\r?\n")) {
            int i = l.indexOf(':');
            if (i > 0 && l.substring(0, i).trim().toLowerCase(Locale.ROOT).equals(nom)) return l.substring(i + 1).trim();
        }
        return null;
    }

    private static String texte(Element parent, String balise) {
        NodeList n = parent.getElementsByTagName(balise);
        if (n.getLength() == 0) return null;
        String t = n.item(0).getTextContent();
        return t == null ? null : t.trim();
    }

    static Appareil decrire(String lieu) throws Exception {
        Reponse r = http("GET", lieu, null, null);
        if (r.code != 200) return null;
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(false);
        f.setExpandEntityReferences(false);
        Document doc = f.newDocumentBuilder().parse(new java.io.ByteArrayInputStream(r.corps.getBytes(StandardCharsets.UTF_8)));
        Element racine = doc.getDocumentElement();
        String base = texte(racine, "URLBase");
        URL baseUrl = new URL(base != null && !base.isEmpty() ? base : lieu);
        Appareil a = new Appareil();
        a.nom = texte(racine, "friendlyName");
        a.modele = texte(racine, "modelName");
        String udn = texte(racine, "UDN");
        a.id = udn != null && !udn.isEmpty() ? udn : lieu;
        if (a.nom == null || a.nom.isEmpty()) a.nom = a.modele != null ? a.modele : "TV";
        NodeList services = racine.getElementsByTagName("service");
        for (int i = 0; i < services.getLength(); i++) {
            Element s = (Element) services.item(i);
            String type = texte(s, "serviceType");
            String control = texte(s, "controlURL");
            if (type == null || control == null) continue;
            String url = new URL(baseUrl, control).toString();
            if (type.startsWith("urn:schemas-upnp-org:service:AVTransport:") && a.avTransportUrl == null) {
                a.avTransportUrl = url;
                a.avTransportType = type;
            } else if (type.startsWith("urn:schemas-upnp-org:service:RenderingControl:") && a.renduUrl == null) {
                a.renduUrl = url;
                a.renduType = type;
            }
        }
        return a;
    }

    // ── HTTP minimal (réseau local) ──────────────────────────────────────────────────────────────────────────

    static String ligne(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 16384) throw new IOException("ligne trop longue");
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("ISO-8859-1");
    }

    static Map<String, String> entetes(InputStream in) throws IOException {
        Map<String, String> h = new LinkedHashMap<>();
        String l;
        int n = 0;
        while ((l = ligne(in)) != null && !l.isEmpty()) {
            int i = l.indexOf(':');
            if (i > 0) h.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            if (++n > 100) break;
        }
        return h;
    }

    static Reponse http(String methode, String adresse, Map<String, String> enTetes, String corps) throws IOException {
        URL u = new URL(adresse);
        if (!"http".equalsIgnoreCase(u.getProtocol())) throw new IOException("Adresse locale attendue");
        int port = u.getPort() > 0 ? u.getPort() : 80;
        String chemin = u.getFile();
        if (chemin == null || chemin.isEmpty()) chemin = "/";
        byte[] donnees = corps != null ? corps.getBytes(StandardCharsets.UTF_8) : new byte[0];
        try (Socket so = new Socket()) {
            so.connect(new InetSocketAddress(u.getHost(), port), 4000);
            so.setSoTimeout(8000);
            StringBuilder req = new StringBuilder();
            req.append(methode).append(' ').append(chemin).append(" HTTP/1.1\r\n");
            req.append("Host: ").append(u.getHost()).append(':').append(port).append("\r\n");
            req.append("Connection: close\r\nUser-Agent: Android UPnP/1.1 Chay/1.0\r\n");
            if (enTetes != null) for (Map.Entry<String, String> e : enTetes.entrySet()) {
                req.append(e.getKey()).append(": ").append(e.getValue()).append("\r\n");
            }
            if (corps != null) req.append("Content-Length: ").append(donnees.length).append("\r\n");
            req.append("\r\n");
            OutputStream out = so.getOutputStream();
            out.write(req.toString().getBytes(StandardCharsets.UTF_8));
            out.write(donnees);
            out.flush();
            InputStream in = new BufferedInputStream(so.getInputStream());
            String statut = ligne(in);
            if (statut == null) throw new IOException("Pas de réponse de la TV");
            String[] parts = statut.split(" ");
            Reponse r = new Reponse();
            r.code = parts.length > 1 ? Integer.parseInt(parts[1].trim()) : 0;
            Map<String, String> h = entetes(in);
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            String te = h.get("transfer-encoding");
            if (te != null && te.toLowerCase(Locale.ROOT).contains("chunked")) {
                while (true) {
                    String taille = ligne(in);
                    if (taille == null) break;
                    int pv = taille.indexOf(';');
                    int n = Integer.parseInt((pv >= 0 ? taille.substring(0, pv) : taille).trim(), 16);
                    if (n <= 0) break;
                    byte[] t = new byte[n];
                    int lu = 0;
                    while (lu < n) {
                        int k = in.read(t, lu, n - lu);
                        if (k < 0) break;
                        lu += k;
                    }
                    body.write(t, 0, lu);
                    ligne(in);
                }
            } else {
                String cl = h.get("content-length");
                long reste = cl != null ? Long.parseLong(cl.trim()) : Long.MAX_VALUE;
                byte[] t = new byte[8192];
                int k;
                while (reste > 0 && (k = in.read(t, 0, (int) Math.min(t.length, reste))) != -1) {
                    body.write(t, 0, k);
                    reste -= k;
                    if (body.size() > 2_000_000) break;
                }
            }
            r.corps = body.toString("UTF-8");
            return r;
        }
    }

    // ── SOAP (commandes à la TV) ─────────────────────────────────────────────────────────────────────────────

    static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }

    static String extraire(String xml, String balise) {
        if (xml == null) return null;
        Matcher m = Pattern.compile("<(?:[\\w-]+:)?" + balise + "(?:\\s[^>]*)?>(.*?)</(?:[\\w-]+:)?" + balise + ">", Pattern.DOTALL).matcher(xml);
        if (!m.find()) return null;
        return m.group(1).replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&").trim();
    }

    static String soap(String url, String type, String action, String args) throws IOException {
        String env = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
            + "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
            + "<s:Body><u:" + action + " xmlns:u=\"" + type + "\">" + args + "</u:" + action + "></s:Body></s:Envelope>";
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Content-Type", "text/xml; charset=\"utf-8\"");
        h.put("SOAPACTION", "\"" + type + "#" + action + "\"");
        Reponse r = http("POST", url, h, env);
        if (r.code != 200) {
            String d = extraire(r.corps, "errorDescription");
            throw new IOException("La TV a refusé « " + action + " »" + (d != null ? " : " + d : " (HTTP " + r.code + ")"));
        }
        return r.corps;
    }

    private static String avt(Appareil a, String action, String args) throws IOException {
        return soap(a.avTransportUrl, a.avTransportType, action, "<InstanceID>0</InstanceID>" + args);
    }

    /** Charge un média sur la TV (adresse du relais du téléphone). */
    static void charger(Appareil a, String url, String titre, String mime, boolean video, boolean direct) throws IOException {
        String flags = direct ? "DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
            : "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000";
        String classe = video ? "object.item.videoItem" : direct ? "object.item.audioItem.audioBroadcast" : "object.item.audioItem.musicTrack";
        String didl = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\""
            + " xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"chay\" parentID=\"0\" restricted=\"1\">"
            + "<dc:title>" + esc(titre) + "</dc:title><upnp:class>" + classe + "</upnp:class>"
            + "<res protocolInfo=\"http-get:*:" + esc(mime) + ":" + flags + "\">" + esc(url) + "</res></item></DIDL-Lite>";
        avt(a, "SetAVTransportURI", "<CurrentURI>" + esc(url) + "</CurrentURI><CurrentURIMetaData>" + esc(didl) + "</CurrentURIMetaData>");
    }

    static void jouer(Appareil a) throws IOException { avt(a, "Play", "<Speed>1</Speed>"); }

    static void pause(Appareil a) throws IOException { avt(a, "Pause", ""); }

    static void stop(Appareil a) throws IOException { avt(a, "Stop", ""); }

    static void aller(Appareil a, long secondes) throws IOException {
        long s = Math.max(0, secondes);
        String cible = String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60);
        avt(a, "Seek", "<Unit>REL_TIME</Unit><Target>" + cible + "</Target>");
    }

    /** « 1:02:03(.000) » -> secondes ; -1 si inconnu. */
    static long secondes(String t) {
        if (t == null || t.isEmpty() || t.startsWith("NOT_IMPLEMENTED")) return -1;
        try {
            String[] p = t.split(":");
            double total = 0;
            for (String x : p) total = total * 60 + Double.parseDouble(x.trim());
            return (long) total;
        } catch (Exception e) {
            return -1;
        }
    }

    /** { etat, position, duree } : etat = PLAYING, PAUSED_PLAYBACK, STOPPED, TRANSITIONING, NO_MEDIA_PRESENT… */
    static long[] position(Appareil a) throws IOException {
        String r = avt(a, "GetPositionInfo", "");
        return new long[] {secondes(extraire(r, "RelTime")), secondes(extraire(r, "TrackDuration"))};
    }

    static String etat(Appareil a) throws IOException {
        String e = extraire(avt(a, "GetTransportInfo", ""), "CurrentTransportState");
        return e != null ? e : "";
    }

    /** Volume 0..100 ; -1 si la TV ne le permet pas. */
    static int volume(Appareil a) {
        if (a.renduUrl == null) return -1;
        try {
            String r = soap(a.renduUrl, a.renduType, "GetVolume", "<InstanceID>0</InstanceID><Channel>Master</Channel>");
            return Integer.parseInt(extraire(r, "CurrentVolume"));
        } catch (Exception e) {
            return -1;
        }
    }

    static int definirVolume(Appareil a, int v) throws IOException {
        if (a.renduUrl == null) throw new IOException("Cette TV ne permet pas de régler le volume à distance.");
        int n = Math.max(0, Math.min(100, v));
        soap(a.renduUrl, a.renduType, "SetVolume", "<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>" + n + "</DesiredVolume>");
        return n;
    }

    // ── Type de média ────────────────────────────────────────────────────────────────────────────────────────

    static String deviner(String url, boolean video) {
        String u = url.toLowerCase(Locale.ROOT);
        int q = u.indexOf('?');
        if (q >= 0) u = u.substring(0, q);
        if (u.endsWith(".webm")) return "video/webm";
        if (u.endsWith(".mov")) return "video/quicktime";
        if (u.endsWith(".mkv")) return "video/x-matroska";
        if (u.endsWith(".mp3")) return "audio/mpeg";
        if (u.endsWith(".m4a") || u.endsWith(".aac")) return "audio/mp4";
        if (u.endsWith(".ogg") || u.endsWith(".oga")) return "audio/ogg";
        if (u.endsWith(".wav")) return "audio/wav";
        if (u.endsWith(".flac")) return "audio/flac";
        return video ? "video/mp4" : "audio/mpeg";
    }

    /** Type annoncé par le serveur du média (requête courte) ; sinon deviné d'après l'adresse. */
    static String typeDistant(String url, boolean video, boolean direct) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            if (!direct) c.setRequestProperty("Range", "bytes=0-1");
            c.setRequestProperty("User-Agent", "Chay-TV/1.0");
            c.getResponseCode();
            String t = c.getContentType();
            if (t != null) {
                int pv = t.indexOf(';');
                t = (pv >= 0 ? t.substring(0, pv) : t).trim().toLowerCase(Locale.ROOT);
                if ((t.startsWith("video/") || t.startsWith("audio/")) && !t.contains("mpegurl")) return t;
            }
        } catch (Exception ignore) {
            // type deviné
        } finally {
            if (c != null) c.disconnect();
        }
        return deviner(url, video);
    }
}
