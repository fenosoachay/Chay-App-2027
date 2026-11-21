package io.chay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * Pendant une diffusion sur TV : garde le relais du téléphone actif, même écran éteint (Wi-Fi et processeur
 * maintenus), avec une notification « Diffusion sur … » et un bouton « Arrêter ».
 */
public class ChayTvService extends Service {
    static final String ACTION_ARRETER = "io.chay.app.TV_ARRETER";
    static final String CANAL = "chay-tv";
    static final int ID = 4310;

    private WifiManager.WifiLock wifi;
    private PowerManager.WakeLock reveil;

    static void demarrer(Context ctx, String nomTv, String titre) {
        Intent i = new Intent(ctx, ChayTvService.class).putExtra("nom", nomTv).putExtra("titre", titre);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    static void arreter(Context ctx) {
        ctx.stopService(new Intent(ctx, ChayTvService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_ARRETER.equals(intent.getAction())) {
            ChayTvPlugin.arreterTout(getApplicationContext(), true);
            stopSelf();
            return START_NOT_STICKY;
        }
        String nom = intent != null ? intent.getStringExtra("nom") : null;
        String titre = intent != null ? intent.getStringExtra("titre") : null;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Diffusion sur TV", NotificationManager.IMPORTANCE_LOW);
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        int imm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent ouvrir = PendingIntent.getActivity(this, ID,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | imm);
        PendingIntent stop = PendingIntent.getService(this, ID + 1,
            new Intent(this, ChayTvService.class).setAction(ACTION_ARRETER), PendingIntent.FLAG_UPDATE_CURRENT | imm);
        Notification n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_chay)
            .setContentTitle("Diffusion sur " + (nom != null && !nom.isEmpty() ? nom : "la TV"))
            .setContentText(titre != null ? titre : "")
            .setContentIntent(ouvrir)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(0, "Arrêter", stop)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);

        if (wifi == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "chay-tv");
                wifi.setReferenceCounted(false);
                wifi.acquire();
            }
        }
        if (reveil == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                reveil = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chay:tv");
                reveil.setReferenceCounted(false);
                reveil.acquire(6 * 60 * 60 * 1000L); // 6 h au plus
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wifi != null && wifi.isHeld()) wifi.release();
        if (reveil != null && reveil.isHeld()) reveil.release();
        wifi = null;
        reveil = null;
        super.onDestroy();
    }
}
