import {
  CreateMySQLAccountSchema,
  SanitizedMySQLAccountWithResourceSchema,
  UpdateMySQLAccountSchema
} from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import {
  CreatePostgresAccountSchema,
  SanitizedPostgresAccountWithResourceSchema,
  UpdatePostgresAccountSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";

import { registerPamResourceEndpoints } from "./pam-account-endpoints";

export const PAM_ACCOUNT_REGISTER_ROUTER_MAP: Record<PamResource, (server: FastifyZodProvider) => Promise<void>> = {
  [PamResource.Postgres]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.Postgres,
      accountResponseSchema: SanitizedPostgresAccountWithResourceSchema,
      createAccountSchema: CreatePostgresAccountSchema,
      updateAccountSchema: UpdatePostgresAccountSchema
    });
  },
  [PamResource.MySQL]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.MySQL,
      accountResponseSchema: SanitizedMySQLAccountWithResourceSchema,
      createAccountSchema: CreateMySQLAccountSchema,
      updateAccountSchema: UpdateMySQLAccountSchema
    });
  }
};
