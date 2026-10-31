import js from "@eslint/js";
import globals from "globals";

export default [
  // Vendor libs (moment) — không lint
  { ignores: ["node_modules/**", "scripts/lib/**", "coverage/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // moment được load qua <script> vendor (scripts/lib/moment.min.js)
    files: ["scripts/**"],
    languageOptions: { globals: { moment: "readonly" } },
  },
];
