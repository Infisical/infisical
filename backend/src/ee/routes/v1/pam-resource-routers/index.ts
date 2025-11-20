import {
  CreateMySQLResourceSchema,
  MySQLResourceSchema,
  UpdateMySQLResourceSchema
} from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import {
  CreatePostgresResourceSchema,
  SanitizedPostgresResourceSchema,
  UpdatePostgresResourceSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import {
  CreateSSHResourceSchema,
  SanitizedSSHResourceSchema,
  UpdateSSHResourceSchema
} from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";

import { registerPamResourceEndpoints } from "./pam-resource-endpoints";

export const PAM_RESOURCE_REGISTER_ROUTER_MAP: Record<PamResource, (server: FastifyZodProvider) => Promise<void>> = {
  [PamResource.Postgres]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.Postgres,
      resourceResponseSchema: SanitizedPostgresResourceSchema,
      createResourceSchema: CreatePostgresResourceSchema,
      updateResourceSchema: UpdatePostgresResourceSchema
    });
  },
  [PamResource.MySQL]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.MySQL,
      resourceResponseSchema: MySQLResourceSchema,
      createResourceSchema: CreateMySQLResourceSchema,
      updateResourceSchema: UpdateMySQLResourceSchema
    });
  },
  [PamResource.SSH]: async (server: FastifyZodProvider) => {
    registerPamResourceEndpoints({
      server,
      resourceType: PamResource.SSH,
      resourceResponseSchema: SanitizedSSHResourceSchema,
      createResourceSchema: CreateSSHResourceSchema,
      updateResourceSchema: UpdateSSHResourceSchema
    });
  }
};
