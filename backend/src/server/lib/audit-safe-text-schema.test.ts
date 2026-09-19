import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import { auditSafeText } from "./schemas";

// Guards the composition rather than the sanitizer. The route schemas are the only reason the
// boundary check runs at all, so a refactor that drops the wrapper or flips the multiline flag
// would leave the sanitizer's own suite green.

const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(0x1b);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);

const nameSchema = auditSafeText(z.string().trim());
const reasonSchema = auditSafeText(z.string().trim().max(500), { allowMultiline: true });

describe("auditSafeText composition", () => {
  test("a single-line field rejects line breaks", () => {
    expect(nameSchema.safeParse(`probe${LF}name`).success).toBe(false);
    expect(nameSchema.safeParse(`probe${CR}name`).success).toBe(false);
    expect(nameSchema.safeParse(`probe${TAB}name`).success).toBe(false);
  });

  test("a multiline field accepts LF, CR and tab", () => {
    expect(reasonSchema.safeParse(`line one${LF}line two`).success).toBe(true);
    expect(reasonSchema.safeParse(`line one${CR}${LF}line two`).success).toBe(true);
    expect(reasonSchema.safeParse(`a${TAB}b`).success).toBe(true);
  });

  test("both reject the rest of the unsafe set", () => {
    [nameSchema, reasonSchema].forEach((schema) => {
      expect(schema.safeParse(`a${NUL}b`).success).toBe(false);
      expect(schema.safeParse(`${ESC}[31mred`).success).toBe(false);
      expect(schema.safeParse(`x${String.fromCodePoint(0x202e)}y`).success).toBe(false);
      expect(schema.safeParse(`x${String.fromCodePoint(0x200b)}y`).success).toBe(false);
      expect(schema.safeParse(`x${String.fromCodePoint(0x2060)}y`).success).toBe(false);
    });
  });

  test("both accept ordinary text, including emoji and Arabic script", () => {
    [nameSchema, reasonSchema].forEach((schema) => {
      expect(schema.safeParse("deploy bot 7").success).toBe(true);
      expect(schema.safeParse("deploy \u{1F3F3}️‍\u{1F308} bot").success).toBe(true);
      expect(schema.safeParse("می‌شود").success).toBe(true);
    });
  });

  test("the wrapper keeps the constraints of the schema it wraps", () => {
    expect(reasonSchema.safeParse("x".repeat(501)).success).toBe(false);
    expect(reasonSchema.parse("  padded  ")).toBe("padded");
  });
});

// The route bodies are registered inside server.route() calls, so there is no exported schema to
// import. Reading the source is what catches the wrapper being dropped from a field.
describe("routes that feed audit metadata keep the wrapper", () => {
  const read = (relative: string) => readFileSync(path.join(__dirname, "../..", relative), "utf8");

  test("identity names are wrapped and stay single-line", () => {
    const source = read("server/routes/v1/identity-router.ts");
    const wrapped = source.match(/name: auditSafeText\(/g) ?? [];

    expect(wrapped).toHaveLength(2); // create and update
    expect(source).not.toMatch(/name: auditSafeText\([^)]*\), \{ allowMultiline: true \}/);
  });

  test.each([
    ["ee/routes/v1/pam-routers/pam-account-router.ts", 1],
    ["ee/routes/v1/pam-routers/pam-session-router.ts", 2],
    ["ee/routes/v1/pam-routers/pam-access-request-router.ts", 1]
  ])("%s wraps its reason fields as multiline", (file, expected) => {
    const source = read(file);
    const reasonFields = source.match(/reason: /g) ?? [];
    const wrapped = source.match(/reason: auditSafeText\(.*allowMultiline: true/g) ?? [];

    expect(wrapped).toHaveLength(expected);
    // Every request-body `reason:` on these routers goes through the wrapper.
    expect(reasonFields.length).toBeGreaterThanOrEqual(wrapped.length);
  });
});
