import { defineConfig } from 'vitest/config';

// Tests de l'app (npm test). Le serveur a ses propres tests : cd server && npm test
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', 'dist/**', 'server/**', 'android/**', 'ios/**']
  }
});
