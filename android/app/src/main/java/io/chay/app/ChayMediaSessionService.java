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

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this)
            .setHandleAudioBecomingNoisy(true)
            .build();
        player.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(),
            true
        );
        mediaSession = new MediaSession.Builder(this, player).build();
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
