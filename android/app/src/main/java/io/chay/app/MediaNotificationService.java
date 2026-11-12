package io.chay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.media.AudioAttributes;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaNotificationService extends Service {
    static final String ACTION_UPDATE = "io.chay.app.media.UPDATE";
    static final String ACTION_CLEAR = "io.chay.app.media.CLEAR";
    private static final String ACTION_PLAY = "io.chay.app.media.PLAY";
    private static final String ACTION_PAUSE = "io.chay.app.media.PAUSE";
    private static final String ACTION_STOP = "io.chay.app.media.STOP";
    private static final String ACTION_PREVIOUS = "io.chay.app.media.PREVIOUS";
    private static final String ACTION_NEXT = "io.chay.app.media.NEXT";
    private static final String ACTION_SEEK = "io.chay.app.media.SEEK";
    static final String CHANNEL_ID = "chay_now_playing";
    private static final int NOTIFICATION_ID = 7801;

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_ARTIST = "artist";
    static final String EXTRA_ARTWORK_URL = "artworkUrl";
    static final String EXTRA_IS_PLAYING = "isPlaying";
    static final String EXTRA_IS_BUFFERING = "isBuffering";
    static final String EXTRA_IS_LIVE = "isLive";
    static final String EXTRA_CURRENT_TIME = "currentTime";
    static final String EXTRA_DURATION = "duration";
    static final String EXTRA_HAS_PREVIOUS = "hasPrevious";
    static final String EXTRA_HAS_NEXT = "hasNext";
    private static final String EXTRA_SEEK_POSITION_MS = "seekPositionMs";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private NotificationManager notificationManager;
    private MediaSession mediaSession;
    private String title = "Média";
    private String artist = "CHAY";
    private String artworkUrl = "";
    private Bitmap artwork;
    private boolean isPlaying;
    private boolean isBuffering;
    private boolean isLive;
    private boolean hasPrevious;
    private boolean hasNext;
    private boolean foreground;
    private double currentTime;
    private double duration;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        createNotificationChannel();
        mediaSession = new MediaSession(this, "CHAY Now Playing");
        mediaSession.setFlags(
            MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setPlaybackToLocal(
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        );
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { AndroidMediaNotificationPlugin.dispatchAction("play", -1); }
            @Override public void onPause() { AndroidMediaNotificationPlugin.dispatchAction("pause", -1); }
            @Override public void onStop() { AndroidMediaNotificationPlugin.dispatchAction("stop", -1); }
            @Override public void onSkipToPrevious() { AndroidMediaNotificationPlugin.dispatchAction("previous", -1); }
            @Override public void onSkipToNext() { AndroidMediaNotificationPlugin.dispatchAction("next", -1); }
            @Override public void onSeekTo(long position) { AndroidMediaNotificationPlugin.dispatchAction("seek", position); }
        });
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_CLEAR.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE.equals(action)) {
            applyUpdate(intent);
            updateSession();
            showNotification();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action)) AndroidMediaNotificationPlugin.dispatchAction("play", -1);
        else if (ACTION_PAUSE.equals(action)) AndroidMediaNotificationPlugin.dispatchAction("pause", -1);
        else if (ACTION_STOP.equals(action)) AndroidMediaNotificationPlugin.dispatchAction("stop", -1);
        else if (ACTION_PREVIOUS.equals(action)) AndroidMediaNotificationPlugin.dispatchAction("previous", -1);
        else if (ACTION_NEXT.equals(action)) AndroidMediaNotificationPlugin.dispatchAction("next", -1);
        else if (ACTION_SEEK.equals(action)) {
            AndroidMediaNotificationPlugin.dispatchAction(
                "seek",
                intent.getLongExtra(EXTRA_SEEK_POSITION_MS, -1)
            );
        }
        return START_NOT_STICKY;
    }

    private void applyUpdate(Intent intent) {
        String nextArtworkUrl = intent.getStringExtra(EXTRA_ARTWORK_URL);
        boolean artworkChanged = nextArtworkUrl != null && !nextArtworkUrl.equals(artworkUrl);
        title = valueOr(intent.getStringExtra(EXTRA_TITLE), "Média");
        artist = valueOr(intent.getStringExtra(EXTRA_ARTIST), "CHAY");
        artworkUrl = valueOr(nextArtworkUrl, "");
        isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
        isBuffering = intent.getBooleanExtra(EXTRA_IS_BUFFERING, false);
        isLive = intent.getBooleanExtra(EXTRA_IS_LIVE, false);
        currentTime = Math.max(0, intent.getDoubleExtra(EXTRA_CURRENT_TIME, 0));
        duration = Math.max(0, intent.getDoubleExtra(EXTRA_DURATION, 0));
        hasPrevious = intent.getBooleanExtra(EXTRA_HAS_PREVIOUS, false);
        hasNext = intent.getBooleanExtra(EXTRA_HAS_NEXT, false);
        if (artworkChanged) {
            artwork = null;
            loadArtwork(artworkUrl);
        }
    }

    private void updateSession() {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, isLive ? "Radio" : "ÉGLISE CHAY")
            .putLong(MediaMetadata.METADATA_KEY_DURATION, (long) (duration * 1000));
        if (!artworkUrl.isEmpty()) {
            metadata.putString(MediaMetadata.METADATA_KEY_ART_URI, artworkUrl);
        }
        if (artwork != null) {
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }
        mediaSession.setMetadata(metadata.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
            PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP;
        if (!isLive && duration > 0) {
            actions |= PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD;
        }
        if (hasPrevious) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        if (hasNext) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
        PlaybackState.Builder playback = new PlaybackState.Builder().setActions(actions);
        if (!isLive && duration > 0) {
            playback.setState(
                isBuffering ? PlaybackState.STATE_BUFFERING :
                    isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                Math.min((long) (currentTime * 1000), (long) (duration * 1000)),
                isPlaying && !isBuffering ? 1f : 0f,
                SystemClock.elapsedRealtime()
            );
        } else {
            playback.setState(
                isBuffering ? PlaybackState.STATE_BUFFERING :
                    isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                isPlaying && !isBuffering ? 1f : 0f
            );
        }
        mediaSession.setPlaybackState(playback.build());
        mediaSession.setActive(true);
    }

    private void showNotification() {
        Notification notification = buildNotification();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } else {
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        builder
            .setSmallIcon(R.drawable.ic_stat_chay)
            .setContentTitle(title)
            .setContentText(artist)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setShowWhen(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setSubText(
                isLive
                    ? (isBuffering ? "Mise en mémoire tampon" : "Radio Chay")
                    : "ÉGLISE CHAY"
            );
        }
        if (artwork != null) builder.setLargeIcon(artwork);

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentImmutableFlag()
            );
            builder.setContentIntent(contentIntent);
        }

        java.util.ArrayList<Integer> compactActions = new java.util.ArrayList<>();
        int actionIndex = 0;
        if (hasPrevious) {
            builder.addAction(action(android.R.drawable.ic_media_previous, "Précédent", ACTION_PREVIOUS, 1));
            compactActions.add(actionIndex++);
        }
        builder.addAction(
            action(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Pause" : "Lecture",
                isPlaying ? ACTION_PAUSE : ACTION_PLAY,
                2
            )
        );
        compactActions.add(actionIndex++);
        if (hasNext) {
            builder.addAction(action(android.R.drawable.ic_media_next, "Suivant", ACTION_NEXT, 3));
            compactActions.add(actionIndex);
        }
        builder.addAction(
            action(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", ACTION_STOP, 4)
        );
        int[] compact = new int[compactActions.size()];
        for (int i = 0; i < compactActions.size(); i++) compact[i] = compactActions.get(i);
        builder.setStyle(
            new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(compact)
        );
        return builder.build();
    }

    private Notification.Action action(int icon, String label, String action, int requestCode) {
        Intent intent = new Intent(this, MediaNotificationService.class).setAction(action);
        PendingIntent pendingIntent = PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentImmutableFlag()
        );
        return new Notification.Action.Builder(icon, label, pendingIntent).build();
    }

    private int pendingIntentImmutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Lecture multimédia",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Contrôles système pour les médias en cours de lecture");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(channel);
    }

    private void loadArtwork(String url) {
        if (url.isEmpty() || !("https".equalsIgnoreCase(Uri.parse(url).getScheme()) ||
            "http".equalsIgnoreCase(Uri.parse(url).getScheme()))) return;
        artworkExecutor.execute(() -> {
            Bitmap bitmap = null;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(4000);
                connection.setReadTimeout(4000);
                connection.setInstanceFollowRedirects(true);
                try (InputStream input = connection.getInputStream();
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int total = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1 && total < 5 * 1024 * 1024) {
                        int remaining = 5 * 1024 * 1024 - total;
                        int length = Math.min(read, remaining);
                        output.write(buffer, 0, length);
                        total += length;
                    }
                    byte[] imageBytes = output.toByteArray();
                    BitmapFactory.Options bounds = new BitmapFactory.Options();
                    bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length, bounds);
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inSampleSize = 1;
                    while (bounds.outWidth / options.inSampleSize > 384 ||
                        bounds.outHeight / options.inSampleSize > 384) {
                        options.inSampleSize *= 2;
                    }
                    bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length, options);
                }
            } catch (Exception error) {
                android.util.Log.w("ChayMediaNotification", "Unable to load media artwork.", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
            Bitmap loaded = bitmap;
            mainHandler.post(() -> {
                if (loaded == null || !url.equals(artworkUrl)) return;
                artwork = loaded;
                updateSession();
                if (foreground) notificationManager.notify(NOTIFICATION_ID, buildNotification());
            });
        });
    }

    private String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep the playback notification and media session while the app is
        // minimized or removed from the recent-apps list.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        artworkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
