import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateHasuraCloudConnectionSchema,
  SanitizedHasuraCloudConnectionSchema,
  UpdateHasuraCloudConnectionSchema
} from "@app/services/app-connection/hasura-cloud";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerHasuraCloudConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.HasuraCloud,
    server,
    sanitizedResponseSchema: SanitizedHasuraCloudConnectionSchema,
    createSchema: CreateHasuraCloudConnectionSchema,
    updateSchema: UpdateHasuraCloudConnectionSchema
  });
};
