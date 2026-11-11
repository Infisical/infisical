import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { TAgentVaultDomain } from "@app/domains/agent-vault/agent-vault/ce/module";
import type { TActorContext, TActorContexts } from "@app/domains/lib/actor-context";
import { ProjectPermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TUserPrincipal } from "@app/lib/auth/principal";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

export type TAgentVaultPermission = {
  permission: ProjectPermission;
  isAdmin: boolean;
};

export type TAgentVaultReachability = TAgentVaultPermission & {
  accessBundleIds: string[] | null;
};

export type TAgentVaultGrantActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
};

type TProjectsDep = Pick<TProjectsDomain, "getProjectPermission">;
type TAgentVaultDep = Pick<TAgentVaultDomain, "getAccessBundlePermission">;

// null reaches every bundle, so intersecting with it returns the other side unchanged.
export const intersectAccessBundleIds = (a: string[] | null, b: string[] | null): string[] | null => {
  if (a === null) return b;
  if (b === null) return a;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
};

export const agentVaultUserPrincipal = (
  user: { id: string; username: string; email?: string | null; superAdmin?: boolean | null } | undefined,
  userId: string
): TUserPrincipal => ({
  type: ActorType.USER,
  id: userId,
  username: user?.username ?? "",
  email: user?.email ?? null,
  authMethod: null,
  isSuperAdmin: Boolean(user?.superAdmin)
});

// The context for checking another actor's Agent Vault access (a session's owner, the user an identity acts for, a
// member a delegation covers). It carries none of the caller's OAuth scopes or assumed privilege, and no auth method,
// since the session row stores none.
export const agentVaultActorContext = async (
  {
    actorContexts,
    userDAL,
    identityDAL
  }: {
    actorContexts: Pick<TActorContexts, "forPrincipal">;
    userDAL: Pick<TUserDALFactory, "findById">;
    identityDAL: Pick<TIdentityDALFactory, "findById">;
  },
  { actor, orgId }: { actor: TAgentVaultGrantActor; orgId: string }
): Promise<TActorContext> => {
  if (actor.type === ActorType.USER) {
    const user = await userDAL.findById(actor.id);
    return actorContexts.forPrincipal(agentVaultUserPrincipal(user, actor.id), orgId);
  }
  const identity = await identityDAL.findById(actor.id);
  return actorContexts.forPrincipal(
    { type: ActorType.IDENTITY, id: actor.id, name: identity?.name ?? "", isInstanceAdmin: false },
    orgId
  );
};

export const getAgentVaultPermission = async (
  { projectsDomain }: { projectsDomain: TProjectsDep },
  { projectId, ctx }: { projectId: string; ctx: TActorContext }
): Promise<TAgentVaultPermission> => {
  const permission = await projectsDomain.getProjectPermission({
    actor: ctx,
    projectId,
    type: ProjectType.AgentVault
  });
  return { permission, isAdmin: permission.hasRole({ slug: ProjectMembershipRole.Admin }) };
};

// A service-layer filter rather than a CASL condition: conditions interpolate only identity.id,
// username and metadata.
export const getAgentVaultReachability = async (
  { agentVaultDomain }: { agentVaultDomain: TAgentVaultDep },
  { projectId, ctx }: { projectId: string; ctx: TActorContext }
): Promise<TAgentVaultReachability> => {
  const { project, isAdmin, reachableAccessBundleIds } = await agentVaultDomain.getAccessBundlePermission({
    actor: ctx,
    projectId
  });
  return { permission: project, isAdmin, accessBundleIds: reachableAccessBundleIds };
};

/**
 * Reachability, plus the bundles the actor holds through a grant whatever their role. For a member the two are the
 * same; for an admin, who reaches every bundle, the granted ones are what "mine" means.
 */
export const getAgentVaultGrantedReachability = async (
  { agentVaultDomain }: { agentVaultDomain: TAgentVaultDep },
  { projectId, ctx }: { projectId: string; ctx: TActorContext }
): Promise<TAgentVaultReachability & { grantedAccessBundleIds: string[] }> => {
  const { project, isAdmin, reachableAccessBundleIds, grantedAccessBundleIds } =
    await agentVaultDomain.getAccessBundlePermission({ actor: ctx, projectId });
  return { permission: project, isAdmin, accessBundleIds: reachableAccessBundleIds, grantedAccessBundleIds };
};
