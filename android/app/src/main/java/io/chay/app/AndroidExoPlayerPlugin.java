package io.chay.app;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;

@CapacitorPlugin(name = "AndroidExoPlayer")
public class AndroidExoPlayerPlugin extends Plugin {
    private interface ControllerCommand {
        void run(MediaController controller) throws Exception;
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if (controller == null) return;
            emitPlaybackState(null);
            if (controller.isPlaying() ||
                controller.getPlaybackState() == Player.STATE_BUFFERING) {
                mainHandler.postDelayed(this, 500);
            }
        }
    };

    private MediaController controller;
    private ListenableFuture<MediaController> controllerFuture;
    private PlayerView playerView;
    // Plein écran vidéo : le lecteur Android couvre tout l'écran, en paysage, avec ses propres commandes.
    private boolean pleinEcran = false;
    private FrameLayout.LayoutParams derniereFenetre = null;

    @Override
    public void load() {
        super.load();
        getActivity().runOnUiThread(() -> {
            SessionToken token = new SessionToken(
                getContext(),
                new ComponentName(getContext(), ChayMediaSessionService.class)
            );
            controllerFuture = new MediaController.Builder(getContext(), token)
                .buildAsync();
            controllerFuture.addListener(() -> {
                try {
                    controller = controllerFuture.get();
                    controller.addListener(new Player.Listener() {
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
                        public void onMediaItemTransition(
                            MediaItem mediaItem,
                            int reason
                        ) {
                            emitPlaybackState(null);
                        }

                        @Override
                        public void onPlayerError(PlaybackException error) {
                            emitPlaybackState(error.getMessage());
                        }
                    });
                    attachPlayerView();
                    emitPlaybackState(null);
                } catch (ExecutionException error) {
                    android.util.Log.e(
                        "ExoPlayerPlugin",
                        "Unable to connect to the media session service.",
                        error
                    );
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                }
            }, ContextCompat.getMainExecutor(getContext()));
        });
    }

    @PluginMethod
    public void playMedia(PluginCall call) {
        String requestedUrl = call.getString("url");
        if (!isHttpUrl(requestedUrl)) {
            call.reject("L’URL du média est invalide.");
            return;
        }
        String mediaType = call.getString("mediaType", "audio");
        double initialPosition = Math.max(
            0,
            call.getDouble("initialPositionSeconds", 0.0)
        );
        JSArray queue = call.getArray("queue");
        int requestedIndex = Math.max(0, call.getInt("queueIndex", 0));
        String requestedQueueId = call.getString("queueId");
        String route = call.getString("route");

        withController(call, mediaController -> {
            // Toucher la notification de lecture : écran du titre en cours.
            ChayMediaSessionService.definirRoute(getContext(), route);
            List<MediaItem> mediaItems = buildMediaItems(
                queue,
                requestedUrl,
                mediaType,
                call.getString("title", "Média"),
                call.getString("artist", "CHAY"),
                call.getString("artworkUrl", ""),
                requestedQueueId
            );
            if (mediaItems.isEmpty()) {
                call.reject("La file de lecture ne contient aucun média valide.");
                return;
            }

            int currentIndex = findRequestedIndex(
                mediaItems,
                requestedUrl,
                requestedQueueId,
                requestedIndex
            );
            long startPositionMs = (long) (initialPosition * 1000);
            boolean alreadyAtRequestedItem =
                mediaController.getMediaItemCount() == mediaItems.size() &&
                mediaController.getCurrentMediaItemIndex() == currentIndex &&
                requestedUrl.equals(currentSource(mediaController)) &&
                sameQueue(mediaController, mediaItems);

            if (!alreadyAtRequestedItem) {
                mediaController.setMediaItems(mediaItems, currentIndex, startPositionMs);
                mediaController.prepare();
            } else if (mediaController.getPlaybackState() == Player.STATE_ENDED) {
                mediaController.seekTo(0);
            } else if (mediaController.getPlaybackState() == Player.STATE_IDLE) {
                mediaController.prepare();
            }
            mediaController.play();
            emitPlaybackState(null);
            call.resolve();
        });
    }

    @PluginMethod
    public void pauseMedia(PluginCall call) {
        withController(call, mediaController -> {
            mediaController.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void resumeMedia(PluginCall call) {
        withController(call, mediaController -> {
            if (mediaController.getPlaybackState() == Player.STATE_ENDED) {
                mediaController.seekTo(0);
            } else if (mediaController.getPlaybackState() == Player.STATE_IDLE &&
                mediaController.getMediaItemCount() > 0) {
                mediaController.prepare();
            }
            mediaController.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void seekMedia(PluginCall call) {
        double seconds = Math.max(0, call.getDouble("positionSeconds", 0.0));
        withController(call, mediaController -> {
            mediaController.seekTo((long) (seconds * 1000));
            call.resolve();
        });
    }

    /**
     * Nouvel ordre de la file (identifiants queueId) SANS interrompre le titre en cours : les éléments sont
     * déplacés un à un (moveMediaItem garde la lecture et la position). Les identifiants absents de la file
     * du lecteur sont ignorés ; les éléments non cités restent à la fin, dans leur ordre.
     */
    @PluginMethod
    public void reorderQueue(PluginCall call) {
        JSArray ids = call.getArray("queueIds");
        withController(call, mediaController -> {
            if (ids == null) {
                call.resolve();
                return;
            }
            int cible = 0;
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, null);
                if (id == null) continue;
                int trouve = -1;
                for (int j = cible; j < mediaController.getMediaItemCount(); j++) {
                    if (id.equals(mediaController.getMediaItemAt(j).mediaId)) {
                        trouve = j;
                        break;
                    }
                }
                if (trouve < 0) continue;
                if (trouve != cible) mediaController.moveMediaItem(trouve, cible);
                cible++;
            }
            emitPlaybackState(null);
            call.resolve();
        });
    }

    /** Lecture non-stop (Votre Playlist) : fondu enchaîné de 5 s (ChayMediaSessionService). */
    @PluginMethod
    public void setFondu(PluginCall call) {
        boolean actif = Boolean.TRUE.equals(call.getBoolean("actif", false));
        mainHandler.post(() -> {
            ChayMediaSessionService.definirFondu(actif);
            call.resolve();
        });
    }

    @PluginMethod
    public void setRepeatMode(PluginCall call) {
        String mode = call.getString("mode", "off");
        withController(call, mediaController -> {
            mediaController.setRepeatMode(
                "one".equals(mode) ? Player.REPEAT_MODE_ONE :
                    "all".equals(mode) ? Player.REPEAT_MODE_ALL :
                        Player.REPEAT_MODE_OFF
            );
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = Math.max(0, Math.min(1, call.getDouble("volume", 1.0)));
        withController(call, mediaController -> {
            mediaController.setVolume((float) volume);
            call.resolve();
        });
    }

    @PluginMethod
    public void stopMedia(PluginCall call) {
        withController(call, mediaController -> {
            mediaController.stop();
            mediaController.clearMediaItems();
            emitPlaybackState(null);
            call.resolve();
        });
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean actif = call.getBoolean("active", false);
        if (playerView == null || getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (actif) entrerPleinEcran();
            else quitterPleinEcran(false);
            call.resolve();
        });
    }

    /** Plein écran de la page elle-même (lecteur YouTube) : paysage et barres du téléphone masquées. */
    @PluginMethod
    public void setImmersif(PluginCall call) {
        boolean actif = call.getBoolean("active", false);
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat barres = WindowCompat.getInsetsController(
                getActivity().getWindow(), getActivity().getWindow().getDecorView());
            if (actif) {
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                barres.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                barres.hide(WindowInsetsCompat.Type.systemBars());
            } else if (!pleinEcran) {
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                barres.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    private void entrerPleinEcran() {
        if (playerView == null || getActivity() == null || pleinEcran) return;
        pleinEcran = true;
        if (playerView.getLayoutParams() instanceof FrameLayout.LayoutParams) {
            derniereFenetre = new FrameLayout.LayoutParams((FrameLayout.LayoutParams) playerView.getLayoutParams());
        }
        playerView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setUseController(true);
        playerView.setControllerShowTimeoutMs(3000);
        playerView.setFullscreenButtonClickListener(etat -> quitterPleinEcran(true));
        playerView.setVisibility(View.VISIBLE);
        playerView.bringToFront();
        playerView.showController();
        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        WindowInsetsControllerCompat barres = WindowCompat.getInsetsController(
            getActivity().getWindow(), getActivity().getWindow().getDecorView());
        barres.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        barres.hide(WindowInsetsCompat.Type.systemBars());
    }

    /** `prevenir` : sortie demandée par le lecteur Android (bouton) : l'app est avertie pour se remettre à jour. */
    private void quitterPleinEcran(boolean prevenir) {
        if (playerView == null || getActivity() == null || !pleinEcran) return;
        pleinEcran = false;
        playerView.setUseController(false);
        playerView.setFullscreenButtonClickListener(null);
        playerView.setBackgroundColor(Color.TRANSPARENT);
        if (derniereFenetre != null) playerView.setLayoutParams(derniereFenetre);
        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView())
            .show(WindowInsetsCompat.Type.systemBars());
        if (prevenir) {
            JSObject data = new JSObject();
            data.put("active", false);
            notifyListeners("fullscreen", data);
        }
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
            // En plein écran, la fenêtre vidéo couvre tout l'écran : les positions de la page sont ignorées.
            if (pleinEcran && visible) {
                call.resolve();
                return;
            }
            if (!visible || width <= 0 || height <= 0) {
                quitterPleinEcran(true);
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
            int x = webViewLocation[0] - contentLocation[0] +
                (int) Math.round(left * scale);
            int y = webViewLocation[1] - contentLocation[1] +
                (int) Math.round(top * scale);
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

    private void attachPlayerView() {
        if (controller == null || getActivity() == null) return;
        playerView = new PlayerView(getContext());
        playerView.setUseController(false);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        playerView.setPlayer(controller);
        playerView.setVisibility(View.GONE);
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        if (content != null) {
            content.addView(
                playerView,
                new FrameLayout.LayoutParams(1, 1, Gravity.TOP | Gravity.START)
            );
        }
    }

    private void withController(PluginCall call, ControllerCommand command) {
        ListenableFuture<MediaController> future = controllerFuture;
        if (future == null) {
            call.reject("Le lecteur Android n’est pas encore initialisé.");
            return;
        }
        future.addListener(() -> {
            try {
                MediaController connectedController = future.get();
                controller = connectedController;
                command.run(connectedController);
            } catch (ExecutionException error) {
                call.reject("Impossible de connecter le lecteur Android.", error);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                call.reject("La connexion au lecteur Android a été interrompue.", error);
            } catch (Exception error) {
                call.reject("La commande du lecteur Android a échoué.", error);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private List<MediaItem> buildMediaItems(
        JSArray queue,
        String fallbackUrl,
        String fallbackType,
        String fallbackTitle,
        String fallbackArtist,
        String fallbackArtwork,
        String fallbackQueueId
    ) throws Exception {
        List<MediaItem> items = new ArrayList<>();
        if (queue != null && queue.length() > 0) {
            for (int i = 0; i < queue.length(); i++) {
                JSONObject entry = queue.getJSONObject(i);
                String url = entry.optString("audio_url", entry.optString("url", ""));
                if (!isHttpUrl(url)) continue;
                items.add(createMediaItem(
                    url,
                    entry.optString("mediaType", fallbackType),
                    entry.optString("title", "Média"),
                    entry.optString("artist", "CHAY"),
                    entry.optString("cover_url", entry.optString("artworkUrl", "")),
                    entry.optString("queueId", entry.optString("id", url))
                ));
            }
        }
        if (items.isEmpty()) {
            items.add(createMediaItem(
                fallbackUrl,
                fallbackType,
                fallbackTitle,
                fallbackArtist,
                fallbackArtwork,
                fallbackQueueId == null ? fallbackUrl : fallbackQueueId
            ));
        }
        return items;
    }

    private MediaItem createMediaItem(
        String url,
        String mediaType,
        String title,
        String artist,
        String artworkUrl,
        String queueId
    ) {
        Uri uri = Uri.parse(url);
        Bundle extras = new Bundle();
        extras.putString("mediaType", mediaType);
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setExtras(extras);
        if (isHttpUrl(artworkUrl)) {
            metadata.setArtworkUri(Uri.parse(artworkUrl));
        }
        MediaItem.Builder item = new MediaItem.Builder()
            .setMediaId(queueId)
            .setUri(uri)
            .setMediaMetadata(metadata.build());
        if ("radio".equals(mediaType)) {
            item.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().build());
        }
        return item.build();
    }

    private int findRequestedIndex(
        List<MediaItem> items,
        String url,
        String queueId,
        int requestedIndex
    ) {
        if (queueId != null) {
            for (int i = 0; i < items.size(); i++) {
                if (queueId.equals(items.get(i).mediaId)) return i;
            }
        }
        for (int i = 0; i < items.size(); i++) {
            if (url.equals(items.get(i).localConfiguration.uri.toString())) return i;
        }
        return Math.min(requestedIndex, items.size() - 1);
    }

    private boolean sameQueue(MediaController mediaController, List<MediaItem> items) {
        if (mediaController.getMediaItemCount() != items.size()) return false;
        for (int i = 0; i < items.size(); i++) {
            MediaItem current = mediaController.getMediaItemAt(i);
            MediaItem requested = items.get(i);
            if (!current.mediaId.equals(requested.mediaId) ||
                !current.localConfiguration.uri.equals(requested.localConfiguration.uri)) {
                return false;
            }
        }
        return true;
    }

    private String currentSource(MediaController mediaController) {
        MediaItem current = mediaController.getCurrentMediaItem();
        return current == null || current.localConfiguration == null
            ? ""
            : current.localConfiguration.uri.toString();
    }

    private boolean isHttpUrl(String value) {
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return uri.getHost() != null &&
            ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
    }

    private void emitPlaybackState(String error) {
        if (controller == null) return;
        MediaItem item = controller.getCurrentMediaItem();
        Uri uri = item == null || item.localConfiguration == null
            ? null
            : item.localConfiguration.uri;
        Bundle extras = item == null ? null : item.mediaMetadata.extras;
        String mediaType = extras == null
            ? "audio"
            : extras.getString("mediaType", "audio");
        long positionMs = Math.max(0, controller.getCurrentPosition());
        long durationMs = Math.max(0, controller.getDuration());
        long bufferedMs = Math.max(0, controller.getBufferedPosition());
        JSObject state = new JSObject();
        state.put("source", uri == null ? "" : uri.toString());
        state.put("queueId", item == null ? "" : item.mediaId);
        state.put("mediaType", mediaType);
        state.put("isPlaying", controller.isPlaying());
        state.put("isBuffering", controller.getPlaybackState() == Player.STATE_BUFFERING);
        state.put("isEnded", controller.getPlaybackState() == Player.STATE_ENDED);
        state.put("isLive", "radio".equals(mediaType));
        state.put("currentTime", positionMs / 1000.0);
        state.put(
            "duration",
            durationMs == C.TIME_UNSET ? 0 : durationMs / 1000.0
        );
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
        if (controller != null &&
            (controller.isPlaying() ||
                controller.getPlaybackState() == Player.STATE_BUFFERING)) {
            mainHandler.postDelayed(progressTicker, 500);
        }
    }

    @Override
    protected void handleOnDestroy() {
        mainHandler.removeCallbacks(progressTicker);
        if (playerView != null) {
            ViewGroup parent = (ViewGroup) playerView.getParent();
            if (parent != null) parent.removeView(playerView);
            playerView.setPlayer(null);
            playerView = null;
        }
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
            controllerFuture = null;
        }
        controller = null;
        super.handleOnDestroy();
    }
}
