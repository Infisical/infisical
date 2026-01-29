import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { Auth0ClientSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { AwsIamUserSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret";
import { AzureClientSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/azure-client-secret";
import { DatabricksServicePrincipalSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/databricks-service-principal-secret";
import { LdapPasswordRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/ldap-password";
import { MongoDBCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/mongodb-credentials";
import { MsSqlCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { MySqlCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/mysql-credentials";
import { OktaClientSecretRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/okta-client-secret";
import { OpenRouterApiKeyRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/open-router-api-key";
import { OracleDBCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/oracledb-credentials";
import { PostgresCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";
import { RedisCredentialsRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/redis-credentials";
import { SecretRotationV2Schema } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-union-schema";
import { UnixLinuxLocalAccountRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/unix-linux-local-account-rotation";
import { WindowsLocalAccountRotationListItemSchema } from "@app/ee/services/secret-rotation-v2/windows-local-account-rotation";
import { ApiDocsTags, SecretRotations } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SecretRotationV2OptionsSchema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationListItemSchema,
  MsSqlCredentialsRotationListItemSchema,
  MySqlCredentialsRotationListItemSchema,
  OracleDBCredentialsRotationListItemSchema,
  Auth0ClientSecretRotationListItemSchema,
  AzureClientSecretRotationListItemSchema,
  AwsIamUserSecretRotationListItemSchema,
  LdapPasswordRotationListItemSchema,
  OktaClientSecretRotationListItemSchema,
  RedisCredentialsRotationListItemSchema,
  MongoDBCredentialsRotationListItemSchema,
  DatabricksServicePrincipalSecretRotationListItemSchema,
  UnixLinuxLocalAccountRotationListItemSchema,
  WindowsLocalAccountRotationListItemSchema
  OpenRouterApiKeyRotationListItemSchema
]);

export const registerSecretRotationV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretRotationOptions",
      tags: [ApiDocsTags.SecretRotations],
      description: "List the available Secret Rotation Options.",
      response: {
        200: z.object({
          secretRotationOptions: SecretRotationV2OptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const secretRotationOptions = server.services.secretRotationV2.listSecretRotationOptions();
      return { secretRotationOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretRotations",
      tags: [ApiDocsTags.SecretRotations],
      description: "List all the Secret Rotations for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretRotations.LIST().projectId)
      }),
      response: {
        200: z.object({ secretRotations: SecretRotationV2Schema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const secretRotations = await server.services.secretRotationV2.listSecretRotationsByProjectId(
        { projectId },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_ROTATIONS,
          metadata: {
            rotationIds: secretRotations.map((sync) => sync.id),
            count: secretRotations.length
          }
        }
      });

      return { secretRotations };
    }
  });
};
