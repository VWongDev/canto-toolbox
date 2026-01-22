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
        background: 'background.js',
        content: 'content.js',
        dictionaryLoader: 'dictionary-loader.js',
        stats: 'stats.html'
      }
    }
  },
  publicDir: false // We'll copy static assets manually via the plugin
});

