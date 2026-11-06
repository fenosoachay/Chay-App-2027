import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Configuration dédiée aux tests unitaires de la couche d'adaptation :
// sans le plugin Base44 de vite.config.js, et sans aucun accès réseau.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/api/**/*.test.js'],
    environment: 'node',
    setupFiles: ['src/api/pocketbase/test-setup.js'],
  },
});
