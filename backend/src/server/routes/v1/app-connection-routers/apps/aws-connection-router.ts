import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAwsConnectionSchema,
  SanitizedAwsConnectionSchema,
  UpdateAwsConnectionSchema
} from "@app/services/app-connection/aws";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAwsConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.AWS,
    server,
    responseSchema: SanitizedAwsConnectionSchema,
    createSchema: CreateAwsConnectionSchema,
    updateSchema: UpdateAwsConnectionSchema
  });
