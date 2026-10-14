import js from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";

export default [
  // design/ holds throwaway HTML mocks, and dist/ holds the built release zip. The site folder has
  // its own packages and SST output, and its public/ holds copies made by the site's npm run assets.
  {
    ignores: [
      "design/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "site/node_modules/**",
      "site/public/**",
      "site/.sst/**",
      "site/.wrangler/**",
    ],
  },
  {
    files: ["**/*.{js,mjs}"],
    plugins: { jsdoc, sonarjs, unicorn },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      ...js.configs.recommended.rules,
      camelcase: "error",
      complexity: ["error", 15],
      eqeqeq: "error",
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "no-else-return": ["error", { allowElseIf: false }],
      "no-lonely-if": "error",
      // Rule 5 asks for brackets only where the order is not obvious. Arithmetic in a formula
      // reads in the usual order, so only bitwise, comparison and logic mixes are flagged.
      "no-mixed-operators": [
        "error",
        {
          groups: [
            ["&", "|", "^", "~", "<<", ">>", ">>>"],
            ["&&", "||"],
            ["==", "!=", "===", "!==", ">", ">=", "<", "<="],
            ["in", "instanceof"],
          ],
        },
      ],
      "no-negated-condition": "error",
      "no-nested-ternary": "error",
      "no-unneeded-ternary": "error",
      "one-var": ["error", "never"],
      "prefer-const": "error",
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      // Reads "Db" as "Database" and renames decibel names. That fights rule 5.
      "unicorn/name-replacements": "off",
      "unicorn/numeric-separators-style": "error",
      // Rule 10. Every export has a JSDoc block, and a block holds types alone, with no prose.
      "jsdoc/require-jsdoc": ["error", { publicOnly: true, require: { FunctionDeclaration: true } }],
      "jsdoc/require-param": ["error", { checkDestructured: false }],
      "jsdoc/require-param-type": "error",
      "jsdoc/check-param-names": ["error", { checkDestructured: false }],
      "jsdoc/require-returns": ["error", { forceReturnsWithAsync: false }],
      "jsdoc/require-returns-type": "error",
      "jsdoc/require-returns-check": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/valid-types": "error",
      "jsdoc/no-undefined-types": "error",
      "jsdoc/no-restricted-syntax": [
        "error",
        {
          contexts: [
            {
              comment: "JsdocBlock[description!=/^$/]",
              message: "A JSDoc block holds types only. Put the reason in a line comment above it.",
            },
            {
              comment: "JsdocBlock:has(JsdocTag[description!=/^$/])",
              message: "A JSDoc tag holds a type and a name only, with no description.",
            },
            {
              comment: "JsdocBlock:has(JsdocTag[tag!=/^(param|returns|typedef|property|type)$/])",
              message: "A JSDoc block uses @param, @returns, @typedef, @property and @type only.",
            },
          ],
        },
      ],
    },
  },
  {
    // Everything outside src/ runs in Node. The extension code must not reach for process or Buffer.
    files: ["**/*.{js,mjs}"],
    ignores: ["src/**"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // The journeys and the store script drive the extension in a browser, so their evaluate
    // callbacks name chrome and document.
    files: ["tests/**/*.js", "scripts/make-store-images.mjs"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
];
