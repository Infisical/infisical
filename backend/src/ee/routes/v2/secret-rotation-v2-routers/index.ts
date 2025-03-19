import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerPostgresLoginCredentialsRotationRouter } from "./humanitec-sync-router";

export * from "./secret-rotation-v2-router";

export const SECRET_ROTATION_REGISTER_ROUTER_MAP: Record<
  SecretRotation,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [SecretRotation.PostgresLoginCredentials]: registerPostgresLoginCredentialsRotationRouter
};
