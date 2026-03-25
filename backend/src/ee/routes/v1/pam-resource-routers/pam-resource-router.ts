import { z } from "zod";

import { PamAccountDependenciesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ActiveDirectoryResourceListItemSchema,
  SanitizedActiveDirectoryResourceSchema
} from "@app/ee/services/pam-resource/active-directory/active-directory-resource-schemas";
import {
  AwsIamResourceListItemSchema,
  SanitizedAwsIamResourceSchema
} from "@app/ee/services/pam-resource/aws-iam/aws-iam-resource-schemas";
import {
  KubernetesResourceListItemSchema,
  SanitizedKubernetesResourceSchema
} from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
import {
  MongoDBResourceListItemSchema,
  SanitizedMongoDBResourceSchema
} from "@app/ee/services/pam-resource/mongodb/mongodb-resource-schemas";
import {
  MsSQLResourceListItemSchema,
  SanitizedMsSQLResourceSchema
} from "@app/ee/services/pam-resource/mssql/mssql-resource-schemas";
import {
  MySQLResourceListItemSchema,
  SanitizedMySQLResourceSchema
} from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResource, PamResourceOrderBy } from "@app/ee/services/pam-resource/pam-resource-enums";
import {
  PostgresResourceListItemSchema,
  SanitizedPostgresResourceSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import {
  RedisResourceListItemSchema,
  SanitizedRedisResourceSchema
} from "@app/ee/services/pam-resource/redis/redis-resource-schemas";
import {
  SanitizedSSHResourceSchema,
  SSHResourceListItemSchema
} from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import {
  SanitizedWindowsResourceSchema,
  WindowsResourceListItemSchema
} from "@app/ee/services/pam-resource/windows-server/windows-server-resource-schemas";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedResourceSchema = z.discriminatedUnion("resourceType", [
  SanitizedPostgresResourceSchema,
  SanitizedMySQLResourceSchema,
  SanitizedMsSQLResourceSchema,
  SanitizedSSHResourceSchema,
  SanitizedKubernetesResourceSchema,
  SanitizedAwsIamResourceSchema,
  SanitizedRedisResourceSchema,
  SanitizedMongoDBResourceSchema,
  SanitizedWindowsResourceSchema,
  SanitizedActiveDirectoryResourceSchema
]);

const SanitizedResourceWithFavoriteSchema = z.intersection(
  SanitizedResourceSchema,
  z.object({ isFavorite: z.boolean().default(false) })
);

const ResourceOptionsSchema = z.discriminatedUnion("resource", [
  PostgresResourceListItemSchema,
  MySQLResourceListItemSchema,
  MsSQLResourceListItemSchema,
  SSHResourceListItemSchema,
  KubernetesResourceListItemSchema,
  AwsIamResourceListItemSchema,
  RedisResourceListItemSchema,
  MongoDBResourceListItemSchema,
  WindowsResourceListItemSchema,
  ActiveDirectoryResourceListItemSchema
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
          resources: SanitizedResourceWithFavoriteSchema.array(),
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

  server.route({
    method: "POST",
    url: "/search",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Search PAM resources",
      body: z.object({
        projectId: z.string().uuid(),
        offset: z.number().min(0).default(0),
        limit: z.number().min(1).max(100).default(100),
        orderBy: z.nativeEnum(PamResourceOrderBy).default(PamResourceOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        search: z.string().trim().optional(),
        filterResourceTypes: z.array(z.string()).optional(),
        metadata: z
          .array(
            z.object({
              key: z.string().trim().min(1).max(255),
              value: z.string().trim().max(1020).optional()
            })
          )
          .optional()
      }),
      response: {
        200: z.object({
          resources: SanitizedResourceWithFavoriteSchema.array(),
          totalCount: z.number().default(0)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, limit, offset, search, orderBy, orderDirection, filterResourceTypes, metadata } = req.body;

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
        filterResourceTypes,
        metadataFilter: metadata
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
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

  server.route({
    method: "GET",
    url: "/:resourceType/:resourceId/dependencies",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getPamResourceDependencies",
      description: "List dependencies that run on this resource",
      params: z.object({
        resourceType: z.nativeEnum(PamResource),
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          dependencies: PamAccountDependenciesSchema.extend({
            accountName: z.string().nullable()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const dependencies = await server.services.pamDiscoverySource.getResourceDependencies({
        resourceId: req.params.resourceId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { dependencies };
    }
  });

  server.route({
    method: "PUT",
    url: "/favorites",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Set a PAM resource favorite status",
      body: z.object({
        projectId: z.string().uuid(),
        resourceId: z.string().uuid(),
        isFavorite: z.boolean()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, resourceId, isFavorite } = req.body;

      await server.services.pamResource.setUserResourceFavorite({
        projectId,
        resourceId,
        isFavorite,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { message: isFavorite ? "Resource added to favorites" : "Resource removed from favorites" };
    }
  });
};
