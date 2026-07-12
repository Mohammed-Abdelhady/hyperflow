import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { E2E } from "./env.js";

/** Absolute path inside the per-run fixture project copy. */
export function fixturePath(...parts: string[]): string {
  return join(E2E.projectRoot, ...parts);
}

export function readFixture(...parts: string[]): string {
  return readFileSync(fixturePath(...parts), "utf8");
}

export function writeFixture(relParts: string[], contents: string): void {
  writeFileSync(fixturePath(...relParts), contents, "utf8");
}

export function appendFixture(relParts: string[], chunk: string): void {
  appendFileSync(fixturePath(...relParts), chunk, "utf8");
}

export function fixtureExists(...parts: string[]): boolean {
  return existsSync(fixturePath(...parts));
}

export function listDir(...parts: string[]): string[] {
  const abs = fixturePath(...parts);
  if (!existsSync(abs)) return [];
  return readdirSync(abs);
}

/** Global config path used by the e2e webServer (HOME override). */
export function globalConfigPath(): string {
  return join(E2E.homeRoot, ".hyperflow", "config.json");
}

export function readGlobalConfig(): string {
  return readFileSync(globalConfigPath(), "utf8");
}

export function writeGlobalConfig(contents: string): void {
  writeFileSync(globalConfigPath(), contents, "utf8");
}
