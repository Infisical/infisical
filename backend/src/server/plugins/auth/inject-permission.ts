import fp from "fastify-plugin";

import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

// inject permission type needed based on auth extracted
export const injectPermission = fp(async (server) => {
  server.decorateRequest("permission", null);
  server.addHook("onRequest", async (req) => {
    if (!req.auth) return;

    if (req.auth.actor === ActorType.USER) {
      req.permission = {
        type: ActorType.USER,
        id: req.auth.userId,
        orgId: req.auth.orgId, // if the req.auth.authMode is AuthMode.API_KEY, the orgId will be "API_KEY"
        authMethod: req.auth.authMethod, // if the req.auth.authMode is AuthMode.API_KEY, the authMethod will be null
        rootOrgId: req.auth.rootOrgId,
        parentOrgId: req.auth.parentOrgId
      };

      logger.info(
        `injectPermission: Injecting permissions for [permissionsForIdentity=${req.auth.userId}] [type=${ActorType.USER}]`
      );
    } else if (req.auth.actor === ActorType.IDENTITY) {
      req.permission = {
        type: ActorType.IDENTITY,
        id: req.auth.identityId,
        orgId: req.auth.orgId,
        authMethod: null,
        rootOrgId: req.auth.rootOrgId,
        parentOrgId: req.auth.parentOrgId
      };

      logger.info(
        `injectPermission: Injecting permissions for [permissionsForIdentity=${req.auth.identityId}] [type=${ActorType.IDENTITY}]`
      );
    } else if (req.auth.actor === ActorType.SERVICE) {
      req.permission = {
        type: ActorType.SERVICE,
        id: req.auth.serviceTokenId,
        orgId: req.auth.orgId,
        rootOrgId: req.auth.rootOrgId,
        parentOrgId: req.auth.parentOrgId,
        authMethod: null
      };

      logger.info(
        `injectPermission: Injecting permissions for [permissionsForIdentity=${req.auth.serviceTokenId}] [type=${ActorType.SERVICE}]`
      );
    } else if (req.auth.actor === ActorType.SCIM_CLIENT) {
      req.permission = {
        type: ActorType.SCIM_CLIENT,
        id: req.auth.scimTokenId,
        orgId: req.auth.orgId,
        rootOrgId: req.auth.rootOrgId,
        parentOrgId: req.auth.parentOrgId,
        authMethod: null
      };

      logger.info(
        `injectPermission: Injecting permissions for [permissionsForIdentity=${req.auth.scimTokenId}] [type=${ActorType.SCIM_CLIENT}]`
      );
    }
  });
});
