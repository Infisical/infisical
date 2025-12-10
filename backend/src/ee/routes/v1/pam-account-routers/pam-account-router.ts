import { z } from "zod";

import { PamFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountOrderBy, PamAccountView } from "@app/ee/services/pam-account/pam-account-enums";
import { SanitizedAwsIamAccountWithResourceSchema } from "@app/ee/services/pam-resource/aws-iam/aws-iam-resource-schemas";
import { SanitizedKubernetesAccountWithResourceSchema } from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
import { SanitizedMySQLAccountWithResourceSchema } from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { GatewayAccessResponseSchema } from "@app/ee/services/pam-resource/pam-resource-schemas";
import { SanitizedPostgresAccountWithResourceSchema } from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { SanitizedSSHAccountWithResourceSchema } from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedAccountSchema = z.union([
  SanitizedSSHAccountWithResourceSchema, // ORDER MATTERS
  SanitizedPostgresAccountWithResourceSchema,
  SanitizedMySQLAccountWithResourceSchema,
  SanitizedKubernetesAccountWithResourceSchema,
  SanitizedAwsIamAccountWithResourceSchema
]);

const ListPamAccountsResponseSchema = z.object({
  accounts: SanitizedAccountSchema.array(),
  folders: PamFoldersSchema.array(),
  totalCount: z.number().default(0),
  folderId: z.string().optional(),
  folderPaths: z.record(z.string(), z.string())
});

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
        projectId: z.string().uuid(),
        accountPath: z.string().trim().default("/").transform(removeTrailingSlash),
        accountView: z.nativeEnum(PamAccountView).default(PamAccountView.Flat),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(100),
        orderBy: z.nativeEnum(PamAccountOrderBy).default(PamAccountOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        search: z.string().trim().optional(),
        filterResourceIds: z
          .string()
          .transform((val) =>
            val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
          .optional()
      }),
      response: {
        200: ListPamAccountsResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, accountPath, accountView, limit, offset, search, orderBy, orderDirection, filterResourceIds } =
        req.query;

      const { accounts, folders, totalCount, folderId, folderPaths } = await server.services.pamAccount.list({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        accountPath,
        accountView,
        limit,
        offset,
        search,
        orderBy,
        orderDirection,
        filterResourceIds
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_LIST,
          metadata: {
            accountCount: accounts.length,
            folderCount: folders.length
          }
        }
      });

      return { accounts, folders, totalCount, folderId, folderPaths } as z.infer<typeof ListPamAccountsResponseSchema>;
    }
  });

  server.route({
    method: "POST",
    url: "/access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Access PAM account",
      body: z.object({
        accountPath: z.string().trim(),
        projectId: z.string().uuid(),
        duration: z
          .string()
          .min(1)
          .transform((val, ctx) => {
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
        200: z.discriminatedUnion("resourceType", [
          // Gateway-based resources (Postgres, MySQL, SSH)
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.Postgres) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.MySQL) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.SSH) }),
          // AWS IAM (no gateway, returns console URL)
          z.object({
            sessionId: z.string(),
            resourceType: z.literal(PamResource.AwsIam),
            consoleUrl: z.string().url(),
            metadata: z.record(z.string(), z.string().optional()).optional()
          })
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // To prevent type errors when accessing req.auth
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "You can only access PAM accounts using JWT auth tokens." });
      }

      const response = await server.services.pamAccount.access(
        {
          actorEmail: req.auth.user.email ?? "",
          actorIp: req.realIp,
          actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
          actorUserAgent: req.auditLogInfo.userAgent ?? "",
          accountPath: req.body.accountPath,
          projectId: req.body.projectId,
          duration: req.body.duration
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId: response.account.id,
            accountPath: req.body.accountPath,
            accountName: response.account.name,
            duration: req.body.duration ? new Date(req.body.duration).toISOString() : undefined
          }
        }
      });

      return response;
    }
  });
};
