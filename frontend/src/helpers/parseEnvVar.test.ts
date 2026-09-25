import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { applyKeyCapitalization } from "./parseEnvVar";

describe("apply key capitalization", () => {
  it("uppercases a pasted key when auto-capitalization is enabled", () => {
    assert.equal(applyKeyCapitalization("secret_key", true), "SECRET_KEY");
  });

  it("leaves the key unchanged when auto-capitalization is disabled", () => {
    assert.equal(applyKeyCapitalization("secret_key", false), "secret_key");
  });

  it("treats undefined auto-capitalization as disabled", () => {
    assert.equal(applyKeyCapitalization("secret_key", undefined), "secret_key");
  });

  it("is a no-op for an already uppercase key", () => {
    assert.equal(applyKeyCapitalization("SECRET_KEY", true), "SECRET_KEY");
  });
});
