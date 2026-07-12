import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/** Paths that may import node:fs write APIs. */
const WRITE_DOOR = "src/server/services/write.ts";
/** Capability probe may write under os.tmpdir only — never project artefacts. */
const WATCH_PROBE = "src/server/watch/watcher.ts";
/** Server factory may mkdir empty `.hyperflow` / handoff scaffolds at boot. */
const SERVER_FACTORY = "src/server/index.ts";
const FS_WRITE_ALLOW = [WRITE_DOOR, WATCH_PROBE, SERVER_FACTORY];

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
      "playwright.config.ts",
      "scripts/**",
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
  // Server (except write door + watch probe): ban client + tests + fs writes
  {
    files: ["src/server/**/*.{ts,tsx}"],
    ignores: FS_WRITE_ALLOW,
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
  // Write door + watch probe: may use fs writes; still ban client/tests
  {
    files: FS_WRITE_ALLOW,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|[./])client([/]|$)",
              message: "Server fs-write modules must not import client.",
            },
            {
              regex: "(^|[./])tests([/]|$)|fixtures([/]|$)",
              message: "Server fs-write modules must not import tests.",
            },
          ],
        },
      ],
    },
  },
  // Shared: ban client/server, tests, fs writes
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FS_WRITE_PATHS,
          patterns: [
            {
              regex: "(^|[./])(client|server)([/]|$)",
              message: "shared/ must not import client or server sources.",
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
  // CLI may dynamic-import server factory; still ban client/tests/fs writes
  {
    files: ["src/cli/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FS_WRITE_PATHS,
          patterns: [
            {
              regex: "(^|[./])client([/]|$)",
              message: "cli/ must not import client sources.",
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
