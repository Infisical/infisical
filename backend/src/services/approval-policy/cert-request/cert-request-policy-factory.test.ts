import { describe, expect, it, vi } from "vitest";

import { ResourceType } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApprovalPolicyScope, ApprovalRequestStatus, ApproverType } from "../approval-policy-enums";
import { certRequestApprovalResourceFactory } from "./cert-request-policy-factory";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe("certRequestApprovalResourceFactory.postApprovalRoutine", () => {
  const request = {
    id: "approval-1",
    requestData: { requestData: { certificateRequestId: "cert-req-1" } }
  } as never;

  const setup = (issueCertificate: () => Promise<unknown>) => {
    const failedRequest = { id: "cert-req-1", status: CertificateRequestStatus.FAILED };
    const deps = {
      approvalPolicyDAL: { findByProjectId: vi.fn() },
      certificateApprovalService: { issueCertificate: vi.fn(issueCertificate) },
      certificateRequestDAL: { updateById: vi.fn().mockResolvedValue(failedRequest), findById: vi.fn() },
      certificateRequestService: { recordIssuanceFailure: vi.fn() },
      certificateRenewalService: {
        renewApprovedCertificate: vi.fn().mockResolvedValue(undefined),
        recordRejectedRenewal: vi.fn().mockResolvedValue(undefined)
      },
      telemetryService: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) }
    };
    return { deps, failedRequest, resource: certRequestApprovalResourceFactory(deps as never) };
  };

  it("records the issuance failure with the original error and lets the operation be derived", async () => {
    const error = new Error("CA is disabled");
    const { deps, failedRequest, resource } = setup(() => Promise.reject(error));

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestDAL.updateById).toHaveBeenLastCalledWith("cert-req-1", {
      status: CertificateRequestStatus.FAILED,
      errorMessage: "CA is disabled"
    });
    expect(deps.certificateRequestService.recordIssuanceFailure).toHaveBeenCalledWith(failedRequest, { error });
  });

  it("issues an approved renewal as a renewal of the original certificate", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    const renewal = { certificateId: "cert-1", renewalKeySource: "new" };
    const certificateRequest = { commonName: "a.example.com", validity: { ttl: "30d" } };

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal, certificateRequest } }
    } as never);

    expect(deps.certificateRenewalService.renewApprovedCertificate).toHaveBeenCalledWith({
      certificateRequestId: "cert-req-1",
      organizationId: "org-1",
      renewal,
      reviewedCertificateRequest: certificateRequest
    });
    expect(deps.certificateApprovalService.issueCertificate).not.toHaveBeenCalled();
  });

  it("reports the renewal to telemetry once an approved renewal is issued", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      projectId: "project-1",
      requesterId: "user-1",
      requesterEmail: "john.smith@example.com",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        event: PostHogEventTypes.CertificateRenewed,
        distinctId: "john.smith@example.com",
        properties: { orgId: "org-1", projectId: "project-1" }
      })
    );
  });

  it("reports no renewal to telemetry when the approved renewal fails", async () => {
    const { deps, resource } = setup(() => Promise.resolve());
    deps.certificateRenewalService.renewApprovedCertificate.mockRejectedValue(new Error("CA is disabled"));

    await resource.postApprovalRoutine!({
      id: "approval-1",
      organizationId: "org-1",
      requesterId: "user-1",
      requesterEmail: "john.smith@example.com",
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.telemetryService.sendPostHogEvents).not.toHaveBeenCalled();
  });

  it("stops automatic renewal when a renewal is rejected", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      status: ApprovalRequestStatus.Rejected,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).toHaveBeenCalledWith("cert-1");
  });

  it("keeps automatic renewal when a renewal is cancelled", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postRejectionRoutine!({
      id: "approval-1",
      status: ApprovalRequestStatus.Cancelled,
      requestData: { requestData: { certificateRequestId: "cert-req-1", renewal: { certificateId: "cert-1" } } }
    } as never);

    expect(deps.certificateRenewalService.recordRejectedRenewal).not.toHaveBeenCalled();
  });

  it("records nothing when issuance succeeds", async () => {
    const { deps, resource } = setup(() => Promise.resolve());

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateRequestService.recordIssuanceFailure).not.toHaveBeenCalled();
  });
});

const PROJECT_ID = "project-1";
const APP_ID = "8c1e2f3a-4b5c-4d6e-8f70-819a2b3c4d01";
const ALICE = "8c1e2f3a-4b5c-4d6e-8f70-819a2b3c4d02";
const BOB = "8c1e2f3a-4b5c-4d6e-8f70-819a2b3c4d03";
const SECURITY_GROUP = "8c1e2f3a-4b5c-4d6e-8f70-819a2b3c4d04";

type TMembershipRow = { actorUserId?: string | null; actorGroupId?: string | null; isActive?: boolean };

const setupMembership = ({
  memberships = [] as TMembershipRow[],
  applicationProfileSlugs = [] as string[],
  projectProfileSlugs = [] as string[]
} = {}) => {
  const deps = {
    membershipDAL: {
      find: vi
        .fn()
        .mockResolvedValue(memberships.map((m) => ({ actorUserId: null, actorGroupId: null, isActive: true, ...m })))
    },
    pkiApplicationProfileDAL: {
      findByApplicationId: vi.fn().mockResolvedValue(applicationProfileSlugs.map((profileSlug) => ({ profileSlug })))
    },
    certificateProfileDAL: { find: vi.fn().mockResolvedValue(projectProfileSlugs.map((slug) => ({ slug }))) }
  };
  return { deps, resource: certRequestApprovalResourceFactory(deps as never) };
};

const appRequest = {
  id: "approval-1",
  projectId: PROJECT_ID,
  scopeType: ApprovalPolicyScope.PkiApplication,
  scopeId: APP_ID
} as never;

describe("certRequestApprovalResourceFactory.validateConditions", () => {
  it("accepts profiles attached to the policy's Application", async () => {
    const { deps, resource } = setupMembership({ applicationProfileSlugs: ["web-server", "mtls-client"] });

    await expect(
      resource.validateConditions!({
        projectId: PROJECT_ID,
        scopeId: APP_ID,
        conditions: [{ profileNames: ["web-server"] }, { profileNames: ["mtls-client", "web-server"] }]
      })
    ).resolves.toBeUndefined();
    expect(deps.pkiApplicationProfileDAL.findByApplicationId).toHaveBeenCalledWith(APP_ID);
  });

  it("refuses a profile that isn't attached to the Application and names it", async () => {
    const { resource } = setupMembership({ applicationProfileSlugs: ["web-server"] });

    const result = resource.validateConditions!({
      projectId: PROJECT_ID,
      scopeId: APP_ID,
      conditions: [{ profileNames: ["web-server", "web-sever"] }]
    });

    await expect(result).rejects.toThrow(BadRequestError);
    await expect(result).rejects.toThrow(
      "Certificate profile 'web-sever' isn't attached to this Application. Attach it to the Application first, or remove it from the policy."
    );
  });

  it("names every unknown profile once", async () => {
    const { resource } = setupMembership({ applicationProfileSlugs: ["web-server"] });

    await expect(
      resource.validateConditions!({
        projectId: PROJECT_ID,
        scopeId: APP_ID,
        conditions: [{ profileNames: ["a", "b"] }, { profileNames: ["a"] }]
      })
    ).rejects.toThrow(
      "Certificate profiles 'a', 'b' aren't attached to this Application. Attach them to the Application first, or remove them from the policy."
    );
  });

  it("refuses a policy that names no profiles", async () => {
    const { deps, resource } = setupMembership({ applicationProfileSlugs: ["web-server"] });
    const message =
      "Select at least one certificate profile. A policy with no profiles never applies to any certificate.";

    await expect(
      resource.validateConditions!({ projectId: PROJECT_ID, scopeId: APP_ID, conditions: [] })
    ).rejects.toThrow(message);
    await expect(
      resource.validateConditions!({
        projectId: PROJECT_ID,
        scopeId: APP_ID,
        conditions: [{ profileNames: ["web-server"] }, { profileNames: [] }]
      })
    ).rejects.toThrow(message);
    expect(deps.pkiApplicationProfileDAL.findByApplicationId).not.toHaveBeenCalled();
  });

  it("checks a legacy project-level policy against the profiles that exist", async () => {
    const { deps, resource } = setupMembership({ projectProfileSlugs: ["web-server"] });

    await expect(
      resource.validateConditions!({
        projectId: PROJECT_ID,
        scopeId: null,
        conditions: [{ profileNames: ["web-server"] }]
      })
    ).resolves.toBeUndefined();
    await expect(
      resource.validateConditions!({ projectId: PROJECT_ID, scopeId: null, conditions: [{ profileNames: ["gone"] }] })
    ).rejects.toThrow("Certificate profile 'gone' doesn't exist. Check the name, or remove it from the policy.");
    expect(deps.certificateProfileDAL.find).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(deps.pkiApplicationProfileDAL.findByApplicationId).not.toHaveBeenCalled();
  });
});

describe("certRequestApprovalResourceFactory live approver checks", () => {
  const actor = (id: string) => ({ id }) as never;

  it("reads the Application's memberships", async () => {
    const { deps, resource } = setupMembership({ memberships: [{ actorUserId: ALICE }] });

    await resource.isLiveApprover!({
      projectId: PROJECT_ID,
      scopeId: APP_ID,
      actor: actor(ALICE),
      userGroupIds: new Set()
    });

    expect(deps.membershipDAL.find).toHaveBeenCalledWith({
      scope: "resource",
      scopeProjectId: PROJECT_ID,
      scopeResourceType: ResourceType.CertificateApplication,
      scopeResourceId: APP_ID
    });
  });

  it("treats a direct member as a live approver", async () => {
    const { resource } = setupMembership({ memberships: [{ actorUserId: ALICE }] });

    await expect(
      resource.isLiveApprover!({ projectId: PROJECT_ID, scopeId: APP_ID, actor: actor(ALICE), userGroupIds: new Set() })
    ).resolves.toBe(true);
  });

  it("treats a member through a group as a live approver", async () => {
    const { resource } = setupMembership({ memberships: [{ actorGroupId: SECURITY_GROUP }] });

    await expect(
      resource.isLiveApprover!({
        projectId: PROJECT_ID,
        scopeId: APP_ID,
        actor: actor(BOB),
        userGroupIds: new Set([SECURITY_GROUP])
      })
    ).resolves.toBe(true);
  });

  it("doesn't treat someone removed from the Application as a live approver", async () => {
    const { resource } = setupMembership({ memberships: [{ actorUserId: ALICE }] });

    await expect(
      resource.isLiveApprover!({ projectId: PROJECT_ID, scopeId: APP_ID, actor: actor(BOB), userGroupIds: new Set() })
    ).resolves.toBe(false);
  });

  it("ignores an inactive membership", async () => {
    const { resource } = setupMembership({ memberships: [{ actorUserId: ALICE, isActive: false }] });

    await expect(
      resource.isLiveApprover!({ projectId: PROJECT_ID, scopeId: APP_ID, actor: actor(ALICE), userGroupIds: new Set() })
    ).resolves.toBe(false);
  });

  it("refuses a review from someone removed from the Application", async () => {
    const { resource } = setupMembership({ memberships: [{ actorUserId: ALICE }] });

    const result = resource.assertCanReview!({
      request: appRequest,
      decision: "approved" as never,
      actor: actor(BOB),
      userGroupIds: new Set()
    });

    await expect(result).rejects.toThrow(ForbiddenRequestError);
    await expect(result).rejects.toThrow(
      "You can't review this request because you're no longer a member of its Application."
    );
  });

  it("lets a current member review", async () => {
    const { resource } = setupMembership({ memberships: [{ actorGroupId: SECURITY_GROUP }] });

    await expect(
      resource.assertCanReview!({
        request: appRequest,
        decision: "rejected" as never,
        actor: actor(BOB),
        userGroupIds: new Set([SECURITY_GROUP])
      })
    ).resolves.toBeUndefined();
  });

  it("leaves a legacy project-level request to the approver snapshot", async () => {
    const { deps, resource } = setupMembership();

    await expect(
      resource.assertCanReview!({
        request: { id: "approval-1", projectId: PROJECT_ID, scopeType: null, scopeId: null } as never,
        decision: "approved" as never,
        actor: actor(BOB),
        userGroupIds: new Set()
      })
    ).resolves.toBeUndefined();
    expect(deps.membershipDAL.find).not.toHaveBeenCalled();
  });

  it("notifies only approvers that are still members of the Application", async () => {
    const { resource } = setupMembership({ memberships: [{ actorUserId: ALICE }, { actorGroupId: SECURITY_GROUP }] });
    const approvers = [
      { type: ApproverType.User, id: ALICE },
      { type: ApproverType.User, id: BOB },
      { type: ApproverType.Group, id: SECURITY_GROUP },
      { type: ApproverType.Group, id: "8c1e2f3a-4b5c-4d6e-8f70-819a2b3c4d05" }
    ];

    await expect(resource.filterActiveApprovers!(appRequest, approvers)).resolves.toEqual([
      { type: ApproverType.User, id: ALICE },
      { type: ApproverType.Group, id: SECURITY_GROUP }
    ]);
  });
});
