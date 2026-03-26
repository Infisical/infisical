import { z } from "zod";

import { DomainSsoConnectorsSchema } from "@app/db/schemas";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMethod, AuthMode } from "@app/services/auth/auth-type";

const SanitizedConnectorSchema = DomainSsoConnectorsSchema.omit({ verificationToken: true });

export const registerDomainSsoConnectorRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        domain: z.string().trim().toLowerCase(),
        type: z.string().trim()
      }),
      response: { 200: z.object({ connector: DomainSsoConnectorsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const connector = await server.services.domainSsoConnector.claimDomain({
        domain: req.body.domain,
        ownerOrgId: req.permission.orgId,
        type: req.body.type as AuthMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { connector };
    }
  });

  server.route({
    method: "POST",
    url: "/:connectorId/verify",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ connectorId: z.string().uuid() }),
      response: { 200: z.object({ connector: SanitizedConnectorSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const connector = await server.services.domainSsoConnector.verifyDomain({
        connectorId: req.params.connectorId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { connector };
    }
  });

  server.route({
    method: "POST",
    url: "/:connectorId/takeover",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ connectorId: z.string().uuid() }),
      response: { 200: z.object({ message: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.domainSsoConnector.takeoverDomain({
        connectorId: req.params.connectorId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { message: "Domain takeover complete" };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:connectorId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ connectorId: z.string().uuid() }),
      response: { 200: z.object({ message: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.domainSsoConnector.deleteDomainConnector({
        connectorId: req.params.connectorId,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { message: "Domain connector deleted" };
    }
  });
};
