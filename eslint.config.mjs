import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts print one-time credentials and progress to the operator's terminal.
    files: ["scripts/**", "tests/**", "load/**"],
    rules: { "no-console": "off" },
  },
  {
    // Client code must never import server modules.
    files: ["src/components/ui/**", "src/components/exam/**", "src/components/admin/**", "src/components/math-text.tsx", "src/components/preferences.tsx", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/*"], message: "Client code must not import server modules." }] }],
    },
  },
  {
    // Separation of concerns: pages and route handlers call service modules, never the database client.
    files: ["src/app/**"],
    rules: { "no-restricted-imports": ["error", { paths: [{ name: "@/server/db", message: "Call a service in src/server/<module> instead of querying from a page or route." }] }] },
  },
  // load/** runs in the k6 runtime (not Node/browser); it is reviewed separately.
  { ignores: ["load/**", ".next/**", "node_modules/**", "src/generated/**", ".local-pg/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
];

export default config;
