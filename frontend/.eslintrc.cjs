module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      files: ["src/test/**"],
      rules: {
        "react-refresh/only-export-components": "off",
      },
    },
    {
      // BoardUI-installed components (mcp__boardui__install_components) —
      // vendored source we keep upstream-syncable rather than hand-editing
      // for lint nits.
      files: ["src/components/**"],
      rules: {
        "react-refresh/only-export-components": "off",
      },
    },
  ],
};
