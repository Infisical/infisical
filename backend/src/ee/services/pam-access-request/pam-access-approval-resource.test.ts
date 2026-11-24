import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TPamAccessPolicy } from "@app/services/approval-policy/pam-access/pam-access-policy-types";

import { PamPolicyType } from "../pam/pam-policies";
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

describe("pam access resource: postApprovalTxRoutine", () => {
  const HOUR_MS = 3_600_000;

  const grantFor = async (duration: string, templatePolicies: unknown) => {
    const create = vi.fn(async (data: { expiresAt: Date | null }) => ({ id: "grant", ...data }));
    const { postApprovalTxRoutine } = pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails: vi.fn(async () => ({ templatePolicies })) },
      approvalRequestGrantsDAL: { create }
    } as never);
    const request = {
      id: "request",
      projectId: "project",
      type: ApprovalPolicyType.PamAccess,
      requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration } }
    };
    const before = Date.now();
    await postApprovalTxRoutine!(request as never, {} as never);
    const expiresAt = create.mock.calls[0][0].expiresAt as Date;
    return expiresAt.getTime() - before;
  };

  test("grants the requested duration when it is within the template max", async () => {
    const ttl = await grantFor("1h", {
      [PamPolicyType.RequiresApproval]: true,
      [PamPolicyType.MaxAccessDuration]: 86_400
    });
    expect(ttl).toBeGreaterThanOrEqual(HOUR_MS);
    expect(ttl).toBeLessThan(HOUR_MS + 5000);
  });

  test("caps a request raised before the template max was lowered", async () => {
    const ttl = await grantFor("7d", {
      [PamPolicyType.RequiresApproval]: true,
      [PamPolicyType.MaxAccessDuration]: 3600
    });
    expect(ttl).toBeGreaterThanOrEqual(HOUR_MS);
    expect(ttl).toBeLessThan(HOUR_MS + 5000);
  });

  test("grants the requested duration when the template has no max", async () => {
    const ttl = await grantFor("3d", { [PamPolicyType.RequiresApproval]: true });
    expect(ttl).toBeGreaterThanOrEqual(72 * HOUR_MS);
  });
});
