import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLinearConnectionSchema,
  SanitizedLinearConnectionSchema,
  UpdateLinearConnectionSchema
} from "@app/services/app-connection/linear";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLinearConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Linear,
    server,
    sanitizedResponseSchema: SanitizedLinearConnectionSchema,
    createSchema: CreateLinearConnectionSchema,
    updateSchema: UpdateLinearConnectionSchema
  });
};
