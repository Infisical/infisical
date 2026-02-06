import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureKeyVaultConnectionSchema,
  SanitizedAzureKeyVaultConnectionSchema,
  UpdateAzureKeyVaultConnectionSchema
} from "@app/services/app-connection/azure-key-vault";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureKeyVaultConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureKeyVault,
    server,
    sanitizedResponseSchema: SanitizedAzureKeyVaultConnectionSchema,
    createSchema: CreateAzureKeyVaultConnectionSchema,
    updateSchema: UpdateAzureKeyVaultConnectionSchema
  });
};
