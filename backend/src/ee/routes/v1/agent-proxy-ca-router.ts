import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export const registerAgentProxyCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      response: {
        200: z.object({
          certificate: z.string(),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm),
          issuedAt: z.date(),
          expiration: z.date(),
          serialNumber: z.string()
        })
      }
    },
    handler: async (req) => {
      return server.services.agentProxyCa.getRootCa(req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/sign",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      body: z.object({
        publicKey: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          certificate: z.string(),
          issuedAt: z.date(),
          expiration: z.date(),
          serialNumber: z.string()
        })
      }
    },
    handler: async (req) => {
      const intermediateCa = await server.services.agentProxyCa.signIntermediate(req.permission, req.body.publicKey);
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.SIGN_AGENT_PROXY_INTERMEDIATE_CA,
          metadata: {
            serialNumber: intermediateCa.serialNumber,
            expiration: intermediateCa.expiration.toISOString()
          }
        }
      });
      return intermediateCa;
    }
  });
};
