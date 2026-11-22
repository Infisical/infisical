import { describe, expect, test } from "vitest";

import {
  describeDelegatedApprovalPermissions,
  haveSameDelegatedApprovalPermissions,
  normalizeDelegatedApprovalPermissions
} from "./delegated-approval-decision-fns";

const DISPATCHED = ["secrets:        read, create", "secret-folders: edit"];

describe("normalizeDelegatedApprovalPermissions", () => {
  test("turns padded lines into sorted subject:action pairs", () => {
    expect(normalizeDelegatedApprovalPermissions(DISPATCHED)).toEqual([
      "secret-folders:edit",
      "secrets:create",
      "secrets:read"
    ]);
  });

  test("reads what the ServiceNow application stores back to the same pairs", () => {
    const stored = "secrets:        create, read\r\n\r\nsecret-folders: edit\n";

    expect(normalizeDelegatedApprovalPermissions(stored)).toEqual(normalizeDelegatedApprovalPermissions(DISPATCHED));
  });

  test("ignores order, duplicates, case and stray whitespace", () => {
    expect(normalizeDelegatedApprovalPermissions(["  Secrets : Read ,  read, CREATE", "secrets:create"])).toEqual([
      "secrets:create",
      "secrets:read"
    ]);
  });

  test("accepts compact pairs and several pairs on one line", () => {
    expect(normalizeDelegatedApprovalPermissions("secrets:read, secret-folders:edit")).toEqual([
      "secret-folders:edit",
      "secrets:read"
    ]);
  });

  test("keeps a subject without actions and drops empty input", () => {
    expect(normalizeDelegatedApprovalPermissions("secrets:\nsecret-folders")).toEqual(["secret-folders", "secrets"]);
    expect(normalizeDelegatedApprovalPermissions(null)).toEqual([]);
    expect(normalizeDelegatedApprovalPermissions("  \n ")).toEqual([]);
  });
});

describe("haveSameDelegatedApprovalPermissions", () => {
  const requested = normalizeDelegatedApprovalPermissions(DISPATCHED);

  test("matches an untouched record", () => {
    expect(
      haveSameDelegatedApprovalPermissions(
        requested,
        normalizeDelegatedApprovalPermissions("secrets:        create, read\nsecret-folders: edit")
      )
    ).toBe(true);
  });

  test.each([
    ["an added action", "secrets: create, read, delete\nsecret-folders: edit"],
    ["a removed subject", "secrets: create, read"],
    ["a changed action", "secrets: create, edit\nsecret-folders: edit"],
    ["an emptied record", ""]
  ])("flags %s", (_, stored) => {
    expect(haveSameDelegatedApprovalPermissions(requested, normalizeDelegatedApprovalPermissions(stored))).toBe(false);
  });
});

describe("describeDelegatedApprovalPermissions", () => {
  test("groups pairs by subject for a reason a user can read", () => {
    expect(describeDelegatedApprovalPermissions(normalizeDelegatedApprovalPermissions(DISPATCHED))).toBe(
      "secret-folders: edit; secrets: create, read"
    );
    expect(describeDelegatedApprovalPermissions([])).toBe("none");
  });
});
