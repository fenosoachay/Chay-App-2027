package io.chay.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "AndroidMediaNotification",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public class AndroidMediaNotificationPlugin extends Plugin {
    private static Bridge staticBridge;

    @Override
    public void load() {
        staticBridge = bridge;
    }

    @com.getcapacitor.PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (isNotificationPermissionGranted()) {
            call.resolve(notificationPermissionResult());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(notificationPermissionResult());
    }

    @com.getcapacitor.PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        call.resolve(notificationPermissionResult());
    }

    @com.getcapacitor.PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            NotificationManager manager =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null &&
                manager.getNotificationChannel(MediaNotificationService.CHANNEL_ID) != null) {
                intent.putExtra(
                    android.provider.Settings.EXTRA_CHANNEL_ID,
                    MediaNotificationService.CHANNEL_ID
                );
            }
        } else {
            intent = new Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @com.getcapacitor.PluginMethod
    public void update(PluginCall call) {
        if (!Boolean.TRUE.equals(notificationPermissionResult().getBool("granted"))) {
            call.reject("Autorisez les notifications de l'application pour afficher le lecteur Android.");
            return;
        }
        Intent intent = new Intent(getContext(), MediaNotificationService.class)
            .setAction(MediaNotificationService.ACTION_UPDATE)
            .putExtra(MediaNotificationService.EXTRA_TITLE, call.getString("title", "Média"))
            .putExtra(MediaNotificationService.EXTRA_ARTIST, call.getString("artist", "CHAY"))
            .putExtra(MediaNotificationService.EXTRA_ARTWORK_URL, call.getString("artworkUrl", ""))
            .putExtra(MediaNotificationService.EXTRA_IS_PLAYING, call.getBoolean("isPlaying", false))
            .putExtra(MediaNotificationService.EXTRA_IS_BUFFERING, call.getBoolean("isBuffering", false))
            .putExtra(MediaNotificationService.EXTRA_IS_LIVE, call.getBoolean("isLive", false))
            .putExtra(MediaNotificationService.EXTRA_CURRENT_TIME, call.getDouble("currentTime", 0.0))
            .putExtra(MediaNotificationService.EXTRA_DURATION, call.getDouble("duration", 0.0))
            .putExtra(MediaNotificationService.EXTRA_HAS_PREVIOUS, call.getBoolean("hasPrevious", false))
            .putExtra(MediaNotificationService.EXTRA_HAS_NEXT, call.getBoolean("hasNext", false));
        try {
            startService(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible de démarrer le lecteur multimédia Android.", error);
        }
    }

    @com.getcapacitor.PluginMethod
    public void clear(PluginCall call) {
        Intent intent = new Intent(getContext(), MediaNotificationService.class)
            .setAction(MediaNotificationService.ACTION_CLEAR);
        getContext().stopService(intent);
        call.resolve();
    }

    private void startService(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }

    private boolean isNotificationPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED;
    }

    private JSObject notificationPermissionResult() {
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        boolean appEnabled = Build.VERSION.SDK_INT < Build.VERSION_CODES.N ||
            manager == null || manager.areNotificationsEnabled();
        boolean channelEnabled = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel =
                manager.getNotificationChannel(MediaNotificationService.CHANNEL_ID);
            channelEnabled = channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        boolean granted = isNotificationPermissionGranted() && appEnabled && channelEnabled;
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("appEnabled", appEnabled);
        result.put("channelEnabled", channelEnabled);
        return result;
    }

    static void dispatchAction(String action, long positionMs) {
        Bridge currentBridge = staticBridge;
        if (currentBridge == null) return;
        PluginHandle handle = currentBridge.getPlugin("AndroidMediaNotification");
        if (handle == null) return;
        JSObject payload = new JSObject();
        payload.put("action", action);
        if (positionMs >= 0) payload.put("position", positionMs / 1000.0);
        ((AndroidMediaNotificationPlugin) handle.getInstance()).notifyListeners("mediaAction", payload, true);
    }
}
