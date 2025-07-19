import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDigitalOceanConnectionSchema,
  SanitizedDigitalOceanConnectionSchema,
  UpdateDigitalOceanConnectionSchema
} from "@app/services/app-connection/digital-ocean";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDigitalOceanConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.DigitalOcean,
    server,
    createSchema: CreateDigitalOceanConnectionSchema,
    updateSchema: UpdateDigitalOceanConnectionSchema,
    sanitizedResponseSchema: SanitizedDigitalOceanConnectionSchema
  });
};
