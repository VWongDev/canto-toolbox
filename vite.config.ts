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
        // TypeScript entry points
        background: 'src/scripts/background.ts',
        content: 'src/scripts/content.ts',
        dictionaryLoader: 'src/scripts/dictionary-loader.ts',
        stats: 'src/html/stats.html',
        'stats-script': 'src/scripts/stats.ts'
      }
    },
    copyPublicDir: false
  },
  publicDir: 'src/data' // Pre-processed dictionary files
});

