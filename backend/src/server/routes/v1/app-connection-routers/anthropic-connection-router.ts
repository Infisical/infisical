import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAnthropicConnectionSchema,
  SanitizedAnthropicConnectionSchema,
  UpdateAnthropicConnectionSchema
} from "@app/services/app-connection/anthropic";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAnthropicConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Anthropic,
    server,
    sanitizedResponseSchema: SanitizedAnthropicConnectionSchema,
    createSchema: CreateAnthropicConnectionSchema,
    updateSchema: UpdateAnthropicConnectionSchema
  });
};
