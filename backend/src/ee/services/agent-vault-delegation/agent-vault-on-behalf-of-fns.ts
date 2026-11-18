import { OrgMembershipStatus } from "@app/db/schemas";
import { TAccessBundlePermissionService } from "@app/domains/agent-vault/agent-vault/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TOnBehalfOfUser } from "../agent-vault-session/agent-vault-session-types";
import { agentVaultUserPrincipal } from "../agent-vault/agent-vault-permission";
import { TAgentVaultDelegationDALFactory } from "./agent-vault-delegation-dal";

export type TOnBehalfOfDeps = {
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  accessBundlePermissionService: Pick<TAccessBundlePermissionService, "getAccessBundlePermission">;
  actorContextService: Pick<TActorContextService, "forPrincipal">;
};

export const findCallerDelegation = async (
  { agentVaultDelegationDAL }: Pick<TOnBehalfOfDeps, "agentVaultDelegationDAL">,
  { projectId, ctx }: { projectId: string; ctx: TActorContext }
) => {
  if (ctx.principal.type !== ActorType.IDENTITY) {
    throw new BadRequestError({ message: "Only a machine identity can start a session on behalf of a user" });
  }

  const delegation = await agentVaultDelegationDAL.findForIdentity({ projectId, identityId: ctx.principal.id });
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
  { agentVaultDelegationDAL, userDAL, orgDAL, accessBundlePermissionService, actorContextService }: TOnBehalfOfDeps,
  {
    projectId,
    ctx,
    onBehalfOf,
    delegation
  }: {
    projectId: string;
    ctx: TActorContext;
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
    orgId: ctx.org.id,
    status: OrgMembershipStatus.Accepted
  });
  if (!orgMembership?.isActive) throw notCovered();

  if (!(await agentVaultDelegationDAL.coversUser({ delegation, userId: user.id }))) throw notCovered();

  // The user's own role and grants decide what they reach. actorAuthMethod is null as in resolve: the session row
  // stores no auth method.
  let reachability: Awaited<ReturnType<TAccessBundlePermissionService["getAccessBundlePermission"]>>;
  try {
    const userCtx = await actorContextService.forPrincipal({
      principal: agentVaultUserPrincipal(user, user.id),
      orgId: ctx.org.id
    });
    reachability = await accessBundlePermissionService.getAccessBundlePermission({ actor: userCtx, projectId });
  } catch (error) {
    if (error instanceof PermissionDeniedError && error.name === "ProjectMembershipNotFound") {
      throw new BadRequestError({
        message: `'${identifier}' doesn't have access to this Agent Vault project, so no session can be started on their behalf. An Agent Vault admin can add them under Access Control.`
      });
    }
    throw error;
  }
  // Read, the check resolve repeats: the identity starts the session, so the user only needs a live Agent Vault role.
  // Not thrown through CASL: the denial would be recorded against the identity making the request.
  if (
    !reachability.permission.can({
      action: ProjectPermissionAgentVaultSessionActions.Read,
      subject: ProjectPermissionSub.AgentVaultSessions
    })
  ) {
    throw new ForbiddenRequestError({
      message: `'${identifier}' doesn't have an active Agent Vault role, so no session can be started on their behalf. An Agent Vault admin can give them one under Access Control.`
    });
  }

  return { user, identifier, accessBundleIds: reachability.accessBundleIds };
};

// What a session on the user's behalf could use: the bundles both the user and the caller reach. Like minting that
// session, it checks the delegation and then the caller's own bundles before it looks the user up, so a caller granted
// no bundle learns nothing about who is in the org. The lists that offer what such a session accepts share it.
export const findOnBehalfOfListScope = async (
  deps: TOnBehalfOfDeps & {
    accessBundlePermissionService: Pick<
      TAccessBundlePermissionService,
      "getAccessBundlePermission" | "intersectAccessBundleIds"
    >;
  },
  {
    projectId,
    ctx,
    onBehalfOf,
    callerAccessBundleIds
  }: {
    projectId: string;
    ctx: TActorContext;
    onBehalfOf: TOnBehalfOfUser;
    callerAccessBundleIds: string[] | null;
  }
) => {
  const delegation = await findCallerDelegation(deps, { projectId, ctx });
  if (callerAccessBundleIds?.length === 0) return { scopeIds: [] as string[], owner: null };

  const { user, accessBundleIds: userAccessBundleIds } = await resolveOnBehalfOfUser(deps, {
    projectId,
    ctx,
    onBehalfOf,
    delegation
  });
  return {
    scopeIds: deps.accessBundlePermissionService.intersectAccessBundleIds(userAccessBundleIds, callerAccessBundleIds),
    owner: { userId: user.id }
  };
};
