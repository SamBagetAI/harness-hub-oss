import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pages, forms and the connector ask the store (src/lib/hub/), never the database. The health check is the one
  // exception: it only asks whether the database answers. See "Store" in docs/how-it-works.md.
  {
    files: ["src/app/**", "src/components/**"],
    ignores: ["src/app/api/health/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@neondatabase/serverless", message: "Pages, forms and the connector go through the store in src/lib/hub/, never to the database." }],
          patterns: [{ group: ["@/lib/hub/db", "**/lib/hub/db", "**/lib/hub/db.ts"], message: "Pages, forms and the connector go through the store in src/lib/hub/ (read.ts, harnesses.ts, runs.ts…), never to db.ts." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
