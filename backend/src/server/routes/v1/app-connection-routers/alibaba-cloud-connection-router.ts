import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAlibabaCloudConnectionSchema,
  SanitizedAlibabaCloudConnectionSchema,
  UpdateAlibabaCloudConnectionSchema
} from "@app/services/app-connection/alibaba-cloud";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAlibabaCloudConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AlibabaCloud,
    server,
    sanitizedResponseSchema: SanitizedAlibabaCloudConnectionSchema,
    createSchema: CreateAlibabaCloudConnectionSchema,
    updateSchema: UpdateAlibabaCloudConnectionSchema
  });
};
