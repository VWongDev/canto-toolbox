import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  base: './', // Use relative paths for Chrome extension
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Entry points - crx plugin will handle manifest and file copying
        background: 'src/scripts/background.js',
        content: 'src/scripts/content.js',
        dictionaryLoader: 'src/scripts/dictionary-loader.js',
        stats: 'src/html/stats.html',
        'stats-script': 'src/scripts/stats.js'
      }
    },
    copyPublicDir: false
  },
  publicDir: 'src/data' // Pre-processed dictionary files
});

