import { AppConnection } from "@app/lib/app-connections";
import {
  CreateAwsConnectionSchema,
  SanitizedAwsConnectionSchema,
  UpdateAwsConnectionSchema
} from "@app/lib/app-connections/aws";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAwsConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.AWS,
    server,
    responseSchema: SanitizedAwsConnectionSchema,
    createSchema: CreateAwsConnectionSchema,
    updateSchema: UpdateAwsConnectionSchema
  });
