import { createRequire } from "module"

const require = createRequire(import.meta.url)
/** @type {import("eslint").Linter.Config[]} */
const nextConfig = require("eslint-config-next")

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".firebase/**", "*.tsbuildinfo", "dist/**", "coverage/**"],
  },
  {
    files: ["scripts/**/*.{js,mjs,ts}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["app/page.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]

export default eslintConfig
