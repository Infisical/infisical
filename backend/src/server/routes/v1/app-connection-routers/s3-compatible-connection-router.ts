import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateS3CompatibleConnectionSchema,
  SanitizedS3CompatibleConnectionSchema,
  UpdateS3CompatibleConnectionSchema
} from "@app/services/app-connection/s3-compatible";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerS3CompatibleConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.S3Compatible,
    server,
    sanitizedResponseSchema: SanitizedS3CompatibleConnectionSchema,
    createSchema: CreateS3CompatibleConnectionSchema,
    updateSchema: UpdateS3CompatibleConnectionSchema
  });
};
