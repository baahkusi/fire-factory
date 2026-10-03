module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.test.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*",
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    "new-cap": ["error", {"capIsNewExceptions": ["Router"]}],
    "max-len": ["error", {"code": 100, "ignoreUrls": true, "ignoreStrings": true}],
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
  },
};
