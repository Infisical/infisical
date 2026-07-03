import { describe, expect, it, vi } from "vitest";

// logger is initialized at app boot and is undefined under unit tests; stub it so the reject path
// surfaces the BadRequestError rather than a "logger is undefined" error.
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { isValidHandleBarTemplate, validateHandlebarTemplate } from "./validate-handlebars";

const allow = (expression: string) => expression.includes("identity");
const lenient = { allowedExpressions: allow }; // default: escaping not enforced (e.g. dynamic-secret callers)
const strict = { allowedExpressions: allow, rejectUnescaped: true }; // permission callers (role / additional-privilege)

describe("validateHandlebarTemplate", () => {
  it("accepts an escaped, allowed expression (strict and lenient)", () => {
    expect(() => validateHandlebarTemplate("test", "{{identity.id}}", strict)).not.toThrow();
    expect(() => validateHandlebarTemplate("test", "{{identity.id}}", lenient)).not.toThrow();
  });

  it("strict: rejects an unescaped triple-mustache expression even when the path is allowed", () => {
    expect(() => validateHandlebarTemplate("test", "{{{identity.id}}}", strict)).toThrow(
      /Template sanitization failed/
    );
  });

  it("strict: rejects the unescaped ampersand form ({{& }}) even when the path is allowed", () => {
    expect(() => validateHandlebarTemplate("test", "{{&identity.id}}", strict)).toThrow(/Template sanitization failed/);
  });

  it("lenient (default): allows an unescaped expression, preserving behavior for non-permission callers", () => {
    expect(() => validateHandlebarTemplate("test", "{{{identity.id}}}", lenient)).not.toThrow();
  });

  it("rejects a disallowed expression regardless of mode", () => {
    expect(() => validateHandlebarTemplate("test", "{{secret.value}}", strict)).toThrow(/Template sanitization failed/);
  });
});

describe("isValidHandleBarTemplate", () => {
  it("returns true for an escaped, allowed expression", () => {
    expect(isValidHandleBarTemplate("{{identity.id}}", strict)).toBe(true);
  });

  it("strict: returns false for an unescaped triple-mustache expression even when the path is allowed", () => {
    expect(isValidHandleBarTemplate("{{{identity.id}}}", strict)).toBe(false);
  });

  it("lenient (default): returns true for an unescaped expression with an allowed path", () => {
    expect(isValidHandleBarTemplate("{{{identity.id}}}", lenient)).toBe(true);
  });
});
