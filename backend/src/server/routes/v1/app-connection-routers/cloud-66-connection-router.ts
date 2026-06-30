import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCloud66ConnectionSchema,
  SanitizedCloud66ConnectionSchema,
  UpdateCloud66ConnectionSchema
} from "@app/services/app-connection/cloud-66";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCloud66ConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Cloud66,
    server,
    sanitizedResponseSchema: SanitizedCloud66ConnectionSchema,
    createSchema: CreateCloud66ConnectionSchema,
    updateSchema: UpdateCloud66ConnectionSchema
  });
};
