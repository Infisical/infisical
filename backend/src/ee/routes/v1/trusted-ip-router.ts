import { z } from "zod";

import { TrustedIpsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

export const registerTrustedIpRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/trusted-ips",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTrustedIps",
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          trustedIps: TrustedIpsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const trustedIps = await server.services.trustedIp.listIpsByProjectId({
        projectId: req.params.projectId,
        actor: req.permission
      });
      return { trustedIps };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/trusted-ips",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "addTrustedIp",
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        ipAddress: z.string().trim(),
        comment: z.string().trim().default(""),
        isActive: z.boolean()
      }),
      response: {
        200: z.object({
          trustedIp: TrustedIpsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { trustedIp, project } = await server.services.trustedIp.addProjectIp({
        projectId: req.params.projectId,
        actor: req.permission,
        ...req.body
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: project.orgId,
        projectId: project.id,
        event: {
          type: EventType.ADD_TRUSTED_IP,
          metadata: {
            trustedIpId: trustedIp.id.toString(),
            ipAddress: trustedIp.ipAddress,
            prefix: trustedIp.prefix as number
          }
        }
      });
      return { trustedIp };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/trusted-ips/:trustedIpId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateTrustedIp",
      params: z.object({
        projectId: z.string().trim(),
        trustedIpId: z.string().trim()
      }),
      body: z.object({
        ipAddress: z.string().trim(),
        comment: z.string().trim().default("")
      }),
      response: {
        200: z.object({
          trustedIp: TrustedIpsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { trustedIp, project } = await server.services.trustedIp.updateProjectIp({
        projectId: req.params.projectId,
        actor: req.permission,
        trustedIpId: req.params.trustedIpId,
        ...req.body
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: project.orgId,
        projectId: project.id,
        event: {
          type: EventType.UPDATE_TRUSTED_IP,
          metadata: {
            trustedIpId: trustedIp.id.toString(),
            ipAddress: trustedIp.ipAddress,
            prefix: trustedIp.prefix as number
          }
        }
      });
      return { trustedIp };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/trusted-ips/:trustedIpId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteTrustedIp",
      params: z.object({
        projectId: z.string().trim(),
        trustedIpId: z.string().trim()
      }),
      response: {
        200: z.object({
          trustedIp: TrustedIpsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { trustedIp, project } = await server.services.trustedIp.deleteProjectIp({
        projectId: req.params.projectId,
        actor: req.permission,
        trustedIpId: req.params.trustedIpId
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: project.orgId,
        projectId: project.id,
        event: {
          type: EventType.DELETE_TRUSTED_IP,
          metadata: {
            trustedIpId: trustedIp.id.toString(),
            ipAddress: trustedIp.ipAddress,
            prefix: trustedIp.prefix as number
          }
        }
      });
      return { trustedIp };
    }
  });
};
