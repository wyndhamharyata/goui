import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";

export default [
  { ignores: ["node_modules/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["**/*.{js,mjs}"],
    plugins: { sonarjs, unicorn },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
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
      // Only the orders that are hard to read: bitwise, comparison and logic.
      // Arithmetic in a formula stays free, per rule 5's revised wording.
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
