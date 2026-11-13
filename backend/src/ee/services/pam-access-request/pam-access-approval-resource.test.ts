import { ApprovalPolicyType, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { TPamAccessPolicy } from "@app/services/approval-policy/pam-access/pam-access-policy-types";

import { pamAccessApprovalResourceFactory } from "./pam-access-approval-resource";
import { TPamAccessRequestData } from "./pam-access-request-types";

const ACCOUNT_ID = "6cb4b2fa-1a9f-4b31-9f2d-6f3f5f9d4a11";
const FOLDER_ID = "9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e33";

const buildResource = (approvalPolicyDAL: unknown) => pamAccessApprovalResourceFactory({ approvalPolicyDAL } as never);

describe("pam access resource: validateConstraints", () => {
  const { validateConstraints } = buildResource({});

  const policy = {
    constraints: { version: 1, constraints: { accessDuration: { min: "30m", max: "8h" } } }
  } as TPamAccessPolicy;

  const requestData = (duration: string) =>
    ({ accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration }) as TPamAccessRequestData;

  test("accepts a duration inside the policy's window", () => {
    expect(validateConstraints(policy, requestData("2h"))).toEqual({ valid: true, errors: undefined });
  });

  test("names the bound a duration missed", () => {
    expect(validateConstraints(policy, requestData("5m")).errors).toEqual(["Access duration must be at least 30m"]);
    expect(validateConstraints(policy, requestData("2d")).errors).toEqual(["Access duration must be at most 8h"]);
  });

  test("reports an unparseable duration rather than comparing NaN", () => {
    const result = validateConstraints(policy, requestData("2h30m"));
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain("Invalid access duration '2h30m'");
  });
});

describe("pam access resource: matchPolicy", () => {
  test("looks the policy up by the folder the account sits in", async () => {
    const policy = { id: "policy" };
    const findByProjectId = vi.fn().mockResolvedValue([policy]);

    const matched = await buildResource({ findByProjectId }).matchPolicy("project", {
      accountId: ACCOUNT_ID,
      folderId: FOLDER_ID
    });

    expect(matched).toBe(policy);
    expect(findByProjectId).toHaveBeenCalledWith(ApprovalPolicyType.PamAccess, "project", {
      scopeType: "pam-folder",
      scopeId: FOLDER_ID
    });
  });

  test("returns null for a folder with no policy", async () => {
    const resource = buildResource({ findByProjectId: vi.fn().mockResolvedValue([]) });

    await expect(resource.matchPolicy("project", { accountId: ACCOUNT_ID, folderId: FOLDER_ID })).resolves.toBeNull();
  });
});

describe("pam access resource: filterActiveApprovers", () => {
  const USER_IN_GROUP = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e801";
  const USER_GONE = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e802";
  const GROUP_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e803";

  test("notifies a named user who still holds the folder through a group", async () => {
    const resource = pamAccessApprovalResourceFactory({
      membershipDAL: {
        find: vi.fn().mockResolvedValue([{ id: "membership-1", actorGroupId: GROUP_ID, isActive: true }])
      },
      membershipRoleDAL: { find: vi.fn().mockResolvedValue([{ membershipId: "membership-1", isTemporary: false }]) },
      userGroupMembershipDAL: {
        find: vi.fn().mockResolvedValue([{ userId: USER_IN_GROUP, groupId: GROUP_ID }])
      }
    } as never);
    const request = { projectId: "project", requestData: { version: 1, requestData: { folderId: FOLDER_ID } } };

    await expect(
      resource.filterActiveApprovers!(request as never, [
        { type: ApproverType.User, id: USER_IN_GROUP },
        { type: ApproverType.User, id: USER_GONE }
      ])
    ).resolves.toEqual([{ type: ApproverType.User, id: USER_IN_GROUP }]);
  });
});
