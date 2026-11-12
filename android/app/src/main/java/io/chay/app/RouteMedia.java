package io.chay.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Toucher la notification de lecture : l'app s'ouvre (fermée ou non) sur l'écran du titre en cours
 * (route de l'app, ex. /media?cat=music&playlist=…&track=…), transmise à l'app par ChayConversationPlugin
 * (évènement « ouvrir »).
 */
final class RouteMedia {
    static final String EXTRA = "chay_route";
    static final String ACTION = "io.chay.app.OUVRIR_MEDIA";
    private static final int CODE = 7301;

    private RouteMedia() {}

    /** Chemin interne de l'app seulement (jamais d'adresse externe). */
    static boolean valide(String route) {
        return route != null && route.length() <= 200 && !route.startsWith("//")
            && route.matches("/[A-Za-z0-9\\-._~/?=&%]*");
    }

    static PendingIntent intention(Context ctx, String route) {
        Intent i = new Intent(ctx, MainActivity.class)
            .setAction(ACTION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (valide(route)) i.putExtra(EXTRA, route);
        int immuable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        return PendingIntent.getActivity(ctx, CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | immuable);
    }
}
