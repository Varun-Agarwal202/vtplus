// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.agents/*', 'node_modules/*', '.expo/*', 'scripts/*', 'src/dsp/__tests__/fixtures/*', 'supabase/functions/**'],
  },
]);
