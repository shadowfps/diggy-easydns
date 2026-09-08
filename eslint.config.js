// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/**
 * ESLint 9 Flat Config.
 *
 * `npm run lint` war vorher ein Skript ohne Konfiguration und schlug fehl.
 * Besonders wertvoll hier: die react-hooks-Regeln. Der Code hat mehrere
 * handgeschriebene Effects mit Sequenz-Guards (useProgressiveLookup), wo
 * fehlende Dependencies subtil brechen — und mehrere
 * `eslint-disable-next-line react-hooks/exhaustive-deps`-Marker, deren Regel
 * bisher gar nicht lief.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-server/**', 'node_modules/**', '*.tsbuildinfo'],
  },

  // ── Gemeinsame TS-Basis ──────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Ungenutzte Argumente mit _-Prefix sind Absicht (Express-Handler etc.).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Leere catch-Blöcke sind hier ein bewusstes Muster ("Fehler ignorieren,
      // Default nehmen") und durchgehend kommentiert.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // ── Frontend ─────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ── Backend / geteilter Code ─────────────────────────────────────────────
  {
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // ── Tests ────────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // ── Config-Dateien ───────────────────────────────────────────────────────
  {
    files: ['*.config.{js,ts}', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  }
);
