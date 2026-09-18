import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateWinRMConnectionSchema,
  SanitizedWinRMConnectionSchema,
  UpdateWinRMConnectionSchema
} from "@app/services/app-connection/winrm";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerWinRMConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.WinRM,
    server,
    sanitizedResponseSchema: SanitizedWinRMConnectionSchema,
    createSchema: CreateWinRMConnectionSchema,
    updateSchema: UpdateWinRMConnectionSchema
  });
};
