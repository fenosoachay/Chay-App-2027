package io.chay.app;

import androidx.media3.common.AudioAttributes;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaNotificationManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidExoPlayer")
public class AndroidExoPlayerPlugin extends Plugin {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            emitPlaybackState(null);
            if (player.isPlaying() || player.getPlaybackState() == Player.STATE_BUFFERING) {
                mainHandler.postDelayed(this, 500);
            }
        }
    };
    private ExoPlayer player;
    private PlayerView playerView;
    private MediaSession mediaSession;
    private MediaNotificationManager mediaNotificationManager;
    private String source = "";
    private String mediaType = "audio";

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            player = new ExoPlayer.Builder(getContext())
                .setHandleAudioBecomingNoisy(true)
                .build();
                        // Configuration audio pour la notification
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true
            );

            // Création de la session média et du gestionnaire de notification
            mediaSession = new MediaSession.Builder(getContext(), player).build();
            mediaNotificationManager = new MediaNotificationManager.Builder(getContext()).build(mediaSession);
            player.addListener(new Player.Listener() {
                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    emitPlaybackState(null);
                    scheduleProgressUpdates();
                }

                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    emitPlaybackState(null);
                    scheduleProgressUpdates();
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    emitPlaybackState(error.getMessage());
                }
            });

            playerView = new PlayerView(getContext());
            playerView.setUseController(false);
            playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
            playerView.setPlayer(player);
            playerView.setVisibility(View.GONE);
            ViewGroup content = getActivity().findViewById(android.R.id.content);
            if (content != null) {
                content.addView(
                    playerView,
                    new FrameLayout.LayoutParams(1, 1, Gravity.TOP | Gravity.START)
                );
            }
        });
    }

    @PluginMethod
    public void playMedia(PluginCall call) {
        String url = call.getString("url");
        Uri uri = url == null ? null : Uri.parse(url);
        String scheme = uri == null ? null : uri.getScheme();
        if (uri == null || uri.getHost() == null ||
            !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            call.reject("L’URL du média est invalide.");
            return;
        }

        String nextSource = uri.toString();
        String nextType = call.getString("mediaType", "audio");
        String title = call.getString("title", "Média");
        String artist = call.getString("artist", "CHAY");
        double initialPosition = Math.max(0, call.getDouble("initialPositionSeconds", 0.0));

        getActivity().runOnUiThread(() -> {
            if (player == null) {
                call.reject("Le lecteur Android n’est pas disponible.");
                return;
            }

            boolean sameMedia = nextSource.equals(source) && nextType.equals(mediaType);
            source = nextSource;
            mediaType = nextType;
            if (playerView != null) {
                playerView.setVisibility("video".equals(nextType) ? View.VISIBLE : View.GONE);
            }
            if (!sameMedia) {
                MediaMetadata metadata = new MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .build();
                MediaItem.Builder itemBuilder = new MediaItem.Builder()
                    .setUri(uri)
                    .setMediaMetadata(metadata);
                if ("radio".equals(nextType)) {
                    itemBuilder.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().build());
                }
                player.setMediaItem(itemBuilder.build());
                player.prepare();
                if (initialPosition > 0) {
                    player.seekTo((long) (initialPosition * 1000));
                }
            } else if (player.getPlaybackState() == Player.STATE_ENDED) {
                player.seekTo(0);
            } else if (player.getPlaybackState() == Player.STATE_IDLE) {
                player.prepare();
            }
            player.play();
            emitPlaybackState(null);
            call.resolve();
        });
    }

    @PluginMethod
    public void pauseMedia(PluginCall call) {
        if (player != null) player.pause();
        call.resolve();
    }

    @PluginMethod
    public void resumeMedia(PluginCall call) {
        if (player != null) {
            if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
            else if (player.getPlaybackState() == Player.STATE_IDLE && player.getMediaItemCount() > 0) {
                player.prepare();
            }
            player.play();
        }
        call.resolve();
    }

    @PluginMethod
    public void seekMedia(PluginCall call) {
        double seconds = Math.max(0, call.getDouble("positionSeconds", 0.0));
        if (player != null) player.seekTo((long) (seconds * 1000));
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = Math.max(0, Math.min(1, call.getDouble("volume", 1.0)));
        if (player != null) player.setVolume((float) volume);
        call.resolve();
    }

    @PluginMethod
    public void stopMedia(PluginCall call) {
        if (player != null) {
            player.stop();
            player.clearMediaItems();
        }
        source = "";
        emitPlaybackState(null);
        call.resolve();
    }

    @PluginMethod
    public void setVideoBounds(PluginCall call) {
        if (playerView == null || getActivity() == null) {
            call.resolve();
            return;
        }

        boolean visible = call.getBoolean("visible", false);
        double left = call.getDouble("left", 0.0);
        double top = call.getDouble("top", 0.0);
        double width = call.getDouble("width", 0.0);
        double height = call.getDouble("height", 0.0);
        double viewportWidth = call.getDouble("viewportWidth", 0.0);

        getActivity().runOnUiThread(() -> {
            if (playerView == null) return;
            if (!visible || width <= 0 || height <= 0) {
                playerView.setVisibility(View.GONE);
                call.resolve();
                return;
            }

            ViewGroup content = getActivity().findViewById(android.R.id.content);
            View webView = bridge == null ? null : bridge.getWebView();
            if (content == null || webView == null) {
                playerView.setVisibility(View.GONE);
                call.reject("Impossible de positionner la surface vidéo Android.");
                return;
            }

            int[] contentLocation = new int[2];
            int[] webViewLocation = new int[2];
            content.getLocationOnScreen(contentLocation);
            webView.getLocationOnScreen(webViewLocation);
            double scale = webView.getWidth() / Math.max(1.0, viewportWidth);
            if (scale <= 0) {
                playerView.setVisibility(View.GONE);
                call.resolve();
                return;
            }
            int x = webViewLocation[0] - contentLocation[0] + (int) Math.round(left * scale);
            int y = webViewLocation[1] - contentLocation[1] + (int) Math.round(top * scale);
            int viewWidth = (int) Math.round(width * scale);
            int viewHeight = (int) Math.round(height * scale);

            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                viewWidth,
                viewHeight,
                Gravity.TOP | Gravity.START
            );
            params.leftMargin = x;
            params.topMargin = y;
            playerView.setLayoutParams(params);
            playerView.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    private void emitPlaybackState(String error) {
        if (player == null) return;
        long positionMs = Math.max(0, player.getCurrentPosition());
        long durationMs = Math.max(0, player.getDuration());
        long bufferedMs = Math.max(0, player.getBufferedPosition());
        JSObject state = new JSObject();
        state.put("source", source);
        state.put("mediaType", mediaType);
        state.put("isPlaying", player.isPlaying());
        state.put("isBuffering", player.getPlaybackState() == Player.STATE_BUFFERING);
        state.put("isEnded", player.getPlaybackState() == Player.STATE_ENDED);
        state.put("isLive", "radio".equals(mediaType));
        state.put("currentTime", positionMs / 1000.0);
        state.put("duration", durationMs == C.TIME_UNSET ? 0 : durationMs / 1000.0);
        state.put(
            "bufferedRatio",
            durationMs > 0 && durationMs != C.TIME_UNSET
                ? Math.min(1.0, bufferedMs / (double) durationMs)
                : 0
        );
        if (error != null) state.put("error", error);
        notifyListeners("playbackState", state);
    }

    private void scheduleProgressUpdates() {
        mainHandler.removeCallbacks(progressTicker);
        if (player != null &&
            (player.isPlaying() || player.getPlaybackState() == Player.STATE_BUFFERING)) {
            mainHandler.postDelayed(progressTicker, 500);
        }
    }

    @Override
    protected void handleOnDestroy() {
        mainHandler.removeCallbacks(progressTicker);

            if (mediaNotificationManager != null) {
            mediaNotificationManager.stop();
        }
        if (mediaSession != null) {
            mediaSession.release();
        }
        if (playerView != null) {
            ViewGroup parent = (ViewGroup) playerView.getParent();
            if (parent != null) parent.removeView(playerView);
            playerView.setPlayer(null);
            playerView = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.handleOnDestroy();
    }
}
