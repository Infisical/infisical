import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateMicrosoftIntuneConnectionSchema,
  SanitizedMicrosoftIntuneConnectionSchema,
  UpdateMicrosoftIntuneConnectionSchema
} from "@app/services/app-connection/microsoft-intune";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerMicrosoftIntuneConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.MicrosoftIntune,
    server,
    sanitizedResponseSchema: SanitizedMicrosoftIntuneConnectionSchema,
    createSchema: CreateMicrosoftIntuneConnectionSchema,
    updateSchema: UpdateMicrosoftIntuneConnectionSchema
  });
};
