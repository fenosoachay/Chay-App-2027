import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Force a single React/ReactDOM instance across the dep graph. Without
  // this, Vite's dep optimizer can bundle react and react-dom separately,
  // giving two ReactCurrentDispatcher copies — hooks then throw
  // "dispatcher is null" (seen on <Link> via useContext).
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: command === 'serve',
      navigationNotifier: command === 'serve',
      analyticsTracker: command === 'serve',
      visualEditAgent: command === 'serve'
    }),
    react(),
  ]
}));