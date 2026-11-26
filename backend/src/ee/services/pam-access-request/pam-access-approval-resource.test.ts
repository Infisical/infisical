import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyType
} from "@app/services/approval-policy/approval-policy-enums";
import { TPamAccessPolicy } from "@app/services/approval-policy/pam-access/pam-access-policy-types";

import { PamPolicyType } from "../pam/pam-policies";
import { pamAccessApprovalResourceFactory } from "./pam-access-approval-resource";
import { TPamAccessRequestData } from "./pam-access-request-types";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const ACCOUNT_ID = "6cb4b2fa-1a9f-4b31-9f2d-6f3f5f9d4a11";
const FOLDER_ID = "9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e33";

const buildResource = (approvalPolicyDAL: unknown) => pamAccessApprovalResourceFactory({ approvalPolicyDAL } as never);

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: () => ({ SITE_URL: "http://localhost" })
}));

vi.mock("../pam/pam-permission", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyProductMembership: vi.fn(async () => undefined),
  checkAccountAccess: vi.fn(async () => undefined)
}));

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
    const tx = { marker: "tx" };
    const findByIdWithDetails = vi.fn(async () => (templatePolicies === undefined ? null : { templatePolicies }));
    const create = vi.fn(async (...args: [{ expiresAt: Date | null }, unknown]) => ({ id: "grant", ...args[0] }));
    const { postApprovalTxRoutine } = pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails },
      approvalRequestGrantsDAL: { create }
    } as never);
    const request = {
      id: "request",
      projectId: "project",
      type: ApprovalPolicyType.PamAccess,
      requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration } }
    };
    const before = Date.now();
    await postApprovalTxRoutine!(request as never, tx as never);
    expect(findByIdWithDetails).toHaveBeenCalledWith(ACCOUNT_ID, tx);
    expect(create.mock.calls[0][1]).toBe(tx);
    const expiresAt = create.mock.calls[0][0].expiresAt as Date;
    return expiresAt.getTime() - before;
  };

  const expectTtl = (ttl: number, expectedMs: number) => {
    expect(ttl).toBeGreaterThanOrEqual(expectedMs);
    expect(ttl).toBeLessThan(expectedMs + 5000);
  };

  test("grants the requested duration when it is within the template max", async () => {
    expectTtl(
      await grantFor("1h", { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.MaxAccessDuration]: 86_400 }),
      HOUR_MS
    );
  });

  test("caps a request raised before the template max was lowered", async () => {
    expectTtl(
      await grantFor("7d", { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.MaxAccessDuration]: 3600 }),
      HOUR_MS
    );
  });

  test("grants the requested duration when the template has no max", async () => {
    expectTtl(await grantFor("3d", { [PamPolicyType.RequiresApproval]: true }), 72 * HOUR_MS);
  });

  test("ignores a stored max once approval is off", async () => {
    expectTtl(await grantFor("3d", { [PamPolicyType.MaxAccessDuration]: 3600 }), 72 * HOUR_MS);
  });

  test("grants the requested duration when the account is gone", async () => {
    expectTtl(await grantFor("2h", undefined), 2 * HOUR_MS);
  });
});

describe("pam access resource: assertCanCreateRequest", () => {
  const PASSED = "passed the duration check";

  const create = (duration: string, templatePolicies: unknown) => {
    const { assertCanCreateRequest } = pamAccessApprovalResourceFactory({
      pamAccountDAL: {
        findByIdWithDetails: vi.fn(async () => ({
          id: ACCOUNT_ID,
          projectId: "project",
          folderId: FOLDER_ID,
          accountType: "postgres",
          templatePolicies
        }))
      },
      approvalPolicyDAL: {
        findStepsByPolicyId: vi.fn(async () => {
          throw new Error(PASSED);
        })
      }
    } as never);
    return assertCanCreateRequest!({
      projectId: "project",
      policy: { id: "policy" },
      requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration },
      actor: { type: "user", id: "user", authMethod: null, orgId: "org" },
      hasAutoApprovalRules: false,
      skipsAutoApproval: false
    } as never);
  };

  const capped = (seconds: number) => ({
    [PamPolicyType.RequiresApproval]: true,
    [PamPolicyType.MaxAccessDuration]: seconds
  });

  test("rejects a request longer than the template max, naming the exact max", async () => {
    await expect(create("2h", capped(5400))).rejects.toMatchObject({
      name: "PAM_ACCESS_DURATION_EXCEEDED",
      message: "Access duration must be at most 90 minutes, the maximum set on this account's template"
    });
  });

  test("accepts a request at exactly the template max", async () => {
    await expect(create("90m", capped(5400))).rejects.toThrow(PASSED);
  });

  test("accepts any duration when the template has no max", async () => {
    await expect(create("7d", { [PamPolicyType.RequiresApproval]: true })).rejects.toThrow(PASSED);
  });
});

describe("pam access resource: break-glass notification", () => {
  test("reports the granted duration when the template max cut the request short", async () => {
    const { buildNotification } = pamAccessApprovalResourceFactory({
      pamAccountDAL: {
        findByIdWithDetails: vi.fn(async () => ({
          name: "pg",
          templatePolicies: { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.MaxAccessDuration]: 3600 }
        }))
      },
      pamFolderDAL: { findById: vi.fn(async () => ({ name: "folder" })) },
      pamFolderNotificationConfigDAL: { findByFolderIdWithIntegration: vi.fn(async () => []) }
    } as never);
    const notification = await buildNotification!({
      event: ApprovalNotificationEvent.Bypassed,
      request: {
        id: "request",
        organizationId: "org",
        requesterName: "Requester",
        requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration: "7d" } }
      },
      bypassReason: "outage needs access"
    } as never);
    expect(notification?.email?.substitutions).toMatchObject({ accessDuration: "1 hour" });
  });
});

describe("pam access resource: exact durations", () => {
  const capped = { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.MaxAccessDuration]: 3600 };
  const build = () =>
    pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails: vi.fn(async () => ({ name: "pg", templatePolicies: capped })) },
      pamFolderDAL: { findById: vi.fn(async () => ({ name: "folder", emailApproversOnRequest: true })) },
      pamFolderNotificationConfigDAL: { findByFolderIdWithIntegration: vi.fn(async () => []) },
      approvalPolicyDAL: { findById: vi.fn(async () => null), findStepsByPolicyId: vi.fn(async () => []) }
    } as never);
  const request = (duration: string) =>
    ({
      id: "request",
      organizationId: "org",
      requesterName: "Requester",
      requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration } }
    }) as never;

  test("names a 90-minute request exactly in the request email", async () => {
    const notification = await build().buildNotification!({
      event: ApprovalNotificationEvent.Requested,
      request: request("90m")
    });
    expect(notification?.email?.substitutions).toMatchObject({ accessDuration: "90 minutes" });
  });

  test("records the capped duration in the break-glass audit event", async () => {
    const event = await build().buildAuditEvent!({
      action: ApprovalAuditAction.RequestBypassed,
      request: request("7d"),
      grantId: "grant",
      actorId: "user",
      bypassReason: "outage"
    } as never);
    expect(event?.metadata).toMatchObject({ accessDuration: "1h" });
  });
});

describe("pam access resource: buildNotification email", () => {
  const buildWithFolder = (folder: { name: string; emailApproversOnRequest: boolean } | null) =>
    pamAccessApprovalResourceFactory({
      pamAccountDAL: { findByIdWithDetails: vi.fn().mockResolvedValue({ name: "prod-db" }) },
      pamFolderDAL: { findById: vi.fn().mockResolvedValue(folder) },
      pamFolderNotificationConfigDAL: { findByFolderIdWithIntegration: vi.fn().mockResolvedValue([]) }
    } as never);

  const request = {
    id: "request",
    organizationId: "org",
    requesterName: "Jane",
    requesterEmail: "jane@example.com",
    requestData: { version: 1, requestData: { accountId: ACCOUNT_ID, folderId: FOLDER_ID, duration: "1h" } }
  } as never;

  test.each([
    ["off", { name: "prod", emailApproversOnRequest: false }, false],
    ["on", { name: "prod", emailApproversOnRequest: true }, true],
    ["unknown for a deleted folder", null, true]
  ])("emails approvers about a new request when the folder setting is %s", async (_label, folder, emailed) => {
    const content = await buildWithFolder(folder).buildNotification!({
      event: ApprovalNotificationEvent.Requested,
      request
    });

    expect(Boolean(content?.email)).toBe(emailed);
    expect(content?.inApp).toBeDefined();
  });

  test("still emails approvers about break-glass use when request emails are off", async () => {
    const content = await buildWithFolder({ name: "prod", emailApproversOnRequest: false }).buildNotification!({
      event: ApprovalNotificationEvent.Bypassed,
      request,
      bypassReason: "outage"
    });

    expect(content?.email).toBeDefined();
  });
});
