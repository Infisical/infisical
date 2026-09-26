import { z } from "zod";

import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { registerAppConnectionEndpoints } from "@app/server/routes/v1/app-connection-routers/app-connection-endpoints";
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
  registerAppConnectionEndpoints({
    app: AppConnection.AWS,
    server,
    sanitizedResponseSchema: SanitizedAwsConnectionSchema,
    createSchema: AgentVaultAwsConnectionCreateSchema,
    updateSchema: UpdateAwsConnectionSchema,
    productScope: {
      resolveProjectId: (req) => req.internalAgentVaultProjectId,
      operationIdPrefix: "AgentVault",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      descriptions: {
        list: "Lists the AWS connections scoped to Agent Vault",
        get: "Gets an AWS connection scoped to Agent Vault",
        create: "Creates an AWS connection scoped to Agent Vault. Only Agent Vault can use the connection.",
        update: "Updates an AWS connection scoped to Agent Vault",
        delete:
          "Deletes an AWS connection scoped to Agent Vault. If session logs use the connection, switch them to another connection or to none first."
      }
    }
  });
};
