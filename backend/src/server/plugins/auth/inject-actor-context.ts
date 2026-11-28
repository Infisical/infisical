import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { ActorType, AuthMode } from "@app/lib/auth/actor-types";
import { TPrincipal } from "@app/lib/auth/principal";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { OrgServiceActor } from "@app/lib/types";

import { TAuthMode } from "./inject-identity";

// Built from what inject-identity and inject-assume-privilege already loaded, so permission code never re-reads
// users or identities.
const principalFromAuth = (auth: TAuthMode): { principal: TPrincipal; actorId: string } => {
  switch (auth.actorType) {
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
                  actorId: assumed.actorId,
                  actorName: assumed.actorName
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
      throw new Error(`injectActorContext: unhandled actor type [actor=${(auth as { actor: string }).actor}]`);
  }
};

// Builds req.actor: the actor context (who is calling and the org the request is scoped to) plus the flat fields
// services still read. It holds no permissions; permission services build those from it per call.
export const injectActorContext = fp(async (server) => {
  server.decorateRequest("actor");
  server.addHook("onRequest", async (req) => {
    if (!req.auth) return;

    const { principal, actorId } = principalFromAuth(req.auth);
    // Can't hold a user token minted without a sign-in method to the org's sign-in policy.
    if (principal.type === ActorType.USER && principal.authMethod === undefined && req.auth.orgId) {
      throw new UnauthorizedError({ name: "No auth method defined" });
    }
    const {
      actor: actorContext,
      org,
      ssoRefusal
    } = await server.services.actorContextService.forRequest({
      principal,
      // The user session check already read the org; every other actor only knows its id.
      ...("actorOrg" in req.auth ? { org: req.auth.actorOrg } : { orgId: req.auth.orgId })
    });
    // Treat a session the org's sign-in policy no longer allows like an expired one.
    if (ssoRefusal && !req.routeOptions.config?.skipCurrentOrgSsoCheck)
      throw new UnauthorizedError({ name: ssoRefusal.name, message: ssoRefusal.message });
    const flat: OrgServiceActor = {
      type: principal.type,
      id: actorId,
      // Deprecated API key mode has orgId "API_KEY" and a null authMethod.
      orgId: req.auth.orgId,
      authMethod: req.auth.actorType === ActorType.USER ? req.auth.authMethod : null,
      // From the org when there is one, so these can't disagree with actor.org.
      rootOrgId: org?.rootOrgId ?? req.auth.rootOrgId,
      parentOrgId: org?.parentOrgId ?? req.auth.parentOrgId
    };
    // Assign, not spread: an unscoped context's org is a getter that must stay unread.
    req.actor = Object.assign(actorContext, flat);

    logger.info(`injectActorContext: Built actor context for [actorId=${actorId}] [type=${principal.type}]`);
  });
});
