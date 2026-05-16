import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOvhConnectionSchema,
  SanitizedOvhConnectionSchema,
  UpdateOvhConnectionSchema
} from "@app/services/app-connection/ovh";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOvhConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OVH,
    server,
    sanitizedResponseSchema: SanitizedOvhConnectionSchema,
    createSchema: CreateOvhConnectionSchema,
    updateSchema: UpdateOvhConnectionSchema
  });
};
