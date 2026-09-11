import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateEasyDNSConnectionSchema,
  SanitizedEasyDNSConnectionSchema,
  UpdateEasyDNSConnectionSchema
} from "@app/services/app-connection/easydns/easydns-connection-schema";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerEasyDNSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.EasyDNS,
    server,
    sanitizedResponseSchema: SanitizedEasyDNSConnectionSchema,
    createSchema: CreateEasyDNSConnectionSchema,
    updateSchema: UpdateEasyDNSConnectionSchema
  });
};
