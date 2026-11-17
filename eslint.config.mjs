import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-lh/**",
    ".next-live/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    ".agents/**",
    ".claude/**",
    "test-results/**",
    "playwright-report/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
