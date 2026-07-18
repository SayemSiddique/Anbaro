import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    rules: {
      // These screens intentionally load remote state from effects. The React
      // Compiler rule treats the async request's state updates as synchronous.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
]);
