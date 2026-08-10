import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/', 'target/', 'src-tauri/', 'node_modules/', 'coverage/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'react-hooks/exhaustive-deps': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Layer boundaries from ARCHITECTURE.md, enforced rather than documented.
    // Views render; anything that talks to the backend goes through a hook or a store.
    files: ['src/views/**/*.{ts,tsx}', 'src/App.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services', '**/services/*'],
              message:
                'Views must not import services. Go through a store or a hook (see ARCHITECTURE.md).',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                'Views must not call the backend directly. Put it in a service and reach it through a hook or store.',
            },
          ],
        },
      ],
    },
  },
  {
    // Domain stays framework-free and dependency-free.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services', '**/services/*', '**/stores', '**/stores/*', '**/views/*', '**/hooks/*', '@tauri-apps/*', 'react', 'zustand'],
              message: 'Domain must stay pure: no services, stores, views, hooks or frameworks.',
            },
          ],
        },
      ],
    },
  },
  {
    // Services may reach the backend but must not know about state or UI.
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/stores', '**/stores/*', '**/views/*', '**/hooks/*'],
              message: 'Services must not depend on stores, views or hooks.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.config.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
