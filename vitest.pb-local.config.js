import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests de bout en bout contre le BAC À SABLE LOCAL (127.0.0.1 uniquement) :
//   npx vitest run --config vitest.pb-local.config.js
// Le vrai adaptateur et le vrai SDK PocketBase sont utilisés ; toute requête
// vers une autre machine est bloquée (pocketbase/tests/local-only-fetch.js).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['pocketbase/tests/**/*.local.test.js'],
    environment: 'node',
    setupFiles: ['pocketbase/tests/local-only-fetch.js'],
    testTimeout: 30000,
  },
});
