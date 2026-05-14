import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { quizApiPlugin } from './server/quizApiPlugin.js';

export default defineConfig({
  plugins: [react(), quizApiPlugin()]
});
