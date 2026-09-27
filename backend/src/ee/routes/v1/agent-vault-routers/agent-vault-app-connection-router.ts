import { FastifyRequest } from "fastify";
import { z } from "zod";

import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { InternalServerError } from "@app/lib/errors";
import { slugSchema } from "@app/server/lib/schemas";
import {
  buildAppConnectionRouteContext,
  buildCreateAppConnectionRoute,
  buildDeleteAppConnectionRoute,
  buildGetAppConnectionRoute,
  buildListAppConnectionsRoute,
  buildUpdateAppConnectionRoute
} from "@app/server/routes/v1/app-connection-routers/app-connection-endpoints";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  SanitizedAwsConnectionSchema,
  UpdateAwsConnectionSchema,
  ValidateAwsConnectionCredentialsSchema
} from "@app/services/app-connection/aws";

// Agent Vault picks the project itself, so creating a connection only asks for a name, description and AWS credentials.
const AgentVaultAwsConnectionCreateSchema = ValidateAwsConnectionCredentialsSchema.and(
  z.object({
    name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(AppConnection.AWS).name),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(AppConnections.CREATE(AppConnection.AWS).description)
  })
);

export const registerAgentVaultAppConnectionRouter = async (server: FastifyZodProvider) => {
  const ctx = buildAppConnectionRouteContext({
    server,
    app: AppConnection.AWS,
    sanitizedResponseSchema: SanitizedAwsConnectionSchema,
    operationIdPrefix: "AgentVault",
    tags: [ApiDocsTags.AgentVaultAppConnections]
  });

  const resolveScope = (req: FastifyRequest) => {
    const projectId = req.internalAgentVaultProjectId;
    if (!projectId) {
      throw new InternalServerError({
        message:
          "Could not determine which project these AWS Connections belong to. Try again, and contact support if it keeps happening."
      });
    }
    return { projectId };
  };

  buildListAppConnectionsRoute(ctx, { description: "Lists the AWS connections scoped to Agent Vault", resolveScope });
  buildGetAppConnectionRoute(ctx, { description: "Gets an AWS connection scoped to Agent Vault", resolveScope });
  buildCreateAppConnectionRoute(ctx, {
    createSchema: AgentVaultAwsConnectionCreateSchema,
    description: "Creates an AWS connection scoped to Agent Vault. Only Agent Vault can use the connection.",
    resolveScope
  });
  buildUpdateAppConnectionRoute(ctx, {
    updateSchema: UpdateAwsConnectionSchema,
    description: "Updates an AWS connection scoped to Agent Vault",
    resolveScope
  });
  buildDeleteAppConnectionRoute(ctx, {
    description:
      "Deletes an AWS connection scoped to Agent Vault. If session logs use the connection, switch them to another connection or to none first.",
    resolveScope
  });
};
