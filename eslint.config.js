const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['decoder.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['popup.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        decodeChain: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];
