import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreatePowerDNSConnectionSchema,
  SanitizedPowerDNSConnectionSchema,
  UpdatePowerDNSConnectionSchema
} from "@app/services/app-connection/powerdns/powerdns-connection-schema";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerPowerDNSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.PowerDNS,
    server,
    sanitizedResponseSchema: SanitizedPowerDNSConnectionSchema,
    createSchema: CreatePowerDNSConnectionSchema,
    updateSchema: UpdatePowerDNSConnectionSchema
  });
};
