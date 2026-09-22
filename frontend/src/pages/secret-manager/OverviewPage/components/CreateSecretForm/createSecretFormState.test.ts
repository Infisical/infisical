import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { applyKeyCapitalization, didAllSecretCreationsSucceed } from "./createSecretFormState";

describe("create secret form state", () => {
  it("closes after every secret creation succeeds", () => {
    assert.equal(
      didAllSecretCreationsSucceed([{ status: "fulfilled" }, { status: "fulfilled" }]),
      true
    );
  });

  it("stays open when any secret creation fails", () => {
    assert.equal(
      didAllSecretCreationsSucceed([{ status: "fulfilled" }, { status: "rejected" }]),
      false
    );
  });

  it("stays open when no secret creation ran", () => {
    assert.equal(didAllSecretCreationsSucceed([]), false);
  });
});

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
