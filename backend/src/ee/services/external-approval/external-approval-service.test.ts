import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionExternalApprovalActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { ExternalApprovalRequestStatus, ExternalApprovalType } from "./external-approval-enums";
import { externalApprovalServiceFactory } from "./external-approval-service";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const IDENTITY_ID = "33333333-3333-4333-8333-333333333333";
const EXTERNAL_ID = "sn-sys-id-1";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const CONNECTION_ID = "55555555-5555-4555-8555-555555555555";

const identityActor: OrgServiceActor = {
  type: ActorType.IDENTITY,
  id: IDENTITY_ID,
  authMethod: null,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

const makeService = (policyPatch: Record<string, unknown> = {}, requestPatch: Record<string, unknown> = {}) => {
  const externalApprovalPolicyDAL = {
    findById: vi.fn().mockResolvedValue({ id: POLICY_ID, approverIdentityId: IDENTITY_ID }),
    ...policyPatch
  };
  const externalApprovalRequestDAL = {
    findById: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      status: ExternalApprovalRequestStatus.WaitingApproval,
      externalId: EXTERNAL_ID
    }),
    updateById: vi
      .fn<(id: string, patch: Record<string, unknown>, tx?: unknown) => Promise<Record<string, unknown>>>()
      .mockImplementation(async (_id, patch) => ({ id: REQUEST_ID, ...patch })),
    ...requestPatch
  };
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: { findOne: vi.fn() } as never,
    membershipIdentityDAL: { findIdentities: vi.fn() } as never,
    permissionService: { getProjectPermission: vi.fn() } as never,
    externalApprovalPolicyDAL: externalApprovalPolicyDAL as never,
    externalApprovalRequestDAL: externalApprovalRequestDAL as never
  });
  return { service, externalApprovalPolicyDAL, externalApprovalRequestDAL };
};

const POLICY_INPUT = {
  type: ExternalApprovalType.ServiceNow,
  connectionId: CONNECTION_ID,
  approverIdentityId: IDENTITY_ID
};

const reviewAbility = (canReview: boolean) =>
  createMongoAbility(
    canReview
      ? [{ action: OrgPermissionExternalApprovalActions.Review, subject: OrgPermissionSubjects.ExternalApproval }]
      : []
  );

const makeValidationService = ({
  canReview = false,
  permissionError,
  ownedByProjectId = null
}: {
  canReview?: boolean;
  permissionError?: Error;
  ownedByProjectId?: string | null;
} = {}) => {
  const permissionService = {
    getOrgPermission: permissionError
      ? vi.fn().mockRejectedValue(permissionError)
      : vi.fn().mockResolvedValue({ permission: reviewAbility(canReview) }),
    getProjectPermission: vi.fn()
  };
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: {
      findOne: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "servicenow-bot", projectId: ownedByProjectId })
    } as never,
    membershipIdentityDAL: { findIdentities: vi.fn() } as never,
    permissionService: permissionService as never,
    externalApprovalPolicyDAL: {} as never,
    externalApprovalRequestDAL: {} as never
  });
  return { service, permissionService };
};

const validate = (service: ReturnType<typeof makeValidationService>["service"]) =>
  service.validateExternalApprovalPolicyInput({ input: POLICY_INPUT, projectId: PROJECT_ID, actor: identityActor });

describe("externalApprovalService.validateExternalApprovalPolicyInput", () => {
  test("accepts an approver identity granted Review on an organization role, without consulting the project", async () => {
    const { service, permissionService } = makeValidationService({ canReview: true });
    await expect(validate(service)).resolves.toBeUndefined();
    expect(permissionService.getOrgPermission).toHaveBeenCalledWith({
      actor: ActorType.IDENTITY,
      actorId: IDENTITY_ID,
      orgId: identityActor.orgId,
      actorAuthMethod: null,
      actorOrgId: identityActor.orgId,
      scope: "any"
    });
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("rejects a project managed identity before it reaches the permission check", async () => {
    const { service, permissionService } = makeValidationService({
      canReview: true,
      ownedByProjectId: PROJECT_ID
    });
    await expect(validate(service)).rejects.toBeInstanceOf(BadRequestError);
    expect(permissionService.getOrgPermission).not.toHaveBeenCalled();
  });

  test("rejects an approver identity in the org that does not hold Review", async () => {
    const { service } = makeValidationService();
    await expect(validate(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("rejects an approver identity that is not a member of the organization", async () => {
    const { service } = makeValidationService({
      permissionError: new ForbiddenRequestError({ message: "You are not a member of this organization" })
    });
    await expect(validate(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("surfaces an unrelated permission lookup failure unchanged", async () => {
    const { service } = makeValidationService({ permissionError: new NotFoundError({ message: "no org" }) });
    await expect(validate(service)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("externalApprovalService.authorizeExternalReview", () => {
  test("returns the policy when the calling identity is the configured approver", async () => {
    const { service } = makeService();
    const policy = await service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor });
    expect(policy.id).toBe(POLICY_ID);
  });

  test("rejects a user actor even if its id matches", async () => {
    const { service } = makeService();
    await expect(
      service.authorizeExternalReview({
        externalApprovalPolicyId: POLICY_ID,
        actor: { ...identityActor, type: ActorType.USER }
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("rejects a different identity", async () => {
    const { service } = makeService();
    await expect(
      service.authorizeExternalReview({
        externalApprovalPolicyId: POLICY_ID,
        actor: { ...identityActor, id: "44444444-4444-4444-8444-444444444444" }
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("rejects when the policy has no approver identity", async () => {
    const { service } = makeService({
      findById: vi.fn().mockResolvedValue({ id: POLICY_ID, approverIdentityId: null })
    });
    await expect(
      service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("404s when the policy does not exist", async () => {
    const { service } = makeService({ findById: vi.fn().mockResolvedValue(undefined) });
    await expect(
      service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("externalApprovalService.resolveExternalApprovalDecision", () => {
  const tx = { marker: "tx" } as never;
  const baseDto = {
    externalApprovalRequestId: REQUEST_ID,
    externalId: EXTERNAL_ID
  };

  test("records an approval on the external row inside the given transaction", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    const result = await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx);

    expect(result.alreadyFinalized).toBe(false);
    expect(externalApprovalRequestDAL.findById).toHaveBeenCalledWith(REQUEST_ID, tx);
    expect(externalApprovalRequestDAL.updateById).toHaveBeenCalledTimes(1);
    const [id, patch, passedTx] = externalApprovalRequestDAL.updateById.mock.calls[0];
    expect(id).toBe(REQUEST_ID);
    expect(patch).toEqual({ status: ExternalApprovalRequestStatus.Approved });
    expect(passedTx).toBe(tx);
  });

  test("maps a rejection to the external Rejected status", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.REJECTED }, tx);

    const [, patch] = externalApprovalRequestDAL.updateById.mock.calls[0];
    expect(patch.status).toBe(ExternalApprovalRequestStatus.Rejected);
  });

  test("replaying the same decision is a no-op", async () => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      {
        findById: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: ExternalApprovalRequestStatus.Approved,
          externalId: EXTERNAL_ID
        })
      }
    );

    const result = await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx);

    expect(result.alreadyFinalized).toBe(true);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("a conflicting decision after finalization is a 409", async () => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      {
        findById: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: ExternalApprovalRequestStatus.Approved,
          externalId: EXTERNAL_ID
        })
      }
    );

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.REJECTED }, tx)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test.each([
    [ExternalApprovalRequestStatus.PendingDispatch, EXTERNAL_ID],
    [ExternalApprovalRequestStatus.WaitingApproval, null],
    [ExternalApprovalRequestStatus.FailedDispatch, EXTERNAL_ID]
  ])("refuses a decision while the row is %s with externalId %s", async (status, externalId) => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      { findById: vi.fn().mockResolvedValue({ id: REQUEST_ID, status, externalId }) }
    );

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx)
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("refuses a mismatched external id without folding case", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    await expect(
      service.resolveExternalApprovalDecision(
        { ...baseDto, externalId: EXTERNAL_ID.toUpperCase(), status: ApprovalStatus.APPROVED },
        tx
      )
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("404s when the external row is missing", async () => {
    const { service } = makeService({}, { findById: vi.fn().mockResolvedValue(undefined) });

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

const orgAbility = (rules: RawRuleOf<MongoAbility<OrgPermissionSet>>[]) =>
  createMongoAbility<OrgPermissionSet>(rules, { conditionsMatcher });

const REVIEWER_ROLE_SLUG = "external-reviewer";

const ABILITY_BY_ROLE_SLUG: Record<string, MongoAbility<OrgPermissionSet>> = {
  [OrgMembershipRole.Admin]: orgAbility(orgAdminPermissions as RawRuleOf<MongoAbility<OrgPermissionSet>>[]),
  [OrgMembershipRole.Member]: orgAbility(orgMemberPermissions as RawRuleOf<MongoAbility<OrgPermissionSet>>[]),
  [REVIEWER_ROLE_SLUG]: orgAbility([
    { action: OrgPermissionExternalApprovalActions.Review, subject: OrgPermissionSubjects.ExternalApproval }
  ] as RawRuleOf<MongoAbility<OrgPermissionSet>>[])
};

type TMembershipRoleFixture = {
  role: string;
  customRoleSlug?: string | null;
  isTemporary?: boolean;
  temporaryAccessEndTime?: Date | null;
};

const membership = (
  id: string,
  name: string,
  roles: TMembershipRoleFixture[],
  ownedByProjectId: string | null = null
) => ({
  identity: { id, name, orgId: identityActor.orgId, projectId: ownedByProjectId },
  roles: roles.map((role) => ({ isTemporary: false, ...role }))
});

const approver = (id: string, name: string) => ({ id, name, orgId: identityActor.orgId });

const makeApproverListService = ({
  callerCanReadPolicies = true,
  memberships = [] as ReturnType<typeof membership>[]
} = {}) => {
  const findIdentities = vi.fn().mockResolvedValue({ data: memberships, totalCount: memberships.length });
  const getOrgPermissionByRoles = vi
    .fn()
    .mockImplementation(async (slugs: string[]) => slugs.map((slug) => ({ permission: ABILITY_BY_ROLE_SLUG[slug] })));
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: { findOne: vi.fn() } as never,
    membershipIdentityDAL: { findIdentities } as never,
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(
          callerCanReadPolicies
            ? [{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretApproval }]
            : []
        )
      }),
      getOrgPermissionByRoles
    } as never,
    externalApprovalPolicyDAL: {} as never,
    externalApprovalRequestDAL: {} as never
  });
  return { service, findIdentities, getOrgPermissionByRoles };
};

describe("externalApprovalService.listApproverIdentities", () => {
  test("returns only the identities whose org role grants Review, sorted by name", async () => {
    const { service, findIdentities, getOrgPermissionByRoles } = makeApproverListService({
      memberships: [
        membership("id-member", "member-bot", [{ role: OrgMembershipRole.Member }]),
        membership("id-admin-b", "zeta-admin-bot", [{ role: OrgMembershipRole.Admin }]),
        membership("id-admin-a", "alpha-admin-bot", [{ role: OrgMembershipRole.Admin }])
      ]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([
      approver("id-admin-a", "alpha-admin-bot"),
      approver("id-admin-b", "zeta-admin-bot")
    ]);
    expect(findIdentities).toHaveBeenCalledWith({
      scopeData: { scope: AccessScope.Organization, orgId: identityActor.orgId },
      filter: {}
    });
    expect(getOrgPermissionByRoles).toHaveBeenCalledTimes(1);
    expect(getOrgPermissionByRoles).toHaveBeenCalledWith(
      [OrgMembershipRole.Member, OrgMembershipRole.Admin],
      identityActor.orgId
    );
  });

  test("includes an identity granted Review through a custom org role", async () => {
    const { service } = makeApproverListService({
      memberships: [
        membership("id-custom", "custom-bot", [{ role: OrgMembershipRole.Custom, customRoleSlug: REVIEWER_ROLE_SLUG }])
      ]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([
      approver("id-custom", "custom-bot")
    ]);
  });

  test("excludes an identity whose only granting role has expired", async () => {
    const { service, getOrgPermissionByRoles } = makeApproverListService({
      memberships: [
        membership("id-expired", "expired-bot", [
          { role: OrgMembershipRole.Admin, isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) }
        ]),
        membership("id-member", "member-bot", [{ role: OrgMembershipRole.Member }])
      ]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([]);
    expect(getOrgPermissionByRoles).toHaveBeenCalledWith([OrgMembershipRole.Member], identityActor.orgId);
  });

  test("excludes a project managed identity even when its org role grants Review", async () => {
    const { service, getOrgPermissionByRoles } = makeApproverListService({
      memberships: [
        membership("id-owned-by-project", "project-bot", [{ role: OrgMembershipRole.Admin }], PROJECT_ID),
        membership("id-org", "org-bot", [{ role: OrgMembershipRole.Admin }])
      ]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([
      approver("id-org", "org-bot")
    ]);
    expect(getOrgPermissionByRoles).toHaveBeenCalledWith([OrgMembershipRole.Admin], identityActor.orgId);
  });

  test("returns an empty list without resolving roles when the org has no identities", async () => {
    const { service, getOrgPermissionByRoles } = makeApproverListService();

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([]);
    expect(getOrgPermissionByRoles).not.toHaveBeenCalled();
  });

  test("refuses a caller that cannot read the project's approval policies", async () => {
    const { service, findIdentities } = makeApproverListService({ callerCanReadPolicies: false });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).rejects.toThrow();
    expect(findIdentities).not.toHaveBeenCalled();
  });
});
