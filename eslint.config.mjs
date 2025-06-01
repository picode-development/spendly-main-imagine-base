import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Add your custom rule overrides here
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // Disable unused vars warning
      "@typescript-eslint/no-explicit-any": "off", // Disable explicit any warning
      
      // Optional: You could make them warnings instead of completely disabling
      // "@typescript-eslint/no-unused-vars": ["warn", { 
      //   "argsIgnorePattern": "^_",
      //   "varsIgnorePattern": "^_",
      //   "caughtErrorsIgnorePattern": "^_"
      // }],
      // "@typescript-eslint/no-explicit-any": "warn"
    }
  }
];

export default eslintConfig;