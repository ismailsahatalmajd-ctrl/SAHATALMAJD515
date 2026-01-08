export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "release_new/**",
      "dist/**"
    ],
  },
  {
    files: ["**/*.{js,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "off",
    },
  },
];
