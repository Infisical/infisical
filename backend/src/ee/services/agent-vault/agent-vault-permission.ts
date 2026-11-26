import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { delegatedOauthOf, TUserPrincipal } from "@app/lib/auth/principal";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import type { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import type { TAgentVaultSkillBundleDALFactory } from "../agent-vault-skill/agent-vault-skill-bundle-dal";

export type TAgentVaultGrantActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
};

// The services a session can name through these bundles: every project service when every bundle is reached (null),
// otherwise those in one of them. Session creation checks names against it and the services list scopes itself to it,
// so the list offers exactly the services a session accepts.
export const serviceIdsReachedThrough = (
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findIdsInBundles">,
  accessBundleIds: string[] | null
): Promise<string[] | null> =>
  accessBundleIds === null ? Promise.resolve(null) : agentVaultServiceDAL.findIdsInBundles(accessBundleIds);

// The skills a session can name through these bundles, the same rule as its services: every project skill when every
// bundle is reached (null), otherwise those in one of them. Session creation checks names against it and the skills
// list scopes itself to it.
export const skillIdsReachedThrough = (
  agentVaultSkillBundleDAL: Pick<TAgentVaultSkillBundleDALFactory, "findSkillIdsInBundles">,
  accessBundleIds: string[] | null
): Promise<string[] | null> =>
  accessBundleIds === null ? Promise.resolve(null) : agentVaultSkillBundleDAL.findSkillIdsInBundles(accessBundleIds);

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

// For checking another actor's access (session owner, user an identity acts for, member a delegation covers).
// Carries the requester's delegated OAuth scopes but never its assumed privilege, and no auth method (the session
// row stores none).
export const agentVaultActorContext = async (
  {
    actorContextService,
    userDAL,
    identityDAL
  }: {
    actorContextService: Pick<TActorContextService, "forPrincipal">;
    userDAL: Pick<TUserDALFactory, "findById">;
    identityDAL: Pick<TIdentityDALFactory, "findById">;
  },
  { actor, orgId, requester }: { actor: TAgentVaultGrantActor; orgId: string; requester?: TActorContext }
): Promise<TActorContext> => {
  const oauth = delegatedOauthOf(requester?.principal);
  if (actor.type === ActorType.USER) {
    const user = await userDAL.findById(actor.id);
    return actorContextService.forPrincipal({
      principal: { ...agentVaultUserPrincipal(user, actor.id), oauth },
      orgId
    });
  }
  const identity = await identityDAL.findById(actor.id);
  return actorContextService.forPrincipal({
    principal: { type: ActorType.IDENTITY, id: actor.id, name: identity?.name ?? "", isInstanceAdmin: false, oauth },
    orgId
  });
};
