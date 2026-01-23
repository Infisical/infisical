import { z } from "zod";

import { TrustedIpsSchema } from "@app/db/schemas/trusted-ips";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerTrustedIpRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/trusted-ips",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          trustedIps: TrustedIpsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const trustedIps = await server.services.trustedIp.listIpsByProjectId({
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId
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
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
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
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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
