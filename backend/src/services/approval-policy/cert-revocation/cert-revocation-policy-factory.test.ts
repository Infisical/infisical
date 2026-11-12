import { describe, expect, it, vi } from "vitest";

import { ApprovalNotificationEvent, ApprovalPolicyScope } from "../approval-policy-enums";
import { certRevocationApprovalResourceFactory } from "./cert-revocation-policy-factory";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const applicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01";
const otherApplicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a02";

const makePolicy = (overrides: Record<string, unknown>) => ({
  id: "policy",
  isActive: true,
  scopeType: ApprovalPolicyScope.PkiApplication,
  scopeId: applicationId,
  conditions: { version: 1, conditions: [{ profileNames: ["prod-tls"] }] },
  ...overrides
});

const setup = (policies: unknown[]) => {
  const deps = {
    approvalPolicyDAL: { findByProjectId: vi.fn().mockResolvedValue(policies) },
    certificateService: { revokeApprovedCertificate: vi.fn().mockResolvedValue(undefined) }
  };
  return { deps, resource: certRevocationApprovalResourceFactory(deps as never) };
};

describe("certRevocationApprovalResourceFactory.matchPolicy", () => {
  it("matches the Application's active policy that lists the certificate's profile", async () => {
    const { resource } = setup([
      makePolicy({ id: "other-app", scopeId: otherApplicationId }),
      makePolicy({ id: "inactive", isActive: false }),
      makePolicy({ id: "legacy", scopeType: null, scopeId: null }),
      makePolicy({ id: "other-profile", conditions: { version: 1, conditions: [{ profileNames: ["dev-tls"] }] } }),
      makePolicy({ id: "match" })
    ]);

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(policy?.id).toBe("match");
  });

  it("matches nothing when no policy lists the certificate's profile", async () => {
    const { resource } = setup([makePolicy({})]);

    const policy = await resource.matchPolicy("project", { profileName: "dev-tls", applicationId });

    expect(policy).toBeNull();
  });
});

describe("certRevocationApprovalResourceFactory.postApprovalRoutine", () => {
  it("revokes the certificate the approved request names", async () => {
    const { deps, resource } = setup([]);
    const request = { id: "approval-1", requestData: { requestData: { certificateId: "cert-1" } } } as never;

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateService.revokeApprovedCertificate).toHaveBeenCalledWith(request);
  });
});

describe("certRevocationApprovalResourceFactory.buildNotification", () => {
  const request = {
    id: "approval-1",
    type: "cert-revocation",
    organizationId: "org-1",
    requesterName: "Alice",
    requesterEmail: "alice@example.com",
    requestData: { requestData: { commonName: "api.example.com" } }
  } as never;

  it("asks approvers to review a new revocation request, naming the certificate", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Requested, request });

    expect(notification?.inApp?.body).toContain("api.example.com");
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-revocation");
    expect(notification?.email?.substitutions.requestType).toBe("certificate revocation request");
  });

  it("sends nothing for decisions, which show on the certificate itself", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Approved, request });

    expect(notification).toBeNull();
  });
});
