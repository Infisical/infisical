import { OrgMembershipStatus } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TOnBehalfOfUser } from "../agent-vault-session/agent-vault-session-types";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultDelegationDALFactory } from "./agent-vault-delegation-dal";

export type TOnBehalfOfDeps = {
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
};

export const findCallerDelegation = async (
  { agentVaultDelegationDAL }: Pick<TOnBehalfOfDeps, "agentVaultDelegationDAL">,
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission }
) => {
  if (ctx.actor !== ActorType.IDENTITY) {
    throw new BadRequestError({ message: "Only a machine identity can start a session on behalf of a user" });
  }

  const delegation = await agentVaultDelegationDAL.findForIdentity({ projectId, identityId: ctx.actorId });
  if (!delegation) {
    throw new ForbiddenRequestError({
      message:
        "This machine identity isn't allowed to start sessions on behalf of users. An Agent Vault admin can allow it by setting its delegation under Access Control."
    });
  }
  return delegation;
};

// A user who doesn't exist reads exactly like one the delegation doesn't cover.
export const resolveOnBehalfOfUser = async (
  { agentVaultDelegationDAL, userDAL, orgDAL, permissionService, membershipDAL }: TOnBehalfOfDeps,
  {
    projectId,
    ctx,
    onBehalfOf,
    delegation
  }: {
    projectId: string;
    ctx: TGenericPermission;
    onBehalfOf: TOnBehalfOfUser;
    delegation: Awaited<ReturnType<typeof findCallerDelegation>>;
  }
) => {
  const identifier = onBehalfOf.userId ?? onBehalfOf.userEmail ?? "";
  const notCovered = () =>
    new ForbiddenRequestError({
      message: `This machine identity can't start sessions on behalf of '${identifier}'. Check the user's ID or email, or ask an Agent Vault admin to add them to the identity's delegation.`
    });

  const user = await userDAL.findOne(
    onBehalfOf.userId ? { id: onBehalfOf.userId, isGhost: false } : { username: onBehalfOf.userEmail, isGhost: false }
  );
  if (!user) throw notCovered();

  // Resolve refuses a session whose actor isn't an active, accepted org member, so mint does too.
  const orgMembership = await orgDAL.findEffectiveOrgMembership({
    actorType: ActorType.USER,
    actorId: user.id,
    orgId: ctx.actorOrgId,
    status: OrgMembershipStatus.Accepted
  });
  if (!orgMembership?.isActive) throw notCovered();

  if (!(await agentVaultDelegationDAL.coversUser({ delegation, userId: user.id }))) throw notCovered();

  // The user's own role and grants decide what they reach. actorAuthMethod is null as in resolve: the session row
  // stores no auth method.
  const userCtx: TGenericPermission = {
    actor: ActorType.USER,
    actorId: user.id,
    actorOrgId: ctx.actorOrgId,
    actorAuthMethod: null
  };
  let reachability: Awaited<ReturnType<typeof getAgentVaultReachability>>;
  try {
    reachability = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx: userCtx });
  } catch (error) {
    if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") {
      throw new BadRequestError({
        message: `'${identifier}' doesn't have access to Agent Vault, so no session can be started on their behalf. An Agent Vault admin can add them under Access Control.`
      });
    }
    throw error;
  }
  // Read, the check resolve repeats: the identity starts the session, so the user only needs a live Agent Vault role.
  // Not thrown through CASL: the denial would be recorded against the identity making the request.
  if (
    !reachability.permission.can(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    )
  ) {
    throw new ForbiddenRequestError({
      message: `'${identifier}' doesn't have an active Agent Vault role, so no session can be started on their behalf. An Agent Vault admin can give them one under Access Control.`
    });
  }

  return { user, identifier, accessBundleIds: reachability.accessBundleIds };
};
