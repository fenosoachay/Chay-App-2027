import { createClient } from '@base44/sdk';
import { Capacitor } from '@capacitor/core';
import { appParams } from '@/lib/app-params';
import { IS_POCKETBASE, createPocketBaseBackend } from '@/api/backend';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Dans l'APK, l'interface est chargée localement (https://localhost) : les
// appels API ne peuvent plus viser « la même origine » et doivent partir vers
// le serveur publié. Sur le web, on garde l'origine courante.
export const REMOTE_APP_URL = 'https://chay.base44.app';
const isNative = Capacitor.isNativePlatform();

// VITE_BACKEND=pocketbase : couche d'adaptation (même interface). Sinon, client
// Base44 d'origine, créé exactement comme avant.
export const base44 = IS_POCKETBASE ? createPocketBaseBackend() : createClient({
  appId,
  token,
  analytics: { enabled: false },
  functionsVersion,
  serverUrl: isNative ? REMOTE_APP_URL : '',
  appBaseUrl: isNative ? REMOTE_APP_URL : appBaseUrl
});