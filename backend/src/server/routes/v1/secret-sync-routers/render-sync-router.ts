import {
  CreateRenderSyncSchema,
  RenderSyncSchema,
  UpdateRenderSyncSchema
} from "@app/services/secret-sync/render/render-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerRenderSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Render,
    server,
    responseSchema: RenderSyncSchema,
    createSchema: CreateRenderSyncSchema,
    updateSchema: UpdateRenderSyncSchema
  });
