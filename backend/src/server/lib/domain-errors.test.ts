import {
  EntityNotFoundError,
  ExternalSystemError,
  PERMISSION_BOUNDARY_ERROR_NAME,
  PermissionDeniedError,
  RuleViolationError,
  StateConflictError
} from "@app/domains/lib/errors";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  PermissionBoundaryError
} from "@app/lib/errors";

import { toHttpError } from "./domain-errors";

describe("toHttpError", () => {
  test("should turn a rule violation into a bad request that keeps its message and details", () => {
    // Setup
    const error = new RuleViolationError({ message: "Plan does not include SCIM", details: { code: "scim" } });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(BadRequestError);
    expect(result).toMatchObject({
      name: "BadRequest",
      message: "Plan does not include SCIM",
      details: { code: "scim" }
    });
  });

  test("should keep a name the domain chose", () => {
    // Setup
    const error = new ExternalSystemError({ name: "LicenseServerError", message: "Billing service error" });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(InternalServerError);
    expect(result.name).toBe("LicenseServerError");
  });

  test("should answer a refused privilege change as a permission boundary error with its missing permissions", () => {
    // Setup
    const details = { missingPermissions: [{ action: "delete", subject: "identity" }] };
    const error = new PermissionDeniedError({ name: PERMISSION_BOUNDARY_ERROR_NAME, message: "Refused", details });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(PermissionBoundaryError);
    expect(result).toMatchObject({ name: "PermissionBoundaryError", message: "Refused", details });
  });

  test("should answer any other permission refusal as forbidden", () => {
    // Setup
    const error = new PermissionDeniedError({
      denial: { action: "read", subject: "secrets", matchedRules: [] }
    });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(ForbiddenRequestError);
    expect(result).not.toBeInstanceOf(PermissionBoundaryError);
  });

  test("should turn a missing entity into a not found error", () => {
    // Setup
    const error = new EntityNotFoundError({ message: "Organization with ID 'o1' not found" });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(NotFoundError);
    expect(result).toMatchObject({ name: "NotFound", message: "Organization with ID 'o1' not found" });
  });

  test("should turn a state conflict into a conflict error", () => {
    // Setup
    const error = new StateConflictError({ message: "The staged encryption key is 'a', not 'b'." });

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBeInstanceOf(ConflictError);
    expect(result).toMatchObject({ name: "Conflict", message: "The staged encryption key is 'a', not 'b'." });
  });

  test("should return an error that is not a domain error unchanged", () => {
    // Setup
    const error = new Error("boom");

    // Action
    const result = toHttpError(error);

    // Assert
    expect(result).toBe(error);
  });
});
