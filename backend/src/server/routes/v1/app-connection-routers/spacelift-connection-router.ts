import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSpaceliftConnectionSchema,
  SanitizedSpaceliftConnectionSchema,
  UpdateSpaceliftConnectionSchema
} from "@app/services/app-connection/spacelift";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSpaceliftConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Spacelift,
    server,
    sanitizedResponseSchema: SanitizedSpaceliftConnectionSchema,
    createSchema: CreateSpaceliftConnectionSchema,
    updateSchema: UpdateSpaceliftConnectionSchema
  });
};
