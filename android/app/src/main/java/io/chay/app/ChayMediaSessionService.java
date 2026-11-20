package io.chay.app;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.util.ArrayList;
import java.util.List;

public class ChayMediaSessionService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession mediaSession;
    // Écran du titre en cours (toucher la notification de lecture) ; fil principal seulement.
    private static String routeCourante;
    private static ChayMediaSessionService instance;

    // Lecture non-stop (« Votre Playlist ») : fondu enchaîné. Dans les 5 dernières secondes d'un titre, un second
    // lecteur démarre le titre suivant en silence ; le volume du premier baisse pendant que celui du second monte.
    // À la fin, le second lecteur devient le lecteur de la session (notification, boutons) et le premier est libéré.
    static final long FONDU_MS = 5000;
    private static boolean fonduActif = false;
    private final Handler surveillant = new Handler(Looper.getMainLooper());
    private ExoPlayer suivant;          // lecteur du titre suivant pendant le fondu
    private int indexFondu = -1;        // titre qui se termine
    private int indexSuivant = -1;      // titre qui commence
    private long dureeFondu = FONDU_MS;
    private long debutFondu = 0;        // moment où le titre suivant a vraiment commencé à jouer
    private final Runnable verifier = new Runnable() {
        @Override
        public void run() {
            verifierFondu();
            surveillant.postDelayed(this, suivant != null ? 50 : 250);
        }
    };

    /** Active / désactive le fondu (AndroidExoPlayerPlugin.setFondu) ; fil principal. */
    static void definirFondu(boolean actif) {
        fonduActif = actif;
        if (!actif && instance != null) instance.annulerFondu();
    }

    private AudioAttributes attributs() {
        return new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build();
    }

    private void verifierFondu() {
        if (player == null) return;
        if (suivant != null) { avancerFondu(); return; }
        if (!fonduActif || !player.isPlaying() || player.getMediaItemCount() < 2) return;
        MediaItem actuel = player.getCurrentMediaItem();
        if (actuel != null && actuel.mediaMetadata.extras != null
            && "video".equals(actuel.mediaMetadata.extras.getString("mediaType", "audio"))) return;
        long duree = player.getDuration();
        if (duree == C.TIME_UNSET || duree < FONDU_MS * 2) return;
        long reste = duree - player.getCurrentPosition();
        if (reste > FONDU_MS || reste < 400) return;
        int prochain = player.getNextMediaItemIndex();
        if (prochain == C.INDEX_UNSET) return;
        demarrerFondu(prochain, reste);
    }

    private void demarrerFondu(int prochain, long reste) {
        List<MediaItem> titres = new ArrayList<>();
        for (int i = 0; i < player.getMediaItemCount(); i++) titres.add(player.getMediaItemAt(i));
        suivant = new ExoPlayer.Builder(this)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build();
        // Pas de gestion du focus audio pour ce second lecteur : il ne doit pas mettre le premier en pause.
        suivant.setAudioAttributes(attributs(), false);
        suivant.setMediaItems(titres, prochain, 0);
        suivant.setRepeatMode(player.getRepeatMode());
        suivant.setVolume(0f);
        suivant.prepare();
        suivant.play();
        indexFondu = player.getCurrentMediaItemIndex();
        indexSuivant = prochain;
        dureeFondu = Math.max(1000, reste - 150);
        debutFondu = 0;
    }

    private void avancerFondu() {
        int index = player.getCurrentMediaItemIndex();
        boolean termine = player.getPlaybackState() == Player.STATE_ENDED || index == indexSuivant;
        // L'auditeur a mis en pause ou choisi un autre titre : on arrête le fondu.
        if (!termine && (index != indexFondu || !player.isPlaying())) { annulerFondu(); return; }
        if (!termine && debutFondu == 0) {
            if (!suivant.isPlaying()) return; // le titre suivant se charge encore
            debutFondu = SystemClock.elapsedRealtime();
        }
        float r = termine ? 1f : Math.min(1f, (SystemClock.elapsedRealtime() - debutFondu) / (float) dureeFondu);
        player.setVolume(1f - r);
        suivant.setVolume(r);
        if (r >= 1f) terminerFondu();
    }

    /** Le lecteur du titre suivant devient celui de la session ; l'ancien est libéré. */
    private void terminerFondu() {
        ExoPlayer ancien = player;
        player = suivant;
        suivant = null;
        player.setVolume(1f);
        player.setAudioAttributes(attributs(), true);
        player.setHandleAudioBecomingNoisy(true);
        if (mediaSession != null) mediaSession.setPlayer(player);
        ancien.stop();
        ancien.release();
        indexFondu = -1;
        indexSuivant = -1;
    }

    private void annulerFondu() {
        if (suivant != null) {
            suivant.stop();
            suivant.release();
            suivant = null;
        }
        if (player != null) player.setVolume(1f);
        indexFondu = -1;
        indexSuivant = -1;
    }

    /** Nouvelle route du titre lancé (AndroidExoPlayerPlugin.playMedia), appliquée à la session. */
    static void definirRoute(android.content.Context ctx, String route) {
        routeCourante = route;
        if (instance != null && instance.mediaSession != null) {
            instance.mediaSession.setSessionActivity(RouteMedia.intention(ctx, route));
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this)
            .setHandleAudioBecomingNoisy(true)
            // Boutons « reculer / avancer » du lecteur vidéo plein écran : 10 secondes.
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build();
        player.setAudioAttributes(attributs(), true);
        mediaSession = new MediaSession.Builder(this, player)
            .setSessionActivity(RouteMedia.intention(this, routeCourante))
            .build();
        instance = this;
        DefaultMediaNotificationProvider notificationProvider =
            new DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(MediaNotificationService.CHANNEL_ID)
                .setChannelName(R.string.media_notification_channel_name)
                .build();
        notificationProvider.setSmallIcon(R.drawable.ic_stat_chay);
        setMediaNotificationProvider(notificationProvider);
        surveillant.post(verifier);
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onTaskRemoved(android.content.Intent rootIntent) {
        if (player == null || !player.isPlaying()) {
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        surveillant.removeCallbacks(verifier);
        annulerFondu();
        instance = null;
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
