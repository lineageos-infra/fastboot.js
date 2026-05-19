// @ts-check

import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default defineConfig(
    js.configs.recommended,
    tseslint.configs.recommended,
    prettierConfig,
    globalIgnores(["dist/", "demo/"]),
);
