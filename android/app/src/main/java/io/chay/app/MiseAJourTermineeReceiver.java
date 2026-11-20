package io.chay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Après une mise à jour de Chay (Android ferme l'app pendant l'installation) : notification « Chay est à jour »,
 * qui rouvre l'application d'un geste. Rien si les notifications sont désactivées.
 */
public class MiseAJourTermineeReceiver extends BroadcastReceiver {
    static final String CANAL = "chay-mise-a-jour";
    static final int ID = 4210;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        try {
            NotificationManagerCompat nmc = NotificationManagerCompat.from(context);
            if (!nmc.areNotificationsEnabled()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = context.getSystemService(NotificationManager.class);
                if (nm != null && nm.getNotificationChannel(CANAL) == null) {
                    nm.createNotificationChannel(new NotificationChannel(CANAL, "Mises à jour", NotificationManager.IMPORTANCE_DEFAULT));
                }
            }
            Intent ouvrir = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(context, ID, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String version = "";
            try {
                version = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            } catch (Exception ignore) { /* version inconnue */ }
            NotificationCompat.Builder b = new NotificationCompat.Builder(context, CANAL)
                .setSmallIcon(R.drawable.ic_stat_chay)
                .setContentTitle("Chay est à jour")
                .setContentText((version == null || version.isEmpty() ? "" : "Version " + version + " · ") + "Touche pour ouvrir l'application.")
                .setContentIntent(pi)
                .setAutoCancel(true);
            nmc.notify(ID, b.build());
        } catch (SecurityException e) {
            // Permission de notification refusée : rien à afficher.
        }
    }
}
