import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  AwsIamResourceListItemSchema,
  SanitizedAwsIamResourceSchema
} from "@app/ee/services/pam-resource/aws-iam/aws-iam-resource-schemas";
import {
  MySQLResourceListItemSchema,
  SanitizedMySQLResourceSchema
} from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResourceOrderBy } from "@app/ee/services/pam-resource/pam-resource-enums";
import {
  PostgresResourceListItemSchema,
  SanitizedPostgresResourceSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import {
  SanitizedSSHResourceSchema,
  SSHResourceListItemSchema
} from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import { OrderByDirection } from "@app/lib/types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedResourceSchema = z.union([
  SanitizedPostgresResourceSchema,
  SanitizedMySQLResourceSchema,
  SanitizedSSHResourceSchema,
  SanitizedAwsIamResourceSchema
]);

const ResourceOptionsSchema = z.discriminatedUnion("resource", [
  PostgresResourceListItemSchema,
  MySQLResourceListItemSchema,
  SSHResourceListItemSchema,
  AwsIamResourceListItemSchema
]);

export const registerPamResourceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM resource types",
      response: {
        200: z.object({
          resourceOptions: ResourceOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: () => {
      const resourceOptions = server.services.pamResource.listResourceOptions();

      return { resourceOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM resources",
      querystring: z.object({
        projectId: z.string().uuid(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(100),
        orderBy: z.nativeEnum(PamResourceOrderBy).default(PamResourceOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        search: z.string().trim().optional(),
        filterResourceTypes: z
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
        200: z.object({
          resources: SanitizedResourceSchema.array(),
          totalCount: z.number().default(0)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, limit, offset, search, orderBy, orderDirection, filterResourceTypes } = req.query;

      const { resources, totalCount } = await server.services.pamResource.list({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        limit,
        offset,
        search,
        orderBy,
        orderDirection,
        filterResourceTypes
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_RESOURCE_LIST,
          metadata: {
            count: resources.length
          }
        }
      });

      return { resources, totalCount };
    }
  });
};
