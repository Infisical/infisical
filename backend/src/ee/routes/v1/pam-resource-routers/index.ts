import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import {
  CreatePostgresAccountSchema,
  CreatePostgresResourceSchema,
  PostgresResourceSchema,
  SanitizedPostgresAccountWithResourceSchema,
  UpdatePostgresAccountSchema,
  UpdatePostgresResourceSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";

import { registerPamResourceEndpoints } from "./pam-resource-endpoints";

export const PAM_RESOURCE_REGISTER_ROUTER_MAP: Record<PamResource, (server: FastifyZodProvider) => Promise<void>> = {
  [PamResource.Postgres]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.Postgres,
      resourceResponseSchema: PostgresResourceSchema,
      accountResponseSchema: SanitizedPostgresAccountWithResourceSchema,
      createResourceSchema: CreatePostgresResourceSchema,
      createAccountSchema: CreatePostgresAccountSchema,
      updateResourceSchema: UpdatePostgresResourceSchema,
      updateAccountSchema: UpdatePostgresAccountSchema
    });
  }
};
