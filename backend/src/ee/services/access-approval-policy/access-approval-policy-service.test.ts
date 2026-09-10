import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { EnforcementLevel } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { ExternalApprovalType } from "../external-approval/external-approval-enums";
import { accessApprovalPolicyServiceFactory } from "./access-approval-policy-service";
import { ApproverType, BypasserType } from "./access-approval-policy-types";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const IDENTITY_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const ORG_ID = "55555555-5555-4555-8555-555555555555";

const BYPASSERS_REJECTED = /Bypassers cannot be set on a policy reviewed by an external approval system/;
const SOFT_ENFORCEMENT_REJECTED = /Soft enforcement cannot be set on a policy reviewed by an external approval system/;
const PENDING_EXTERNAL_REQUESTS_REJECTED = /still awaiting a decision from its external approval system/;
const PENDING_EXTERNAL_REROUTE_REJECTED =
  /before changing the approval service, app connection, or approver identity/;

const EXTERNAL_APPROVAL = {
  type: ExternalApprovalType.ServiceNow,
  connectionId: CONNECTION_ID,
  approverIdentityId: IDENTITY_ID
};

const CURRENT_EXTERNAL_APPROVAL = {
  id: POLICY_ID,
  ...EXTERNAL_APPROVAL
};

const EXTERNAL_POLICY = {
  externalApprovalPolicyId: POLICY_ID,
  externalApproval: CURRENT_EXTERNAL_APPROVAL
};

const BYPASSERS = [{ type: BypasserType.User, id: USER_ID }];
const APPROVERS = [{ type: ApproverType.User, id: USER_ID }];

const ACTOR = {
  actor: ActorType.USER,
  actorId: USER_ID,
  actorAuthMethod: null,
  actorOrgId: ORG_ID,
  actorRootOrgId: ORG_ID,
  actorParentOrgId: ORG_ID
};

const makeService = (policy: Record<string, unknown> = {}, pendingExternalRequests = 0) => {
  const accessApprovalPolicyDAL = {
    findById: vi.fn().mockResolvedValue({
      id: POLICY_ID,
      name: "external policy",
      environments: [],
      externalApprovalPolicyId: null,
      ...policy
    }),
    transaction: vi.fn()
  };
  const projectDAL = { findProjectBySlug: vi.fn() };
  const permissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: createMongoAbility([{ action: "manage", subject: "all" }])
    })
  };
  const accessApprovalRequestDAL = {
    countPendingExternalRequestsByPolicyId: vi.fn().mockResolvedValue(pendingExternalRequests)
  };

  const service = accessApprovalPolicyServiceFactory({
    accessApprovalPolicyDAL: accessApprovalPolicyDAL as never,
    accessApprovalPolicyApproverDAL: {} as never,
    accessApprovalPolicyBypasserDAL: {} as never,
    accessApprovalPolicyEnvironmentDAL: {} as never,
    groupDAL: {} as never,
    permissionService: permissionService as never,
    projectEnvDAL: {} as never,
    projectDAL: projectDAL as never,
    userDAL: {} as never,
    accessApprovalRequestDAL: accessApprovalRequestDAL as never,
    additionalPrivilegeDAL: {} as never,
    accessApprovalRequestReviewerDAL: {} as never,
    externalApprovalService: { validateExternalApprovalPolicyInput: vi.fn() } as never,
    externalApprovalPolicyDAL: {} as never
  });

  return { service, accessApprovalPolicyDAL, projectDAL, permissionService, accessApprovalRequestDAL };
};

type TService = ReturnType<typeof makeService>["service"];

const createPolicy = (service: TService, patch: Record<string, unknown>) =>
  service.createAccessApprovalPolicy({
    ...ACTOR,
    projectSlug: "project-1",
    name: "external policy",
    secretPath: "/",
    environments: ["dev"],
    approvals: 1,
    approvers: [],
    enforcementLevel: EnforcementLevel.Hard,
    allowedSelfApprovals: true,
    ...patch
  } as never);

const updatePolicy = (service: TService, patch: Record<string, unknown>) =>
  service.updateAccessApprovalPolicy({
    ...ACTOR,
    policyId: POLICY_ID,
    approvers: APPROVERS,
    allowedSelfApprovals: true,
    ...patch
  } as never);

describe("access approval policy external approval guards", () => {
  test("rejects bypassers on a policy created with external approval", async () => {
    const { service, projectDAL } = makeService();

    await expect(createPolicy(service, { externalApproval: EXTERNAL_APPROVAL, bypassers: BYPASSERS })).rejects.toThrow(
      BYPASSERS_REJECTED
    );
    expect(projectDAL.findProjectBySlug).not.toHaveBeenCalled();
  });

  test("rejects soft enforcement on a policy created with external approval", async () => {
    const { service } = makeService();

    await expect(
      createPolicy(service, { externalApproval: EXTERNAL_APPROVAL, enforcementLevel: EnforcementLevel.Soft })
    ).rejects.toThrow(SOFT_ENFORCEMENT_REJECTED);
  });

  test("leaves bypassers alone on a policy created without external approval", async () => {
    const { service, projectDAL } = makeService();

    await expect(createPolicy(service, { bypassers: BYPASSERS })).rejects.not.toThrow(BYPASSERS_REJECTED);
    expect(projectDAL.findProjectBySlug).toHaveBeenCalled();
  });

  test("rejects bypassers sent against a policy that is already external", async () => {
    const { service, permissionService } = makeService({ externalApprovalPolicyId: POLICY_ID });

    await expect(updatePolicy(service, { bypassers: BYPASSERS })).rejects.toThrow(BYPASSERS_REJECTED);
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("leaves bypassers alone when the same update detaches external approval", async () => {
    const { service, permissionService } = makeService({ externalApprovalPolicyId: POLICY_ID });

    await expect(updatePolicy(service, { bypassers: BYPASSERS, externalApproval: null })).rejects.not.toThrow(
      BYPASSERS_REJECTED
    );
    expect(permissionService.getProjectPermission).toHaveBeenCalled();
  });

  test("rejects detaching external approval while requests still await an external decision", async () => {
    const { service, accessApprovalPolicyDAL } = makeService({ externalApprovalPolicyId: POLICY_ID }, 2);

    await expect(updatePolicy(service, { externalApproval: null })).rejects.toThrow(
      PENDING_EXTERNAL_REQUESTS_REJECTED
    );
    expect(accessApprovalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("allows detaching external approval when no request awaits an external decision", async () => {
    const { service, accessApprovalRequestDAL } = makeService({ externalApprovalPolicyId: POLICY_ID }, 0);

    await expect(updatePolicy(service, { externalApproval: null })).rejects.not.toThrow(
      PENDING_EXTERNAL_REQUESTS_REJECTED
    );
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).toHaveBeenCalledWith(POLICY_ID);
  });

  test("leaves an external policy alone when the update does not touch external approval", async () => {
    const { service, accessApprovalRequestDAL } = makeService({ externalApprovalPolicyId: POLICY_ID }, 2);

    await expect(updatePolicy(service, {})).rejects.not.toThrow(PENDING_EXTERNAL_REQUESTS_REJECTED);
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).not.toHaveBeenCalled();
  });

  test("skips the pending request check on a policy that was never external", async () => {
    const { service, accessApprovalRequestDAL } = makeService({}, 2);

    await expect(updatePolicy(service, { externalApproval: null })).rejects.not.toThrow(
      PENDING_EXTERNAL_REQUESTS_REJECTED
    );
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).not.toHaveBeenCalled();
  });

  test("rejects changing the app connection while requests still await an external decision", async () => {
    const { service, accessApprovalPolicyDAL } = makeService(EXTERNAL_POLICY, 2);

    await expect(
      updatePolicy(service, {
        externalApproval: { ...EXTERNAL_APPROVAL, connectionId: "66666666-6666-4666-8666-666666666666" }
      })
    ).rejects.toThrow(PENDING_EXTERNAL_REROUTE_REJECTED);
    expect(accessApprovalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects changing the approver identity while requests still await an external decision", async () => {
    const { service, accessApprovalPolicyDAL } = makeService(EXTERNAL_POLICY, 2);

    await expect(
      updatePolicy(service, {
        externalApproval: { ...EXTERNAL_APPROVAL, approverIdentityId: "77777777-7777-4777-8777-777777777777" }
      })
    ).rejects.toThrow(PENDING_EXTERNAL_REROUTE_REJECTED);
    expect(accessApprovalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects changing the approval service while requests still await an external decision", async () => {
    const { service, accessApprovalPolicyDAL } = makeService(EXTERNAL_POLICY, 2);

    await expect(
      updatePolicy(service, {
        externalApproval: { ...EXTERNAL_APPROVAL, type: "other-service" }
      })
    ).rejects.toThrow(PENDING_EXTERNAL_REROUTE_REJECTED);
    expect(accessApprovalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("leaves the same external approval fields alone while requests still await a decision", async () => {
    const { service, accessApprovalRequestDAL } = makeService(EXTERNAL_POLICY, 2);

    await expect(updatePolicy(service, { externalApproval: EXTERNAL_APPROVAL })).rejects.not.toThrow(
      PENDING_EXTERNAL_REQUESTS_REJECTED
    );
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).not.toHaveBeenCalled();
  });

  test("allows changing external approval fields when no request awaits an external decision", async () => {
    const { service, accessApprovalRequestDAL } = makeService(EXTERNAL_POLICY, 0);

    await expect(
      updatePolicy(service, {
        externalApproval: { ...EXTERNAL_APPROVAL, connectionId: "66666666-6666-4666-8666-666666666666" }
      })
    ).rejects.not.toThrow(PENDING_EXTERNAL_REQUESTS_REJECTED);
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).toHaveBeenCalledWith(POLICY_ID);
  });

  test("skips the pending request check when attaching external approval for the first time", async () => {
    const { service, accessApprovalRequestDAL } = makeService({}, 2);

    await expect(updatePolicy(service, { externalApproval: EXTERNAL_APPROVAL })).rejects.not.toThrow(
      PENDING_EXTERNAL_REQUESTS_REJECTED
    );
    expect(accessApprovalRequestDAL.countPendingExternalRequestsByPolicyId).not.toHaveBeenCalled();
  });
});
