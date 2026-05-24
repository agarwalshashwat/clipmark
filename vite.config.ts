import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './extension/manifest.json';

export default defineConfig({
  root: 'extension',
  plugins: [crx({ manifest })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: 'src/pages/dashboard.html',
        popup: 'src/pages/popup.html',
        'side-panel': 'src/pages/side-panel.html',
      },
    },
  },
});
