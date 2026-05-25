import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { quizApiPlugin } from './server/quizApiPlugin.js';

export default defineConfig({
  base: '/game/quiz-dash/dist/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [react(), quizApiPlugin()]
});
