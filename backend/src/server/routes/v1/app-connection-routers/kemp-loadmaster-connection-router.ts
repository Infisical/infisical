import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateKempLoadMasterConnectionSchema,
  SanitizedKempLoadMasterConnectionSchema,
  UpdateKempLoadMasterConnectionSchema
} from "@app/services/app-connection/kemp-loadmaster";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerKempLoadMasterConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.KempLoadMaster,
    server,
    sanitizedResponseSchema: SanitizedKempLoadMasterConnectionSchema,
    createSchema: CreateKempLoadMasterConnectionSchema,
    updateSchema: UpdateKempLoadMasterConnectionSchema
  });
};
