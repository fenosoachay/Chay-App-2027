package io.chay.app;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public class ChayMediaSessionService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession mediaSession;
    // Écran du titre en cours (toucher la notification de lecture) ; fil principal seulement.
    private static String routeCourante;
    private static ChayMediaSessionService instance;

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
        player.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(),
            true
        );
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
