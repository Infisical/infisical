import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { didAllSecretCreationsSucceed } from "./createSecretFormState";

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
