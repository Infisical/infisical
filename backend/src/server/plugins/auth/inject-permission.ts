import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { ActorType, AuthMode } from "@app/lib/auth/actor-types";
import { TPrincipal } from "@app/lib/auth/principal";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { OrgServiceActor } from "@app/lib/types";

import { TAuthMode } from "./inject-identity";

// Who the request acts as, from what inject-identity and inject-assume-privilege already loaded, so permission
// code never reads users or identities again.
const principalFromAuth = (auth: TAuthMode): { principal: TPrincipal; actorId: string } => {
  switch (auth.actor) {
    case ActorType.USER: {
      const assumed = requestContext.get(RequestContextKey.AssumedPrivilegeDetails);
      const oauthScopes = requestContext.get(RequestContextKey.OauthScopes);
      const sessionRootOrgId = requestContext.get(RequestContextKey.UserAuthInfo)?.issuingRootOrgId;
      return {
        actorId: auth.userId,
        principal: {
          type: ActorType.USER,
          id: auth.userId,
          username: auth.user.username,
          email: auth.user.email ?? null,
          authMethod: auth.authMethod,
          isSuperAdmin: Boolean(auth.user.superAdmin),
          isMfaVerified: auth.authMode === AuthMode.API_KEY ? undefined : auth.isMfaVerified,
          sessionRootOrgId,
          oauth:
            auth.authMode === AuthMode.OAUTH && auth.oauthClientId
              ? { clientId: auth.oauthClientId, scopes: oauthScopes }
              : undefined,
          assumed:
            assumed && assumed.requesterId === auth.userId
              ? {
                  projectId: assumed.projectId,
                  actorType: assumed.actorType as ActorType.USER | ActorType.IDENTITY,
                  actorId: assumed.actorId
                }
              : undefined
        }
      };
    }
    case ActorType.IDENTITY: {
      const authInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
      return {
        actorId: auth.identityId,
        principal: {
          type: ActorType.IDENTITY,
          id: auth.identityId,
          name: auth.identityName,
          isInstanceAdmin: Boolean(auth.isInstanceAdmin),
          authInfo: authInfo?.identityId === auth.identityId ? (authInfo as Record<string, unknown>) : undefined
        }
      };
    }
    case ActorType.SERVICE:
      return {
        actorId: auth.serviceTokenId,
        principal: { type: ActorType.SERVICE, id: auth.serviceTokenId, projectId: auth.serviceToken.projectId }
      };
    case ActorType.SCIM_CLIENT:
      return { actorId: auth.scimTokenId, principal: { type: ActorType.SCIM_CLIENT, id: auth.scimTokenId } };
    case ActorType.GATEWAY:
      return { actorId: auth.gatewayId, principal: { type: ActorType.GATEWAY, id: auth.gatewayId } };
    case ActorType.RELAY:
      return { actorId: auth.relayId, principal: { type: ActorType.RELAY, id: auth.relayId } };
    case ActorType.KMIP_SERVER:
      return { actorId: auth.kmipServerId, principal: { type: ActorType.KMIP_SERVER, id: auth.kmipServerId } };
    case ActorType.AGENT_VAULT_PROXY:
      return {
        actorId: auth.agentVaultProxyId,
        principal: { type: ActorType.AGENT_VAULT_PROXY, id: auth.agentVaultProxyId }
      };
    default:
      throw new Error(`injectPermission: unhandled actor type [actor=${(auth as { actor: string }).actor}]`);
  }
};

// Builds req.permission: the actor context (principal, org, plan) and the flat fields services still read.
export const injectPermission = fp(async (server) => {
  server.decorateRequest("permission");
  server.addHook("onRequest", async (req) => {
    if (!req.auth) return;

    const { principal, actorId } = principalFromAuth(req.auth);
    const actorContext = await server.services.actorContexts.forRequest(principal, req.auth.orgId);
    const flat: OrgServiceActor = {
      type: principal.type,
      id: actorId,
      // With the deprecated API key mode orgId is "API_KEY" and authMethod is null.
      orgId: req.auth.orgId,
      authMethod: req.auth.actor === ActorType.USER ? req.auth.authMethod : null,
      rootOrgId: req.auth.rootOrgId,
      parentOrgId: req.auth.parentOrgId
    };
    // Assign, not spread: an unscoped context's org is a getter that must stay unread.
    req.permission = Object.assign(actorContext, flat);

    logger.info(`injectPermission: Injecting permissions for [actorId=${actorId}] [type=${principal.type}]`);
  });
});
