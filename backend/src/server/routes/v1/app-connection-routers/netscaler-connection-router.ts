import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateNetScalerConnectionSchema,
  SanitizedNetScalerConnectionSchema,
  UpdateNetScalerConnectionSchema
} from "@app/services/app-connection/netscaler";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerNetScalerConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.NetScaler,
    server,
    sanitizedResponseSchema: SanitizedNetScalerConnectionSchema,
    createSchema: CreateNetScalerConnectionSchema,
    updateSchema: UpdateNetScalerConnectionSchema
  });
};
