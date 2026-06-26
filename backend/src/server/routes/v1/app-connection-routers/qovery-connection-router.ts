import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateQoveryConnectionSchema,
  SanitizedQoveryConnectionSchema,
  UpdateQoveryConnectionSchema
} from "@app/services/app-connection/qovery";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerQoveryConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Qovery,
    server,
    sanitizedResponseSchema: SanitizedQoveryConnectionSchema,
    createSchema: CreateQoveryConnectionSchema,
    updateSchema: UpdateQoveryConnectionSchema
  });
};
