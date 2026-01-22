import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Entry points - crx plugin will handle manifest and file copying
        background: 'src/scripts/background.js',
        content: 'src/scripts/content.js',
        dictionaryLoader: 'src/scripts/dictionary-loader.js',
        stats: 'src/html/stats.html'
      }
    }
  },
  publicDir: false // We'll copy static assets manually via the plugin
});

