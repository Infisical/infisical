import { packRules } from "@casl/ability/extra";
import { UnrecoverableError } from "bullmq";
import { describe, expect, test, vi } from "vitest";

// logger is initialized at app boot and is undefined under unit tests; stub it so
// validateHandlebarTemplate's reject path surfaces its BadRequestError rather than a logger error.
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { TApprovalRequests } from "@app/db/schemas";
// eslint-disable-next-line import/first
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

// eslint-disable-next-line import/first
import { buildSecretAccessDispatchDetails } from "./delegated-approval-dispatch-builders";

const makeRule = (action: string, env: string, secretPath: string, subject = "secrets") => ({
  action,
  subject,
  conditions: { environment: env, secretPath: { $glob: secretPath } }
});

const makeRequest = (requestData: unknown): TApprovalRequests => ({
  id: "request-1",
  projectId: "project-1",
  organizationId: "org-1",
  policyId: "policy-1",
  requesterId: "user-1",
  requesterName: "Ada Lovelace",
  requesterEmail: "ada@example.com",
  type: ApprovalPolicyType.SecretAccess,
  status: ApprovalRequestStatus.Pending,
  justification: null,
  currentStep: 1,
  requestData,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  machineIdentityId: null,
  scopeType: null,
  scopeId: null
});

describe("buildSecretAccessDispatchDetails", () => {
  test("derives the environment, path and aligned permissions from the stored request", () => {
    const permissions = packRules([
      makeRule("read", "prod", "/db"),
      makeRule("edit", "prod", "/db"),
      makeRule("read", "prod", "/db", "secret-folders")
    ]);

    expect(
      buildSecretAccessDispatchDetails(
        makeRequest({ version: 1, requestData: { permissions, isTemporary: true, temporaryRange: "1h" } })
      )
    ).toEqual({
      policyType: ApprovalPolicyType.SecretAccess,
      environment: "prod",
      secretPath: "/db",
      permissions: ["secrets:        read, edit", "secret-folders: read"],
      isTemporary: true,
      temporaryRange: "1h"
    });
  });

  test("drops the temporary range on a permanent request", () => {
    const permissions = packRules([makeRule("read", "dev", "/")]);

    expect(
      buildSecretAccessDispatchDetails(
        makeRequest({ version: 1, requestData: { permissions, isTemporary: false, temporaryRange: "1h" } })
      ).temporaryRange
    ).toBeNull();
  });

  test("does not retry a request whose stored data cannot be interpreted", () => {
    expect(() => buildSecretAccessDispatchDetails(makeRequest({ version: 2 }))).toThrow(UnrecoverableError);
    expect(() =>
      buildSecretAccessDispatchDetails(
        makeRequest({ version: 1, requestData: { permissions: [], isTemporary: false, temporaryRange: null } })
      )
    ).toThrow(UnrecoverableError);
  });
});
