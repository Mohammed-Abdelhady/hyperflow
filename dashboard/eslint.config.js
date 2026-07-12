import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/** Paths that may import node:fs write APIs — exactly one write door. */
const WRITE_DOOR = "src/server/services/write.ts";

const FS_WRITE_NAMES = [
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "unlink",
  "unlinkSync",
  "mkdir",
  "mkdirSync",
  "rmdir",
  "rmdirSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "truncate",
  "truncateSync",
  "createWriteStream",
];

const FS_WRITE_PATHS = [
  {
    name: "node:fs",
    importNames: FS_WRITE_NAMES,
    message:
      "Direct fs writes are banned. Use the single write door: src/server/services/write.ts.",
  },
  {
    name: "fs",
    importNames: FS_WRITE_NAMES,
    message:
      "Direct fs writes are banned. Use the single write door: src/server/services/write.ts.",
  },
  {
    name: "node:fs/promises",
    importNames: FS_WRITE_NAMES,
    message:
      "Direct fs writes are banned. Use the single write door: src/server/services/write.ts.",
  },
  {
    name: "fs/promises",
    importNames: FS_WRITE_NAMES,
    message:
      "Direct fs writes are banned. Use the single write door: src/server/services/write.ts.",
  },
];

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "eslint.config.js",
      "vite.config.ts",
      "vitest.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: false, skipComments: false },
      ],
    },
  },
  // Client: ban server + tests + fs writes
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FS_WRITE_PATHS,
          patterns: [
            {
              regex: "(^|[./])server([/]|$)",
              message:
                "Client may not import server. Cross-layer contact is HTTP + SSE only.",
            },
            {
              regex: "(^|[./])tests([/]|$)|fixtures([/]|$)",
              message: "Production source must not import tests or fixtures.",
            },
          ],
        },
      ],
    },
  },
  // Server (except write door): ban client + tests + fs writes
  {
    files: ["src/server/**/*.{ts,tsx}"],
    ignores: [WRITE_DOOR],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FS_WRITE_PATHS,
          patterns: [
            {
              regex: "(^|[./])client([/]|$)",
              message:
                "Server may not import client. Cross-layer contact is HTTP + SSE only.",
            },
            {
              regex: "(^|[./])tests([/]|$)|fixtures([/]|$)",
              message: "Production source must not import tests or fixtures.",
            },
          ],
        },
      ],
    },
  },
  // Write door: may use fs writes; still ban client/tests
  {
    files: [WRITE_DOOR],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|[./])client([/]|$)",
              message: "Write door must not import client.",
            },
            {
              regex: "(^|[./])tests([/]|$)|fixtures([/]|$)",
              message: "Write door must not import tests.",
            },
          ],
        },
      ],
    },
  },
  // Shared + cli: ban client/server cross imports from shared, ban tests, ban fs writes
  {
    files: ["src/shared/**/*.{ts,tsx}", "src/cli/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FS_WRITE_PATHS,
          patterns: [
            {
              regex: "(^|[./])(client|server)([/]|$)",
              message:
                "shared/ and cli/ must not import client or server sources.",
            },
            {
              regex: "(^|[./])tests([/]|$)|fixtures([/]|$)",
              message: "Production source must not import tests or fixtures.",
            },
          ],
        },
      ],
    },
  },
);
