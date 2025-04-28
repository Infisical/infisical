import { requestContext } from "@fastify/request-context";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerAssumePrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/assume-privileges",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      body: z.object({
        actorType: z.enum([ActorType.USER, ActorType.IDENTITY]),
        actorId: z.string()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      if (req.auth.authMode === AuthMode.JWT) {
        const payload = await server.services.assumePrivileges.assumeProjectPrivileges({
          targetActorType: req.body.actorType,
          targetActorId: req.body.actorId,
          projectId: req.params.projectId,
          actorPermissionDetails: req.permission,
          tokenVersionId: req.auth.tokenVersionId
        });

        const appCfg = getConfig();
        void res.setCookie("infisical-project-assume-privileges", payload.assumePrivilegesToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED,
          maxAge: 3600 // 1 hour in seconds
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_START,
            metadata: {
              projectId: req.params.projectId,
              requesterEmail: req.auth.user.username,
              requesterId: req.auth.user.id,
              targetActorType: req.body.actorType,
              targetActorId: req.body.actorId,
              duration: "1hr"
            }
          }
        });

        return { message: "Successfully assumed role" };
      }

      throw new BadRequestError({ message: "Invalid auth mode" });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/assume-privileges",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      const assumedPrivilegeDetails = requestContext.get("assumedPrivilegeDetails");
      if (req.auth.authMode === AuthMode.JWT && assumedPrivilegeDetails) {
        const appCfg = getConfig();
        void res.setCookie("infisical-project-assume-privileges", "", {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED,
          expires: new Date(0)
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_END,
            metadata: {
              projectId: req.params.projectId,
              requesterEmail: req.auth.user.username,
              requesterId: req.auth.user.id,
              targetActorId: assumedPrivilegeDetails.actorId,
              targetActorType: assumedPrivilegeDetails.actorType
            }
          }
        });
        return { message: "Successfully exited assumed role" };
      }

      throw new BadRequestError({ message: "Invalid auth mode" });
    }
  });
};
