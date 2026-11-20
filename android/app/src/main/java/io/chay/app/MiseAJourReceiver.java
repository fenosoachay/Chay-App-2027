package io.chay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/**
 * Réponse d'Android à la session d'installation de ChayMiseAJourPlugin :
 *  - confirmation nécessaire : on ouvre la fenêtre d'installation d'Android, par-dessus Chay ;
 *  - succès : rien à faire (Android ferme Chay, puis MiseAJourTermineeReceiver prévient) ;
 *  - échec ou annulation : l'app est prévenue (message affiché dans « À propos »).
 */
public class MiseAJourReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int statut = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (statut == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                : intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation == null) {
                ChayMiseAJourPlugin.signalerEchec("La fenêtre d'installation n'a pas pu s'ouvrir.");
                return;
            }
            confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(confirmation);
            } catch (Exception e) {
                ChayMiseAJourPlugin.signalerEchec("La fenêtre d'installation n'a pas pu s'ouvrir.");
            }
            return;
        }
        if (statut == PackageInstaller.STATUS_SUCCESS) return;
        if (statut == PackageInstaller.STATUS_FAILURE_ABORTED) {
            ChayMiseAJourPlugin.signalerEchec("Installation annulée.");
            return;
        }
        if (statut == PackageInstaller.STATUS_FAILURE_CONFLICT || statut == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) {
            ChayMiseAJourPlugin.signalerEchec("Cette version ne peut pas remplacer l'application installée.");
            return;
        }
        if (statut == PackageInstaller.STATUS_FAILURE_STORAGE) {
            ChayMiseAJourPlugin.signalerEchec("Pas assez de place sur le téléphone.");
            return;
        }
        ChayMiseAJourPlugin.signalerEchec("L'installation a échoué.");
    }
}
