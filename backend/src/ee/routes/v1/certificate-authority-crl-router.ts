import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CERTIFICATE_AUTHORITIES } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerCaCrlRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:caId/crl",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get CRL of the CA",
      params: z.object({
        caId: z.string().trim().describe(CERTIFICATE_AUTHORITIES.GET_CRL.caId)
      }),
      response: {
        200: z.object({
          crl: z.string().describe(CERTIFICATE_AUTHORITIES.GET_CRL.crl)
        })
      }
    },
    handler: async (req) => {
      const { crl, ca } = await server.services.certificateAuthorityCrl.getCaCrl({
        caId: req.params.caId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: ca.projectId,
        event: {
          type: EventType.GET_CA_CRL,
          metadata: {
            caId: ca.id,
            dn: ca.dn
          }
        }
      });

      return {
        crl
      };
    }
  });

  // server.route({
  //   method: "GET",
  //   url: "/:caId/crl/rotate",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   schema: {
  //     description: "Rotate CRL of the CA",
  //     params: z.object({
  //       caId: z.string().trim()
  //     }),
  //     response: {
  //       200: z.object({
  //         message: z.string()
  //       })
  //     }
  //   },
  //   handler: async (req) => {
  //     await server.services.certificateAuthority.rotateCaCrl({
  //       caId: req.params.caId,
  //       actor: req.permission.type,
  //       actorId: req.permission.id,
  //       actorAuthMethod: req.permission.authMethod,
  //       actorOrgId: req.permission.orgId
  //     });
  //     return {
  //       message: "Successfully rotated CA CRL"
  //     };
  //   }
  // });
};
