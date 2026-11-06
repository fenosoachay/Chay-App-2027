// Point d'entrée de la couche d'adaptation : crée un client exposant la même
// interface que le client Base44, mais adossé à PocketBase.
// Utilisé par src/api/base44Client.js uniquement quand VITE_BACKEND=pocketbase.
// Documentation : docs/MIGRATION-ADAPTER.md

import PocketBase, { LocalAuthStore } from 'pocketbase';
import { PB_AUTH_STORAGE_KEY, PB_URL } from './backendConfig';
import { createPocketBaseAdapter } from './pocketbase/adapter';

export { BACKEND, IS_POCKETBASE } from './backendConfig';

export function createPocketBaseBackend({ url = PB_URL } = {}) {
  const pb = new PocketBase(url, new LocalAuthStore(PB_AUTH_STORAGE_KEY));
  // Base44 n'annulait pas les requêtes identiques simultanées : on désactive
  // l'annulation automatique du SDK PocketBase pour garder ce comportement.
  pb.autoCancellation(false);
  return createPocketBaseAdapter(pb, { baseUrl: url });
}
