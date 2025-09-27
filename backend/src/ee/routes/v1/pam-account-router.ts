import { z } from "zod";

import { PamFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { SanitizedPostgresAccountWithResourceSchema } from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Use z.union([...]) when more resources are added
const SanitizedAccountSchema = SanitizedPostgresAccountWithResourceSchema;

export const registerPamAccountRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM accounts",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          accounts: SanitizedAccountSchema.array(),
          folders: PamFoldersSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamResource.listAccounts(req.query.projectId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_LIST,
          metadata: {
            accountCount: response.accounts.length,
            folderCount: response.folders.length
          }
        }
      });

      return response;
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Access PAM account",
      params: z.object({
        accountId: z.string().uuid()
      }),
      body: z.object({
        duration: z
          .string()
          .nullable()
          .optional()
          .transform((val, ctx) => {
            if (val === undefined) return undefined;
            if (!val || val === "permanent") return null;
            const parsedMs = ms(val);

            if (typeof parsedMs !== "number" || parsedMs <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid duration format. Must be a positive duration (e.g., '1h', '30m', '2d')."
              });
              return z.NEVER;
            }
            return parsedMs;
          })
      }),
      response: {
        200: z.object({
          sessionId: z.string(),
          resourceType: z.nativeEnum(PamResource),
          relayCertificate: z.string(),
          gatewayCertificate: z.string(),
          relayHost: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "You can only access PAM accounts using JWT auth tokens." });
      }

      const response = await server.services.pamResource.accessAccount(
        {
          accountId: req.params.accountId,
          actorEmail: req.auth.user.email ?? "",
          actorIp: req.realIp,
          actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
          actorUserAgent: req.auditLogInfo.userAgent ?? "",
          ...req.body
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: response.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId: req.params.accountId,
            duration: req.body.duration ? new Date(req.body.duration).toISOString() : undefined
          }
        }
      });

      return response;
    }
  });
};
