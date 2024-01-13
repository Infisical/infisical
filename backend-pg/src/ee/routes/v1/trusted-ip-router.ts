import { z } from "zod";

import { TrustedIpsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerTrustedIpRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/trusted-ips",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId,
        actor: req.permission.type,
        actorId: req.permission.id
      });
      return { trustedIps };
    }
  });

  server.route({
    url: "/:workspaceId/trusted-ips",
    method: "POST",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId,
        actor: req.permission.type,
        actorId: req.permission.id,
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
    url: "/:workspaceId/trusted-ips/:trustedIpId",
    method: "PATCH",
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
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
        projectId: req.params.workspaceId,
        actor: req.permission.type,
        actorId: req.permission.id,
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
    url: "/:workspaceId/trusted-ips/:trustedIpId",
    method: "DELETE",
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
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
        projectId: req.params.workspaceId,
        actor: req.permission.type,
        actorId: req.permission.id,
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
