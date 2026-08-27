import js from "@eslint/js";
import globals from "globals";
import config from "eslint-config-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig(
  [config, eslintConfigPrettier],
  globalIgnores(["dist"]),
  {
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
);
