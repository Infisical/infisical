import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSmbConnectionSchema,
  SanitizedSmbConnectionSchema,
  UpdateSmbConnectionSchema
} from "@app/services/app-connection/smb";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSmbConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.SMB,
    server,
    sanitizedResponseSchema: SanitizedSmbConnectionSchema,
    createSchema: CreateSmbConnectionSchema,
    updateSchema: UpdateSmbConnectionSchema
  });
};
