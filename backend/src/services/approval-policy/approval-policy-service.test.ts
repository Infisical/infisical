import { createMongoAbility } from "@casl/ability";
import { describe, expect, it, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ResourcePermissionSub } from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApproverType,
  EnforcementLevel
} from "./approval-policy-enums";
import { approvalPolicyServiceFactory } from "./approval-policy-service";
import { TApprovalActor, TApprovalResource } from "./approval-policy-types";
import { certRequestApprovalResourceFactory } from "./cert-request/cert-request-policy-factory";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const APP_ID = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b01";
const ALICE = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b02";
const BOB = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b03";
const POLICY_ID = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b04";
const REQUEST_ID = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b05";

const actorFor = (id: string): TApprovalActor => ({
  id,
  type: ActorType.USER,
  orgId: ORG_ID,
  authMethod: null
});

const allowPolicyManagement = createMongoAbility([
  { action: ["read", "create", "edit", "delete"], subject: ResourcePermissionSub.ApprovalPolicies }
]);

const POLICY_TX = { id: "policy-tx" };
const REACHED_POLICY_WRITE = "reached the policy write";

// Only the collaborators these paths touch; anything else is undefined, so an unexpected reach crashes the test.
const buildService = ({
  applicationMembers = [] as { actorUserId?: string; actorGroupId?: string }[],
  applicationProfileSlugs = ["web-server"],
  storedPolicy = null as Record<string, unknown> | null,
  storedSteps = [] as unknown[],
  storedRuleCount = 0,
  request = null as Record<string, unknown> | null,
  requestSteps = [] as unknown[],
  extraResources = {} as Partial<Record<ApprovalPolicyType, TApprovalResource>>
} = {}) => {
  const membershipDAL = {
    find: vi
      .fn()
      .mockResolvedValue(
        applicationMembers.map((m) => ({ actorUserId: null, actorGroupId: null, isActive: true, ...m }))
      )
  };
  const pkiApplicationProfileDAL = {
    findByApplicationId: vi.fn().mockResolvedValue(applicationProfileSlugs.map((profileSlug) => ({ profileSlug })))
  };

  const certRequestResource = certRequestApprovalResourceFactory({
    approvalPolicyDAL: { findByProjectId: vi.fn() },
    membershipDAL,
    pkiApplicationProfileDAL,
    certificateProfileDAL: { find: vi.fn().mockResolvedValue([]) }
  } as never);

  const deps = {
    approvalPolicyDAL: {
      findById: vi.fn().mockResolvedValue(storedPolicy),
      findByIdForUpdate: vi.fn().mockResolvedValue(storedPolicy),
      findStepsByPolicyId: vi.fn().mockResolvedValue(storedSteps),
      findBypassersByPolicyId: vi.fn().mockResolvedValue([]),
      updateById: vi.fn().mockRejectedValue(new Error(REACHED_POLICY_WRITE)),
      transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(POLICY_TX))
    },
    approvalPolicyStepsDAL: { delete: vi.fn().mockRejectedValue(new Error(REACHED_POLICY_WRITE)) },
    approvalRequestDAL: {
      findById: vi.fn().mockResolvedValue(request),
      findStepsByRequestId: vi.fn().mockResolvedValue(requestSteps),
      update: vi.fn(),
      transaction: vi.fn()
    },
    approvalRequestApprovalsDAL: { create: vi.fn() },
    pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: APP_ID, projectId: PROJECT_ID }) },
    permissionService: {
      getResourcePermission: vi.fn().mockResolvedValue({ permission: allowPolicyManagement }),
      getOrgPermission: vi.fn().mockResolvedValue({})
    },
    licenseService: { getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), pkiApprovals: true })) },
    membershipDAL,
    userGroupMembershipDAL: { findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]) },
    autoApprovalService: {
      findByPolicyIds: vi
        .fn()
        .mockResolvedValue(
          new Map(storedRuleCount ? [[POLICY_ID, { rules: Array.from({ length: storedRuleCount }), inputs: [] }]] : [])
        ),
      validateConfig: vi.fn()
    },
    resources: { [ApprovalPolicyType.CertRequest]: certRequestResource, ...extraResources }
  };

  return { deps, service: approvalPolicyServiceFactory(deps as never) };
};

const createInput = (overrides: Record<string, unknown> = {}) =>
  ({
    scope: ApprovalPolicyScope.PkiApplication,
    scopeId: APP_ID,
    name: "production-cert-approval",
    conditions: [{ profileNames: ["web-server"] }],
    constraints: {},
    steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: ALICE }] }],
    ...overrides
  }) as never;

describe("approvalPolicyService.create", () => {
  it("refuses a certificate policy with no approval steps before writing anything", async () => {
    const { deps, service } = buildService({ applicationMembers: [{ actorUserId: ALICE }] });

    const result = service.create(ApprovalPolicyType.CertRequest, createInput({ steps: [] }), actorFor(ALICE));

    await expect(result).rejects.toThrow(BadRequestError);
    await expect(result).rejects.toThrow(
      "Add at least one approval step. Without one, requests on this policy can never be approved."
    );
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  it("refuses a step that needs more approvals than it has approvers", async () => {
    const { deps, service } = buildService({ applicationMembers: [{ actorUserId: ALICE }] });

    await expect(
      service.create(
        ApprovalPolicyType.CertRequest,
        createInput({ steps: [{ requiredApprovals: 2, approvers: [{ type: ApproverType.User, id: ALICE }] }] }),
        actorFor(ALICE)
      )
    ).rejects.toThrow("Approval step 1 requires 2 approvals but names only 1 approver.");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  it("refuses a profile the Application doesn't have before writing anything", async () => {
    const { deps, service } = buildService({ applicationMembers: [{ actorUserId: ALICE }] });

    await expect(
      service.create(
        ApprovalPolicyType.CertRequest,
        createInput({ conditions: [{ profileNames: ["web-sever"] }] }),
        actorFor(ALICE)
      )
    ).rejects.toThrow("Certificate profile 'web-sever' isn't attached to this Application.");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  it("saves a policy whose profiles and steps are valid", async () => {
    const { deps, service } = buildService({ applicationMembers: [{ actorUserId: ALICE }] });
    deps.approvalPolicyDAL.transaction.mockResolvedValue({ id: POLICY_ID });

    await expect(service.create(ApprovalPolicyType.CertRequest, createInput(), actorFor(ALICE))).resolves.toMatchObject(
      { policy: { id: POLICY_ID } }
    );
    expect(deps.approvalPolicyDAL.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("approvalPolicyService.updateById", () => {
  const storedCertPolicy = {
    id: POLICY_ID,
    type: ApprovalPolicyType.CertRequest,
    projectId: PROJECT_ID,
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: APP_ID,
    enforcementLevel: EnforcementLevel.Hard
  };

  it("refuses new steps that leave a step without approvers", async () => {
    const { deps, service } = buildService({ storedPolicy: storedCertPolicy });

    await expect(
      service.updateById(
        POLICY_ID,
        { steps: [{ name: "Security review", requiredApprovals: 1, approvers: [] }] },
        actorFor(ALICE),
        ApprovalPolicyType.CertRequest
      )
    ).rejects.toThrow("Approval step 1 ('Security review') has no approvers.");
    expect(deps.approvalPolicyStepsDAL.delete).not.toHaveBeenCalled();
  });

  it("refuses new profiles the Application doesn't have", async () => {
    const { deps, service } = buildService({ storedPolicy: storedCertPolicy });

    await expect(
      service.updateById(
        POLICY_ID,
        { conditions: [{ profileNames: ["retired-profile"] }] },
        actorFor(ALICE),
        ApprovalPolicyType.CertRequest
      )
    ).rejects.toThrow("Certificate profile 'retired-profile' isn't attached to this Application.");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  it("doesn't re-check steps or profiles the update leaves alone", async () => {
    const { deps, service } = buildService({ storedPolicy: storedCertPolicy });

    await expect(
      service.updateById(POLICY_ID, { name: "renamed" }, actorFor(ALICE), ApprovalPolicyType.CertRequest)
    ).rejects.toThrow(REACHED_POLICY_WRITE);

    expect(deps.autoApprovalService.findByPolicyIds).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.findStepsByPolicyId).not.toHaveBeenCalled();
  });

  describe("on a policy type with auto-approval", () => {
    const autoApprovalResource = {
      supportsAutoApproval: true,
      assertCanManagePolicy: vi.fn().mockResolvedValue(undefined),
      verifyPolicyActors: vi.fn().mockResolvedValue(undefined)
    } as unknown as TApprovalResource;
    const storedPamPolicy = {
      id: POLICY_ID,
      type: ApprovalPolicyType.PamAccess,
      projectId: PROJECT_ID,
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeId: APP_ID
    };

    it("refuses removing the last auto-approval rule, reading the steps under the policy lock", async () => {
      const { deps, service } = buildService({
        storedPolicy: storedPamPolicy,
        storedSteps: [],
        storedRuleCount: 1,
        extraResources: { [ApprovalPolicyType.PamAccess]: autoApprovalResource }
      });

      await expect(
        service.updateById(
          POLICY_ID,
          { autoApproval: { rules: [], inputs: [] } as never },
          actorFor(ALICE),
          ApprovalPolicyType.PamAccess
        )
      ).rejects.toThrow("Add at least one approval step or an auto-approval rule.");

      // Another edit can clear the steps between an unlocked read and this write, so the read must follow the lock.
      expect(deps.approvalPolicyDAL.findStepsByPolicyId).toHaveBeenCalledWith(POLICY_ID, POLICY_TX);
      expect(deps.approvalPolicyDAL.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        deps.approvalPolicyDAL.findStepsByPolicyId.mock.invocationCallOrder[0]
      );
      expect(deps.approvalPolicyDAL.updateById).not.toHaveBeenCalled();
    });

    it("refuses removing the last step, reading the rules under the policy lock", async () => {
      const { deps, service } = buildService({
        storedPolicy: storedPamPolicy,
        storedRuleCount: 0,
        extraResources: { [ApprovalPolicyType.PamAccess]: autoApprovalResource }
      });

      await expect(
        service.updateById(POLICY_ID, { steps: [] }, actorFor(ALICE), ApprovalPolicyType.PamAccess)
      ).rejects.toThrow("Add at least one approval step or an auto-approval rule.");

      expect(deps.autoApprovalService.findByPolicyIds).toHaveBeenCalledWith([POLICY_ID], POLICY_TX);
      expect(deps.approvalPolicyDAL.findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        deps.autoApprovalService.findByPolicyIds.mock.invocationCallOrder[0]
      );
      expect(deps.approvalPolicyStepsDAL.delete).not.toHaveBeenCalled();
    });

    it("lets steps be removed while stored auto-approval rules can still approve requests", async () => {
      const { service } = buildService({
        storedPolicy: storedPamPolicy,
        storedRuleCount: 1,
        extraResources: { [ApprovalPolicyType.PamAccess]: autoApprovalResource }
      });

      await expect(
        service.updateById(POLICY_ID, { steps: [] }, actorFor(ALICE), ApprovalPolicyType.PamAccess)
      ).rejects.toThrow(REACHED_POLICY_WRITE);
    });
  });
});

describe("approvalPolicyService review by an approver removed from the Application", () => {
  const pendingRequest = {
    id: REQUEST_ID,
    type: ApprovalPolicyType.CertRequest,
    status: ApprovalRequestStatus.Pending,
    currentStep: 1,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: APP_ID,
    policyId: POLICY_ID
  };
  const stepNamingBoth = {
    id: "step-1",
    stepNumber: 1,
    requiredApprovals: 1,
    approvers: [
      { type: ApproverType.User, id: ALICE },
      { type: ApproverType.User, id: BOB }
    ],
    approvals: []
  };

  it("refuses an approval and records nothing", async () => {
    const { deps, service } = buildService({
      applicationMembers: [{ actorUserId: ALICE }],
      request: pendingRequest,
      requestSteps: [stepNamingBoth]
    });

    const result = service.approveRequest(REQUEST_ID, {}, actorFor(BOB), ApprovalPolicyType.CertRequest);

    await expect(result).rejects.toThrow(ForbiddenRequestError);
    await expect(result).rejects.toThrow(
      "You can't review this request because you're no longer a member of its Application."
    );
    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  it("refuses a rejection and records nothing", async () => {
    const { deps, service } = buildService({
      applicationMembers: [{ actorUserId: ALICE }],
      request: pendingRequest,
      requestSteps: [stepNamingBoth]
    });

    await expect(service.rejectRequest(REQUEST_ID, {}, actorFor(BOB), ApprovalPolicyType.CertRequest)).rejects.toThrow(
      "You can't review this request because you're no longer a member of its Application."
    );
    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  it("still lets a current member approve", async () => {
    const { deps, service } = buildService({
      applicationMembers: [{ actorUserId: ALICE }],
      request: pendingRequest,
      requestSteps: [stepNamingBoth]
    });
    deps.approvalRequestDAL.transaction.mockRejectedValue(new Error("reached the write"));

    await expect(
      service.approveRequest(REQUEST_ID, {}, actorFor(ALICE), ApprovalPolicyType.CertRequest)
    ).rejects.toThrow("reached the write");
    expect(deps.approvalRequestDAL.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("approvalPolicyService.listRequests for an approver removed from the Application", () => {
  const LEGACY_REQUEST_ID = "5a0c6d2e-9f13-4b8a-a1c2-3d4e5f6a7b06";
  const pendingRequestNaming = (
    id: string,
    scope: { scopeType: ApprovalPolicyScope | null; scopeId: string | null }
  ) => ({
    id,
    type: ApprovalPolicyType.CertRequest,
    status: ApprovalRequestStatus.Pending,
    currentStep: 1,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    policyId: POLICY_ID,
    requesterId: ALICE,
    ...scope,
    steps: [{ stepNumber: 1, requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: BOB }], approvals: [] }]
  });

  const buildListService = () => {
    const noRead = createMongoAbility([]);
    const certRequestResource = certRequestApprovalResourceFactory({
      approvalPolicyDAL: { findByProjectId: vi.fn() },
      membershipDAL: { find: vi.fn().mockResolvedValue([{ actorUserId: ALICE, actorGroupId: null, isActive: true }]) },
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
      pkiApplicationProfileDAL: { findByApplicationId: vi.fn() },
      certificateProfileDAL: { find: vi.fn() }
    } as never);
    return approvalPolicyServiceFactory({
      approvalPolicyDAL: {
        find: vi.fn().mockResolvedValue([]),
        findBypassersByPolicyIds: vi.fn().mockResolvedValue({})
      },
      approvalRequestDAL: {
        findByProjectId: vi
          .fn()
          .mockResolvedValue([
            pendingRequestNaming(REQUEST_ID, { scopeType: ApprovalPolicyScope.PkiApplication, scopeId: APP_ID }),
            pendingRequestNaming(LEGACY_REQUEST_ID, { scopeType: null, scopeId: null })
          ])
      },
      approvalRequestGrantsDAL: { find: vi.fn().mockResolvedValue([]) },
      pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: APP_ID, projectId: PROJECT_ID }) },
      permissionService: {
        getProjectPermission: vi.fn().mockResolvedValue({ permission: noRead }),
        getResourcePermission: vi.fn().mockResolvedValue({ permission: noRead })
      },
      userGroupMembershipDAL: { findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]) },
      resources: { [ApprovalPolicyType.CertRequest]: certRequestResource }
    } as never);
  };

  it("drops the Application's requests from the project-wide list (Requests page and pending badge)", async () => {
    const { requests } = await buildListService().listRequests(
      ApprovalPolicyType.CertRequest,
      ApprovalPolicyScope.Project,
      PROJECT_ID,
      actorFor(BOB)
    );

    expect(requests.map((request) => request.id)).toEqual([LEGACY_REQUEST_ID]);
  });
});
