import { TApprovalRequestGrants } from "@app/db/schemas";

import { ApprovalPolicyType } from "../approval-policy-enums";
import { matchPamAccessGrants, parsePamAccessDuration } from "./pam-access-policy-fns";

const ACCOUNT_ID = "6cb4b2fa-1a9f-4b31-9f2d-6f3f5f9d4a11";
const OTHER_ACCOUNT_ID = "1d0e2c3b-4a59-4f68-9b77-2c8d5e6f7a22";
const FOLDER_ID = "9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e33";
const OTHER_FOLDER_ID = "2a3b4c5d-6e7f-4809-91a2-b3c4d5e6f744";

const grant = (attributes: unknown) =>
  ({
    id: "grant",
    projectId: "project",
    status: "active",
    type: ApprovalPolicyType.PamAccess,
    isBreakGlass: false,
    attributes
  }) as TApprovalRequestGrants;

describe("parsePamAccessDuration", () => {
  test("parses a single-unit duration", () => {
    expect(parsePamAccessDuration("30m")).toBe(30 * 60 * 1000);
    expect(parsePamAccessDuration("2h")).toBe(2 * 60 * 60 * 1000);
  });

  // npm ms returns undefined rather than throwing, so an unparseable string has to be caught here
  test("rejects durations ms cannot parse, and non-positive ones", () => {
    expect(parsePamAccessDuration("2h30m")).toBeNull();
    expect(parsePamAccessDuration("soon")).toBeNull();
    expect(parsePamAccessDuration("0s")).toBeNull();
    expect(parsePamAccessDuration("-1h")).toBeNull();
  });
});

describe("matchPamAccessGrants", () => {
  const inputs = { accountId: ACCOUNT_ID, folderId: FOLDER_ID };

  test("matches a grant for the same account and folder", () => {
    expect(matchPamAccessGrants([grant({ accountId: ACCOUNT_ID, folderId: FOLDER_ID })], inputs)).toHaveLength(1);
  });

  test("ignores a grant for another account", () => {
    expect(matchPamAccessGrants([grant({ accountId: OTHER_ACCOUNT_ID, folderId: FOLDER_ID })], inputs)).toHaveLength(0);
  });

  // A grant approved while the account lived elsewhere must not follow it into a gated folder whose
  // approvers never reviewed it.
  test("ignores a grant whose folder no longer matches the account's", () => {
    expect(matchPamAccessGrants([grant({ accountId: ACCOUNT_ID, folderId: OTHER_FOLDER_ID })], inputs)).toHaveLength(0);
  });

  test("treats a missing access type as a session grant, never as a wildcard", () => {
    const legacy = [grant({ accountId: ACCOUNT_ID, folderId: FOLDER_ID })];

    expect(matchPamAccessGrants(legacy, { ...inputs, accessType: "session" })).toHaveLength(1);
    expect(matchPamAccessGrants(legacy, { ...inputs, accessType: "credential" })).toHaveLength(0);
  });

  test("keeps session and credential grants apart", () => {
    const grants = [
      grant({ accountId: ACCOUNT_ID, folderId: FOLDER_ID, accessType: "session" }),
      grant({ accountId: ACCOUNT_ID, folderId: FOLDER_ID, accessType: "credential" })
    ];

    expect(matchPamAccessGrants(grants, { ...inputs, accessType: "credential" })).toEqual([grants[1]]);
  });
});
