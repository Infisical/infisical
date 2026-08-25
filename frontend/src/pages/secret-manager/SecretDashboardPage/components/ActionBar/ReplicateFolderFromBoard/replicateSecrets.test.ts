import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getDestinationSecretPath,
  getRelativeSecretPath,
  getSecretLocation,
  isSecretPathSettled,
  normalizeSecretPath,
  reconcileSelectedSecrets
} from "./replicateSecrets";

describe("copy secrets path mapping", () => {
  it("normalizes root and trailing slashes", () => {
    assert.equal(normalizeSecretPath(""), "/");
    assert.equal(normalizeSecretPath("folder/"), "/folder");
    assert.equal(normalizeSecretPath("/folder///"), "/folder");
  });

  it("maps source paths relative to the selected source root", () => {
    assert.equal(getRelativeSecretPath("/source", "/source"), "/");
    assert.equal(getRelativeSecretPath("/source/nested", "/source"), "/nested");
    assert.equal(getRelativeSecretPath("/nested", "/"), "/nested");
  });

  it("waits for the displayed source path to match the latest form path", () => {
    assert.equal(isSecretPathSettled("/source/new", "/source"), false);
    assert.equal(isSecretPathSettled("source/", "/source"), true);
  });

  it("reconciles selections with the latest accessible secret objects", () => {
    const selectedSecrets = [
      { id: "selected", secretValue: "old-value" },
      { id: "removed", secretValue: "removed-value" }
    ];
    const accessibleSecrets = [
      { id: "selected", secretValue: "new-value" },
      { id: "unselected", secretValue: "other-value" }
    ];

    assert.deepEqual(reconcileSelectedSecrets(selectedSecrets, accessibleSecrets), [
      accessibleSecrets[0]
    ]);
  });

  it("maps relative paths onto the selected destination root", () => {
    assert.equal(getDestinationSecretPath("/destination", "/"), "/destination");
    assert.equal(getDestinationSecretPath("/destination", "/nested"), "/destination/nested");
    assert.equal(getDestinationSecretPath("/", "/nested"), "/nested");
  });

  it("qualifies a secret key with its full path", () => {
    assert.equal(getSecretLocation("/", "API_KEY"), "/API_KEY");
    assert.equal(getSecretLocation("/services/api", "API_KEY"), "/services/api/API_KEY");
  });
});
