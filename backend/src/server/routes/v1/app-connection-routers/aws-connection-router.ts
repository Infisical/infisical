import { z } from "zod";

import { isValidAwsRegion } from "@app/lib/aws/region";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAwsConnectionSchema,
  SanitizedAwsConnectionSchema,
  UpdateAwsConnectionSchema
} from "@app/services/app-connection/aws";
import { AwsPartition } from "@app/services/app-connection/provisioning-template/aws/aws-partitions";
import { ProvisioningTemplateSchema } from "@app/services/app-connection/provisioning-template/provisioning-template-types";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAwsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AWS,
    server,
    sanitizedResponseSchema: SanitizedAwsConnectionSchema,
    createSchema: CreateAwsConnectionSchema,
    updateSchema: UpdateAwsConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: "/provisioning-template",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getAwsProvisioningTemplate",
      querystring: z.object({
        projectId: z.string().uuid().optional(),
        partition: z
          .string()
          .regex(/^aws(-[a-z0-9]+)*$/, "Partition must look like aws, aws-us-gov or aws-cn")
          .max(32)
          .default(AwsPartition.Commercial),
        region: z
          .string()
          .refine((region) => isValidAwsRegion(region), "Region must look like us-east-1")
          .optional(),
        useCases: z
          .string()
          .max(1024)
          .default("")
          .transform((value) => value.split(",").filter(Boolean))
          .refine(
            (ids) => ids.length <= 50 && ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)),
            "Use cases must be up to 50 comma-separated kebab-case IDs"
          ),
        roleName: z
          .string()
          .regex(/^[\w+=,.@-]{1,64}$/, "Role name must be 1-64 letters, digits, or +=,.@_-")
          .optional(),
        stackName: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9-]{0,127}$/, "Stack name must start with a letter and use letters, digits, or -")
          .optional()
      }),
      response: {
        200: z.object({
          provisioningTemplate: ProvisioningTemplateSchema.nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId, ...query } = req.query;

      const provisioningTemplate = await server.services.provisioningTemplate.getProvisioningTemplate(
        AppConnection.AWS,
        { projectId, query },
        req.permission
      );

      return { provisioningTemplate };
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/provisioning-template",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getAwsConnectionProvisioningTemplate",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        useCases: z
          .string()
          .max(1024)
          .transform((value) => value.split(",").filter(Boolean))
          .refine(
            (ids) => ids.length >= 1 && ids.length <= 50 && ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)),
            "Use cases must be 1 to 50 comma-separated kebab-case IDs"
          )
          .describe("The Use cases the role should cover afterwards, as comma-separated IDs."),
        region: z
          .string()
          .refine((region) => isValidAwsRegion(region), "Region must look like us-east-1")
          .optional()
          .describe("The stack's region. Only used when the connection has no recorded region.")
      }),
      response: {
        200: z.object({
          provisioningTemplate: ProvisioningTemplateSchema.nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const provisioningTemplate = await server.services.provisioningTemplate.getConnectionProvisioningTemplate(
        AppConnection.AWS,
        { connectionId: req.params.connectionId, query: req.query },
        req.permission
      );

      return { provisioningTemplate };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/kms-keys`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAwsKmsKeys",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        region: z.nativeEnum(AWSRegion),
        destination: z.enum([SecretSync.AWSParameterStore, SecretSync.AWSSecretsManager])
      }),
      response: {
        200: z.object({
          kmsKeys: z.object({ alias: z.string(), id: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const kmsKeys = await server.services.appConnection.aws.listKmsKeys(
        {
          connectionId,
          ...req.query
        },
        req.permission
      );

      return { kmsKeys };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/users`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAwsIamUsers",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          iamUsers: z
            .object({
              UserName: z.string(),
              Arn: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const iamUsers = await server.services.appConnection.aws.listIamUsers(
        {
          connectionId
        },
        req.permission
      );

      return {
        iamUsers: iamUsers.map((user) => ({
          UserName: user.UserName ?? "",
          Arn: user.Arn ?? ""
        }))
      };
    }
  });
};
