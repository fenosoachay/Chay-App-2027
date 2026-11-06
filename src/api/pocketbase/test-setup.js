// Garde-fou des tests : tout appel réseau réel fait échouer le test.
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('Appel réseau interdit dans les tests unitaires');
  });
});
