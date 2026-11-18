import { EntityNotFoundError, RuleViolationError, StateConflictError } from "@app/domains/lib/errors";

import { isTerminalIssuanceError } from "./signer-issuance-errors";

describe("isTerminalIssuanceError", () => {
  test("KMS Core rule violations and missing entities are terminal", () => {
    expect(isTerminalIssuanceError(new RuleViolationError({ message: "Key is disabled" }))).toBe(true);
    expect(isTerminalIssuanceError(new EntityNotFoundError({ message: "Key not found" }))).toBe(true);
  });

  test("state conflicts stay retryable", () => {
    expect(isTerminalIssuanceError(new StateConflictError({ message: "Key is being rotated" }))).toBe(false);
  });
});
