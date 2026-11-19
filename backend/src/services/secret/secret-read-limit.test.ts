import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { createSecretReadLimit } from "./secret-read-limit";

const config = vi.hoisted(() => ({ MAX_SECRETS_PER_READ_REQUEST: 5 }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const scope = { enforceSecretReadLimit: true, environment: "prod", secretPath: "/app" };

describe("createSecretReadLimit", () => {
  beforeEach(() => {
    config.MAX_SECRETS_PER_READ_REQUEST = 5;
  });

  test("should allow a request that returns exactly the limit", () => {
    // Setup
    const readLimit = createSecretReadLimit(scope);

    // Action
    const action = () => readLimit?.count(5);

    // Assert
    expect(action).not.toThrow();
  });

  test("should refuse a request once the secrets counted across calls pass the limit", () => {
    // Setup
    const readLimit = createSecretReadLimit(scope);
    readLimit?.count(3);
    readLimit?.count(2);

    // Action
    const action = () => readLimit?.count(1);

    // Assert
    expect(action).toThrow(BadRequestError);
  });

  test("should name the secret path, the environment and the limit in the error", () => {
    // Setup
    const readLimit = createSecretReadLimit(scope);

    // Action
    const action = () => readLimit?.count(6);

    // Assert
    expect(action).toThrow(
      "Reading secret path '/app' in environment 'prod' would return more than 5 secrets, counting imported secrets and subfolders"
    );
  });

  test("should use the limit configured on the instance", () => {
    // Setup
    config.MAX_SECRETS_PER_READ_REQUEST = 50;
    const readLimit = createSecretReadLimit(scope);

    // Action
    const action = () => readLimit?.count(50);

    // Assert
    expect(action).not.toThrow();
  });

  test("should not share counts between requests", () => {
    // Setup
    createSecretReadLimit(scope)?.count(5);
    const readLimit = createSecretReadLimit(scope);

    // Action
    const action = () => readLimit?.count(5);

    // Assert
    expect(action).not.toThrow();
  });

  test("should not limit a read that does not enforce the limit", () => {
    // Action
    const readLimit = createSecretReadLimit({ ...scope, enforceSecretReadLimit: false });

    // Assert
    expect(readLimit).toBeUndefined();
  });
});
