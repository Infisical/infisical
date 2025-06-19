import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";
import {
  SanitizedCloudflareConnectionSchema,
  CreateCloudflareConnectionSchema,
  UpdateCloudflareConnectionSchema
} from "@app/services/app-connection/cloudflare/cloudflare-connection-schema";

export const registerCloudflareConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Cloudflare,
    server,
    sanitizedResponseSchema: SanitizedCloudflareConnectionSchema,
    createSchema: CreateCloudflareConnectionSchema,
    updateSchema: UpdateCloudflareConnectionSchema
  });
};
