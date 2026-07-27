import { describe, expect, test } from "vitest";

import { hasSecretUpdateCommitConflict, TSecretUpdateCommitCandidate } from "./secret-approval-request-fns";

const SECRET_ID = "secret-1";
const OTHER_SECRET_ID = "secret-2";

// a commit as created for an update of secret FOO: references the secret and the version it was reviewed against
const buildCommit = (overrides: Partial<TSecretUpdateCommitCandidate> = {}): TSecretUpdateCommitCandidate => ({
  key: "FOO",
  secretId: SECRET_ID,
  secret: { id: SECRET_ID, key: "FOO" },
  secretVersion: { key: "FOO" },
  ...overrides
});

describe("hasSecretUpdateCommitConflict", () => {
  test("plain update of an untouched secret does not conflict", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit(), { id: SECRET_ID })).toBe(false);
  });

  // regression: renames were unconditionally flagged as conflicts because the new key has no owner yet
  test("rename to a free key does not conflict", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit({ key: "BAR" }), undefined)).toBe(false);
  });

  test("rename to a key already taken by another secret conflicts", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit({ key: "BAR" }), { id: OTHER_SECRET_ID })).toBe(true);
  });

  test("commit whose referenced secret was deleted conflicts", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit({ secretId: null, secret: null }), undefined)).toBe(true);
  });

  test("commit whose key is now owned by a recreated secret conflicts", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit(), { id: OTHER_SECRET_ID })).toBe(true);
  });

  test("second rename request applies last-writer-wins once the first rename has merged", () => {
    // reviewed against FOO, the secret is already renamed to BAR; this commit renames it on to BAZ
    const commit = buildCommit({ key: "BAZ", secret: { id: SECRET_ID, key: "BAR" } });
    expect(hasSecretUpdateCommitConflict(commit, undefined)).toBe(false);
  });

  test("plain update conflicts when the secret was renamed externally", () => {
    const commit = buildCommit({ secret: { id: SECRET_ID, key: "BAR" } });
    expect(hasSecretUpdateCommitConflict(commit, undefined)).toBe(true);
  });

  test("plain update whose key vanished from the folder conflicts", () => {
    expect(hasSecretUpdateCommitConflict(buildCommit(), undefined)).toBe(true);
  });

  test("plain update still applies when the reviewed version was pruned", () => {
    const commit = buildCommit({ secretVersion: null });
    expect(hasSecretUpdateCommitConflict(commit, { id: SECRET_ID })).toBe(false);
  });

  test("key change without the reviewed version falls back to the live key and applies as a rename", () => {
    const commit = buildCommit({ key: "BAR", secretVersion: null });
    expect(hasSecretUpdateCommitConflict(commit, undefined)).toBe(false);
  });
});
