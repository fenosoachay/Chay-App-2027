package io.chay.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidExternalLink")
public class ExternalLinkPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        Uri uri = url == null ? null : Uri.parse(url);
        String scheme = uri == null ? null : uri.getScheme();
        if (uri == null || uri.getHost() == null ||
            !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            call.reject("L’URL du lien externe est invalide.");
            return;
        }

        getActivity().runOnUiThread(() ->
            new AlertDialog.Builder(getActivity())
                .setTitle(R.string.external_link_confirmation_title)
               .setMessage(getContext().getString(R.string.external_link_confirmation_message, uri.getHost()))
                .setNegativeButton(R.string.external_link_confirmation_cancel, (dialog, which) -> call.resolve())
                .setPositiveButton(R.string.external_link_confirmation_open, (dialog, which) -> {
                    try {
                        getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        call.resolve();
                    } catch (ActivityNotFoundException error) {
                        call.reject("Aucune application ne peut ouvrir ce lien.", error);
                    }
                })
                .setOnCancelListener(dialog -> call.resolve())
                .show()
        );
    }
}
