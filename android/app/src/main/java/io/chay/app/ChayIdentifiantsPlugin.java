package io.chay.app;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPasswordOption;
import androidx.credentials.PasswordCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

/**
 * 1.4.0 : e-mail et mot de passe de l'appli gardés dans le Gestionnaire de mots de passe Google
 * (Gestionnaire d'identifiants d'Android). Après « Effacer le stockage », une réinstallation ou un nouveau
 * téléphone, le membre se reconnecte en un toucher au lieu de tout retaper.
 *  - recuperer() : la fenêtre d'Android propose les comptes enregistrés ; { trouve, identifiant, motDePasse }.
 *  - enregistrer({ identifiant, motDePasse }) : Android propose « Enregistrer le mot de passe ? ».
 * Rien n'est gardé par l'appli elle-même : tout reste chez Google, protégé par le verrouillage du téléphone.
 */
@CapacitorPlugin(name = "ChayIdentifiants")
public class ChayIdentifiantsPlugin extends Plugin {

    private Executor principal() {
        return ContextCompat.getMainExecutor(getContext());
    }

    @PluginMethod
    public void recuperer(PluginCall call) {
        GetCredentialRequest demande = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetPasswordOption())
            .build();
        try {
            CredentialManager.create(getContext()).getCredentialAsync(getActivity(), demande, new CancellationSignal(), principal(),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse reponse) {
                        JSObject r = new JSObject();
                        Credential c = reponse.getCredential();
                        if (c instanceof PasswordCredential) {
                            r.put("trouve", true);
                            r.put("identifiant", ((PasswordCredential) c).getId());
                            r.put("motDePasse", ((PasswordCredential) c).getPassword());
                        } else {
                            r.put("trouve", false);
                        }
                        call.resolve(r);
                    }

                    @Override
                    public void onError(GetCredentialException erreur) {
                        // Aucun compte enregistré, fenêtre fermée par le membre… : on continue sans rien remplir.
                        JSObject r = new JSObject();
                        r.put("trouve", false);
                        r.put("raison", erreur.getType());
                        call.resolve(r);
                    }
                });
        } catch (RuntimeException erreur) {
            JSObject r = new JSObject();
            r.put("trouve", false);
            r.put("raison", "indisponible");
            call.resolve(r);
        }
    }

    @PluginMethod
    public void enregistrer(PluginCall call) {
        String identifiant = call.getString("identifiant", "");
        String motDePasse = call.getString("motDePasse", "");
        if (identifiant == null || identifiant.trim().isEmpty() || motDePasse == null || motDePasse.isEmpty()) {
            call.reject("Identifiant ou mot de passe manquant.");
            return;
        }
        try {
            CredentialManager.create(getContext()).createCredentialAsync(getActivity(), new CreatePasswordRequest(identifiant.trim(), motDePasse),
                new CancellationSignal(), principal(),
                new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                    @Override
                    public void onResult(CreateCredentialResponse reponse) {
                        JSObject r = new JSObject();
                        r.put("enregistre", true);
                        call.resolve(r);
                    }

                    @Override
                    public void onError(CreateCredentialException erreur) {
                        JSObject r = new JSObject();
                        r.put("enregistre", false);
                        r.put("raison", erreur.getType());
                        call.resolve(r);
                    }
                });
        } catch (RuntimeException erreur) {
            JSObject r = new JSObject();
            r.put("enregistre", false);
            r.put("raison", "indisponible");
            call.resolve(r);
        }
    }
}
