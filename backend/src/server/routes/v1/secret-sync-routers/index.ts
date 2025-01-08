import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerAwsParameterStoreSyncRouter } from "./aws-parameter-store-sync-router";

export * from "./secret-sync-router";

export const SECRET_SYNC_REGISTER_ROUTER_MAP: Record<SecretSync, (server: FastifyZodProvider) => Promise<void>> = {
  [SecretSync.AWSParameterStore]: registerAwsParameterStoreSyncRouter
};
