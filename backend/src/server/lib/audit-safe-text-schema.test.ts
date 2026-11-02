import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  CreatePamAccessRequestSchema,
  PamAccessRequestSchema
} from "@app/services/approval-policy/pam-access/pam-access-policy-schemas";

import { auditSafeText } from "./schemas";

// Tests the wiring, not the sanitizer. Drop the wrapper or flip the multiline flag and the sanitizer
// suite would still pass.

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

// Route schemas live inside server.route() calls, so there's nothing to import. Reading the source is
// how we catch a dropped wrapper.
describe("routes that feed audit metadata keep the wrapper", () => {
  const read = (relative: string) => readFileSync(path.join(__dirname, "../..", relative), "utf8");

  // Create routes only. Renames are checked in the identity services, and only when the name changes.
  test.each([
    "server/routes/v1/identity-router.ts",
    "server/routes/v1/org-identity-router.ts",
    "server/routes/v1/project-identity-router.ts"
  ])("%s wraps identity names and keeps them single-line", (file) => {
    const nameLines = read(file)
      .split("\n")
      .filter((line) => line.trimStart().startsWith("name: auditSafeText("));

    expect(nameLines.length).toBeGreaterThanOrEqual(1);
    nameLines.forEach((line) => {
      expect(line).toContain(".max(255)");
      expect(line).not.toContain("allowMultiline");
    });
  });

  test.each([
    ["ee/routes/v1/pam-routers/pam-account-router.ts", 1],
    ["ee/routes/v1/pam-routers/pam-session-router.ts", 2],
    ["ee/routes/v1/pam-routers/pam-access-request-router.ts", 1]
  ])("%s wraps its reason fields as multiline", (file, expected) => {
    const source = read(file);
    const wrapped = source.match(/reason: auditSafeText\(.*allowMultiline: true/g) ?? [];

    expect(wrapped.length).toBeGreaterThanOrEqual(expected);
  });
});

describe("PAM access requests on the generic approvals endpoint", () => {
  const requestData = (reason: string) => ({
    accountId: "00000000-0000-4000-8000-000000000001",
    folderId: "00000000-0000-4000-8000-000000000002",
    duration: "1h",
    reason
  });
  const createRequestData = CreatePamAccessRequestSchema.shape.requestData;

  test("create rejects unsafe reasons and keeps multiline ones", () => {
    expect(createRequestData.safeParse(requestData(`${ESC}[31mred`)).success).toBe(false);
    expect(createRequestData.safeParse(requestData(`x${String.fromCodePoint(0x202e)}y`)).success).toBe(false);
    expect(createRequestData.safeParse(requestData(`line one${LF}line two`)).success).toBe(true);
  });

  test("the response still parses a stored reason that predates the check", () => {
    const stored = PamAccessRequestSchema.shape.requestData.shape.requestData;
    expect(stored.safeParse(requestData(`${ESC}[31mred`)).success).toBe(true);
  });
});
