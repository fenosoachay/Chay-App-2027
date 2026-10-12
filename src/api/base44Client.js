import { createClient } from '@base44/sdk';
import { Capacitor } from '@capacitor/core';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Dans l'APK, l'interface est chargée localement (https://localhost) : les
// appels API ne peuvent plus viser « la même origine » et doivent partir vers
// le serveur publié. Sur le web, on garde l'origine courante.
export const REMOTE_APP_URL = 'https://chay.base44.app';
const isNative = Capacitor.isNativePlatform();

export const base44 = createClient({
  appId,
  token,
  analytics: { enabled: false },
  functionsVersion,
  serverUrl: isNative ? REMOTE_APP_URL : '',
  appBaseUrl: isNative ? REMOTE_APP_URL : appBaseUrl
});