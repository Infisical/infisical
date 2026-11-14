import { EntityNotFoundError, ExternalSystemError, RuleViolationError } from "@app/domains/lib/errors";

import { toResultMessage } from "./pam-discovery-source-service";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe("toResultMessage", () => {
  test("domain errors keep their message", () => {
    expect(toResultMessage(new RuleViolationError({ message: "Key is disabled" }), "fallback", "log")).toBe(
      "Key is disabled"
    );
    expect(toResultMessage(new EntityNotFoundError({ message: "Key not found" }), "fallback", "log")).toBe(
      "Key not found"
    );
    expect(toResultMessage(new ExternalSystemError({ message: "HSM unreachable" }), "fallback", "log")).toBe(
      "HSM unreachable"
    );
  });

  test("unknown errors are replaced by the fallback", () => {
    expect(toResultMessage(new Error("boom"), "fallback", "log")).toBe("fallback");
  });
});
