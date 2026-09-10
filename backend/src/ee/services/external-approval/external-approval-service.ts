import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ActionProjectType, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import {
  OrgPermissionExternalApprovalActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";

import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { isActiveRole } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ExternalApprovalRequestStatus } from "./external-approval-enums";
import { EXTERNAL_APPROVAL_APP_CONNECTION_MAP, listExternalApprovalOptions } from "./external-approval-map";
import { TExternalApprovalPolicyDALFactory } from "./external-approval-policy-dal";
import { TExternalApprovalRequestDALFactory } from "./external-approval-request-dal";
import {
  TAuthorizeExternalReviewDTO,
  TCanReviewExternalApprovalsDTO,
  TExternalApprovalDecision,
  TListApproverIdentitiesDTO,
  TResolveExternalApprovalDecisionDTO,
  TValidateExternalApprovalPolicyInputDTO
} from "./external-approval-types";

type TExternalApprovalServiceFactoryDep = {
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  identityDAL: Pick<TIdentityDALFactory, "findOne">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findIdentities">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getOrgPermission" | "getOrgPermissionByRoles"
  >;
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "findById">;
  externalApprovalRequestDAL: Pick<TExternalApprovalRequestDALFactory, "findById" | "updateById">;
};

export type TExternalApprovalServiceFactory = ReturnType<typeof externalApprovalServiceFactory>;

const DECISION_TO_EXTERNAL_STATUS: Record<TExternalApprovalDecision, ExternalApprovalRequestStatus> = {
  [ApprovalStatus.APPROVED]: ExternalApprovalRequestStatus.Approved,
  [ApprovalStatus.REJECTED]: ExternalApprovalRequestStatus.Rejected
};

const FINAL_EXTERNAL_STATUSES: string[] = [
  ExternalApprovalRequestStatus.Approved,
  ExternalApprovalRequestStatus.Rejected
];

const REVIEW_PERMISSION_HINT =
  "Grant it the Review permission on External Approvals through an organization role, then try again.";

const ignoreForbidden = (err: unknown) => {
  if (err instanceof ForbiddenRequestError) return null;
  throw err;
};

type TOrgMembershipRole = { role: string; customRoleSlug?: string | null } & Parameters<typeof isActiveRole>[0];

const toOrgRoleSlug = (role: TOrgMembershipRole) =>
  role.role === OrgMembershipRole.Custom ? role.customRoleSlug : role.role;

export const externalApprovalServiceFactory = ({
  appConnectionService,
  identityDAL,
  membershipIdentityDAL,
  permissionService,
  externalApprovalPolicyDAL,
  externalApprovalRequestDAL
}: TExternalApprovalServiceFactoryDep) => {
  const canReviewExternalApprovals = async ({ actor }: TCanReviewExternalApprovalsDTO) => {
    const orgPermission = await permissionService
      .getOrgPermission({
        actor: actor.type,
        actorId: actor.id,
        orgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        scope: OrganizationActionScope.Any
      })
      .catch(ignoreForbidden);

    return Boolean(
      orgPermission?.permission.can(OrgPermissionExternalApprovalActions.Review, OrgPermissionSubjects.ExternalApproval)
    );
  };

  const validateExternalApprovalPolicyInput = async ({
    input,
    projectId,
    actor
  }: TValidateExternalApprovalPolicyInputDTO) => {
    const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[input.type];
    await appConnectionService.validateAppConnectionUsageById(
      app,
      { connectionId: input.connectionId, projectId },
      actor
    );

    if (!input.approverIdentityId) {
      throw new NotFoundError({
        message: `Approver identity ID is required for external approval policy`
      });
    }

    const identity = await identityDAL.findOne({ id: input.approverIdentityId, orgId: actor.orgId });
    if (!identity) {
      throw new NotFoundError({
        message: `Identity with ID '${input.approverIdentityId}' not found in your organization`
      });
    }

    if (identity.projectId) {
      throw new BadRequestError({
        message: `Identity '${identity.name}' is managed by a project and cannot report approval decisions. Use an organization level machine identity instead.`
      });
    }

    const canReview = await canReviewExternalApprovals({
      actor: { type: ActorType.IDENTITY, id: identity.id, authMethod: null, orgId: actor.orgId }
    });
    if (!canReview) {
      throw new BadRequestError({
        message: `Identity '${identity.name}' cannot report approval decisions. ${REVIEW_PERMISSION_HINT}`
      });
    }
  };

  const listApproverIdentities = async ({ projectId, actor }: TListApproverIdentitiesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const { data: memberships } = await membershipIdentityDAL.findIdentities({
      scopeData: { scope: AccessScope.Organization, orgId: actor.orgId },
      filter: {}
    });

    // project-managed identities hold an org membership too, so the org scope alone does not exclude them
    const orgIdentityMemberships = memberships.filter(({ identity }) => !identity.projectId);

    const activeRoleSlugs = [
      ...new Set(
        orgIdentityMemberships.flatMap((membership) =>
          membership.roles
            .filter(isActiveRole)
            .map(toOrgRoleSlug)
            .filter((slug): slug is string => Boolean(slug))
        )
      )
    ];

    const roleAbilities = activeRoleSlugs.length
      ? await permissionService.getOrgPermissionByRoles(activeRoleSlugs, actor.orgId)
      : [];

    const grantingRoleSlugs = new Set(
      activeRoleSlugs.filter((_, index) =>
        roleAbilities[index].permission.can(
          OrgPermissionExternalApprovalActions.Review,
          OrgPermissionSubjects.ExternalApproval
        )
      )
    );

    return orgIdentityMemberships
      .filter((membership) =>
        membership.roles.some((role) => isActiveRole(role) && grantingRoleSlugs.has(toOrgRoleSlug(role) ?? ""))
      )
      .map(({ identity }) => ({ id: identity.id, name: identity.name, orgId: identity.orgId }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  };

  const authorizeExternalReview = async ({ externalApprovalPolicyId, actor }: TAuthorizeExternalReviewDTO) => {
    const externalApprovalPolicy = await externalApprovalPolicyDAL.findById(externalApprovalPolicyId);
    if (!externalApprovalPolicy) {
      throw new NotFoundError({
        message: `External approval policy with ID '${externalApprovalPolicyId}' not found`
      });
    }

    if (
      actor.type !== ActorType.IDENTITY ||
      !externalApprovalPolicy.approverIdentityId ||
      externalApprovalPolicy.approverIdentityId !== actor.id
    ) {
      throw new ForbiddenRequestError({
        message: "Only the approver identity configured on this external approval policy can report its decision"
      });
    }

    return externalApprovalPolicy;
  };

  const resolveExternalApprovalDecision = async (
    { externalApprovalRequestId, externalId, status }: TResolveExternalApprovalDecisionDTO,
    tx: Knex
  ) => {
    const externalApprovalRequest = await externalApprovalRequestDAL.findById(externalApprovalRequestId, tx);
    if (!externalApprovalRequest) {
      throw new NotFoundError({
        message: `External approval request with ID '${externalApprovalRequestId}' not found`
      });
    }

    const targetStatus = DECISION_TO_EXTERNAL_STATUS[status];

    if (externalApprovalRequest.status && FINAL_EXTERNAL_STATUSES.includes(externalApprovalRequest.status)) {
      if (externalApprovalRequest.status === targetStatus) {
        return { externalApprovalRequest, alreadyFinalized: true as const };
      }
      throw new ConflictError({
        message: "A different decision has already been recorded for this request"
      });
    }

    if (externalApprovalRequest.status === ExternalApprovalRequestStatus.FailedDispatch) {
      throw new BadRequestError({
        message: "The request was never delivered to the external approver, so no decision can be recorded for it"
      });
    }

    if (
      externalApprovalRequest.status !== ExternalApprovalRequestStatus.WaitingApproval ||
      !externalApprovalRequest.externalId
    ) {
      throw new BadRequestError({
        message: "The request has not finished dispatching to the external approver yet. Retry shortly."
      });
    }

    if (externalApprovalRequest.externalId !== externalId) {
      throw new BadRequestError({
        message: "The external ID does not match the external approval request for this access request"
      });
    }

    const updated = await externalApprovalRequestDAL.updateById(
      externalApprovalRequestId,
      { status: targetStatus },
      tx
    );

    return { externalApprovalRequest: updated, alreadyFinalized: false as const };
  };

  return {
    listExternalApprovalOptions,
    canReviewExternalApprovals,
    listApproverIdentities,
    validateExternalApprovalPolicyInput,
    authorizeExternalReview,
    resolveExternalApprovalDecision
  };
};
