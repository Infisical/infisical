import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionActions,
  ProjectPermissionExternalApprovalActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
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
      ? [{ action: ProjectPermissionExternalApprovalActions.Review, subject: ProjectPermissionSub.ExternalApproval }]
      : []
  );

const makeValidationService = ({
  canReview = false,
  permissionError
}: {
  canReview?: boolean;
  permissionError?: Error;
} = {}) => {
  const permissionService = {
    getProjectPermission: permissionError
      ? vi.fn().mockRejectedValue(permissionError)
      : vi.fn().mockResolvedValue({ permission: reviewAbility(canReview) })
  };
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: {
      findOne: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "servicenow-bot" })
    } as never,
    permissionService: permissionService as never,
    externalApprovalPolicyDAL: {} as never,
    externalApprovalRequestDAL: {} as never
  });
  return { service, permissionService };
};

const validate = (service: ReturnType<typeof makeValidationService>["service"]) =>
  service.validateExternalApprovalPolicyInput({ input: POLICY_INPUT, projectId: PROJECT_ID, actor: identityActor });

describe("externalApprovalService.validateExternalApprovalPolicyInput", () => {
  test("accepts an approver identity granted Review on a role in the project", async () => {
    const { service, permissionService } = makeValidationService({ canReview: true });
    await expect(validate(service)).resolves.toBeUndefined();
    expect(permissionService.getProjectPermission).toHaveBeenCalledWith({
      actor: ActorType.IDENTITY,
      actorId: IDENTITY_ID,
      projectId: PROJECT_ID,
      actorAuthMethod: null,
      actorOrgId: identityActor.orgId,
      actionProjectType: "secret-manager"
    });
  });

  test("rejects an approver identity in the project that does not hold Review", async () => {
    const { service } = makeValidationService();
    await expect(validate(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("rejects an approver identity that is not a member of the project", async () => {
    const { service } = makeValidationService({
      permissionError: new ForbiddenRequestError({
        name: "ProjectMembershipNotFound",
        message: "You are not a member of this project"
      })
    });
    await expect(validate(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("surfaces an unrelated permission lookup failure unchanged", async () => {
    const { service } = makeValidationService({ permissionError: new NotFoundError({ message: "no project" }) });
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

const identityRow = (id: string, name: string, projectId: string | null = null) => ({
  id,
  name,
  orgId: identityActor.orgId,
  projectId
});

const projectReviewer = (id: string, name: string, canReview = true) => ({
  id,
  name,
  permission: reviewAbility(canReview)
});

const makeApproverListService = ({
  callerCanReadPolicies = true,
  identityPermissions = [] as ReturnType<typeof projectReviewer>[],
  identityRows = [] as ReturnType<typeof identityRow>[]
} = {}) => {
  const rowsById = new Map(
    [...identityPermissions.map(({ id, name }) => identityRow(id, name)), ...identityRows].map((row) => [row.id, row])
  );
  const find = vi
    .fn()
    .mockImplementation(async ({ $in }: { $in: { id: string[] } }) =>
      $in.id.map((id) => rowsById.get(id)).filter(Boolean)
    );
  const getProjectPermissions = vi
    .fn()
    .mockResolvedValue({ userPermissions: [], identityPermissions, groupPermissions: [] });
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: { findOne: vi.fn(), find } as never,
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(
          callerCanReadPolicies
            ? [{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretApproval }]
            : []
        )
      }),
      getProjectPermissions
    } as never,
    externalApprovalPolicyDAL: {} as never,
    externalApprovalRequestDAL: {} as never
  });
  return { service, find, getProjectPermissions };
};

describe("externalApprovalService.listApproverIdentities", () => {
  test("returns only the project identities whose role grants Review, sorted by name", async () => {
    const { service, getProjectPermissions } = makeApproverListService({
      identityPermissions: [
        projectReviewer("id-plain", "plain-bot", false),
        projectReviewer("id-reviewer-b", "zeta-bot"),
        projectReviewer("id-reviewer-a", "alpha-bot")
      ]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([
      identityRow("id-reviewer-a", "alpha-bot"),
      identityRow("id-reviewer-b", "zeta-bot")
    ]);
    expect(getProjectPermissions).toHaveBeenCalledWith(PROJECT_ID, identityActor.orgId);
  });

  test("reports the owning scope of each identity so the picker can tell same-named identities apart", async () => {
    const { service, find } = makeApproverListService({
      identityPermissions: [
        projectReviewer("id-org", "servicenow-identity"),
        projectReviewer("id-project", "servicenow-identity")
      ],
      identityRows: [identityRow("id-project", "servicenow-identity", PROJECT_ID)]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([
      { id: "id-org", name: "servicenow-identity", orgId: identityActor.orgId, projectId: null },
      { id: "id-project", name: "servicenow-identity", orgId: identityActor.orgId, projectId: PROJECT_ID }
    ]);
    expect(find).toHaveBeenCalledWith({ $in: { id: ["id-org", "id-project"] } });
  });

  test("returns an empty list without a lookup when no project identity can review", async () => {
    const { service, find } = makeApproverListService({
      identityPermissions: [projectReviewer("id-plain", "plain-bot", false)]
    });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  test("refuses a caller that cannot read the project's approval policies", async () => {
    const { service, getProjectPermissions } = makeApproverListService({ callerCanReadPolicies: false });

    await expect(service.listApproverIdentities({ projectId: PROJECT_ID, actor: identityActor })).rejects.toThrow();
    expect(getProjectPermissions).not.toHaveBeenCalled();
  });
});
