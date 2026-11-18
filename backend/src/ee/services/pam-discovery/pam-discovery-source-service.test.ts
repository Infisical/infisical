import {
  EntityNotFoundError,
  ExternalSystemError,
  RuleViolationError,
  StateConflictError
} from "@app/domains/lib/errors";

import { toResultMessage } from "./pam-discovery-source-service";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe("toResultMessage", () => {
  test("rule violations and missing entities keep their message", () => {
    expect(toResultMessage(new RuleViolationError({ message: "Key is disabled" }), "fallback", "log")).toBe(
      "Key is disabled"
    );
    expect(toResultMessage(new EntityNotFoundError({ message: "Key not found" }), "fallback", "log")).toBe(
      "Key not found"
    );
  });

  test("external failures and conflicts are replaced by the fallback", () => {
    expect(toResultMessage(new ExternalSystemError({ message: "HSM unreachable" }), "fallback", "log")).toBe(
      "fallback"
    );
    expect(toResultMessage(new StateConflictError({ message: "Key is being created" }), "fallback", "log")).toBe(
      "fallback"
    );
  });

  test("unknown errors are replaced by the fallback", () => {
    expect(toResultMessage(new Error("boom"), "fallback", "log")).toBe("fallback");
  });
});
