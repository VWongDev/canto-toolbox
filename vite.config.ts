import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  base: './', // Use relative paths for Chrome extension
  css: {
    preprocessorOptions: {
      // Vite 5 still drives Sass through the legacy JS API, which Dart Sass
      // deprecated and removes in 2.0. The modern compiler is already bundled;
      // opting in now silences the warning and is what Vite 6 defaults to.
      scss: { api: 'modern-compiler' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // TypeScript entry points
        background: 'src/service-worker.ts',
        content: 'src/popup/content.ts',
        stats: 'src/stats/stats.html',
        'stats-script': 'src/stats/stats.ts',
        flashcards: 'src/flashcards/flashcards.html',
        'flashcards-script': 'src/flashcards/flashcards.ts'
      },
    },
  },
  publicDir: 'public'
});

