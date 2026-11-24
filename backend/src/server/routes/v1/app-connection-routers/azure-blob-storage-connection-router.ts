import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureBlobStorageConnectionSchema,
  SanitizedAzureBlobStorageConnectionSchema,
  UpdateAzureBlobStorageConnectionSchema
} from "@app/services/app-connection/azure-blob-storage";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureBlobStorageConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureBlobStorage,
    server,
    sanitizedResponseSchema: SanitizedAzureBlobStorageConnectionSchema,
    createSchema: CreateAzureBlobStorageConnectionSchema,
    updateSchema: UpdateAzureBlobStorageConnectionSchema
  });
};
