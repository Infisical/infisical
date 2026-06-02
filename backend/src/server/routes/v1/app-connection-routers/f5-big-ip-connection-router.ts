import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateF5BigIpConnectionSchema,
  SanitizedF5BigIpConnectionSchema,
  UpdateF5BigIpConnectionSchema
} from "@app/services/app-connection/f5-big-ip";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerF5BigIpConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.F5BigIp,
    server,
    sanitizedResponseSchema: SanitizedF5BigIpConnectionSchema,
    createSchema: CreateF5BigIpConnectionSchema,
    updateSchema: UpdateF5BigIpConnectionSchema
  });
};
