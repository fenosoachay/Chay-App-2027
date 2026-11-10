# Signature de l'APK release (Android)

L'APK publié sur `https://membres.chay.fr/telechargements/chay.apk` est **signé avec une clé de l'église**, et non avec la clé de debug d'Android Studio.

- `android/app/build.gradle` lit la configuration dans **`C:\Secrets-Chay\keystore.properties`**, hors du dépôt. Un autre chemin peut être donné par la variable `CHAY_KEYSTORE_PROPERTIES`.
- Sans ce fichier, ou s'il est incomplet, **toute construction release s'arrête** : il n'y a jamais d'APK release non signé.
- `pocketbase/scripts/publier-apk.mjs` refuse un APK non signé ou signé avec la clé de debug.

⚠️ **Cette clé doit être gardée pour toujours.** Android n'installe une mise à jour que si elle est signée avec **la même clé**. Si elle est perdue, chaque membre devra désinstaller l'application, puis réinstaller la nouvelle.

La première version signée avec cette clé (1.3) succède à des APK signés en debug. Les membres devront donc désinstaller l'ancienne application **une fois**. C'est la phrase « Si Android refuse l'installation… » de l'e-mail et de la page « À propos ».

## 1. Créer la keystore (une seule fois, par vous)

🪟 **PC**, PowerShell. Les mots de passe sont saisis **uniquement par vous**, à l'invite de `keytool` ; ils ne s'affichent pas.

```powershell
$kt = "C:\Program Files\Eclipse Adoptium\jdk-17.0.21.9-hotspot\bin\keytool.exe"
```
```powershell
& $kt -genkeypair -v -keystore C:\Secrets-Chay\chay-release.jks -storetype PKCS12 -alias chay -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Eglise Chay, O=Eglise Chay, C=FR"
```

- `keytool` demande le mot de passe deux fois.
- Avec le format PKCS12, le mot de passe de la clé est le **même** que celui de la keystore.
- Choisissez un mot de passe long, avec des **caractères ASCII seulement** (sans accents), et notez-le dans votre gestionnaire de mots de passe.

## 2. Écrire `keystore.properties`

```powershell
notepad C:\Secrets-Chay\keystore.properties
```

Contenu : 4 lignes. Remplacez les deux `<…>` par le mot de passe choisi, puis enregistrez.
```
storeFile=C:/Secrets-Chay/chay-release.jks
storePassword=<mot de passe>
keyAlias=chay
keyPassword=<le même mot de passe>
```

- **Barres obliques `/`** dans `storeFile` : dans un fichier `.properties`, la barre oblique inverse `\` est un caractère d'échappement.
- Pas de guillemets, pas d'espaces autour du `=`.
- Ce fichier n'est jamais dans git : `keystore.properties`, `*.jks` et `*.keystore` sont ignorés.

## 3. Sauvegarder (indispensable)

Copiez `C:\Secrets-Chay\chay-release.jks` et `C:\Secrets-Chay\keystore.properties` sur **deux supports chiffrés** (par exemple une clé USB BitLocker et le gestionnaire de mots de passe), dont un hors du PC.

```powershell
Copy-Item C:\Secrets-Chay\chay-release.jks, C:\Secrets-Chay\keystore.properties -Destination E:\Sauvegarde-cle-Chay\
```
(`E:` = la clé USB chiffrée.)

## 4. Relever l'empreinte SHA-256

L'empreinte d'un certificat est **publique** : ce n'est pas un secret.

```powershell
& $kt -exportcert -rfc -keystore C:\Secrets-Chay\chay-release.jks -alias chay -file C:\Secrets-Chay\chay-release-certificat.pem
```
`keytool` demande le mot de passe.
```powershell
& $kt -printcert -file C:\Secrets-Chay\chay-release-certificat.pem
```

Relevez la ligne `SHA256:` :
- **Firebase** : Paramètres du projet → application Android `io.chay.app` → **Ajouter une empreinte** → collez la SHA-256 (et la SHA-1 si vous voulez). Ce n'est pas obligatoire pour les notifications push, mais utile pour les autres services Google. Il n'est pas nécessaire de retélécharger `google-services.json`.
- **Google Play** (plus tard) : avec la signature d'application Play, Google demandera la clé d'importation ; gardez cette empreinte pour la comparer.

## 5. Construire l'APK release signé

Voir le récapitulatif de `docs/CADDY-APP.md` (« Téléchargements ») et la procédure de publication : construction web, `npx cap sync android`, puis :

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.21.9-hotspot"
```
```powershell
cd "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration\android"
```
```powershell
.\gradlew.bat --no-daemon assembleRelease
```

L'APK est créé ici : `android\app\build\outputs\apk\release\app-release.apk` (version 1.3, code 4).

Vérifié le 10 novembre 2026 avec une keystore de test jetable :
- la construction s'arrête sans fichier de signature ;
- l'APK release est signé (v1 + v2, vérifié par `apksigner`) et n'est pas « debuggable » (`aapt`) ;
- il vise `https://api.chay.fr`.
