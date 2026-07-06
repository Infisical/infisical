import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOpenAIConnectionSchema,
  SanitizedOpenAIConnectionSchema,
  UpdateOpenAIConnectionSchema
} from "@app/services/app-connection/openai";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOpenAIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OpenAI,
    server,
    sanitizedResponseSchema: SanitizedOpenAIConnectionSchema,
    createSchema: CreateOpenAIConnectionSchema,
    updateSchema: UpdateOpenAIConnectionSchema
  });
};
