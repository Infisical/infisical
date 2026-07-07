import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLiteLLMConnectionSchema,
  SanitizedLiteLLMConnectionSchema,
  UpdateLiteLLMConnectionSchema
} from "@app/services/app-connection/litellm";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLiteLLMConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LiteLLM,
    server,
    sanitizedResponseSchema: SanitizedLiteLLMConnectionSchema,
    createSchema: CreateLiteLLMConnectionSchema,
    updateSchema: UpdateLiteLLMConnectionSchema
  });
};
