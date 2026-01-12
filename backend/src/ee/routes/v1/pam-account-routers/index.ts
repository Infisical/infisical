import {
  CreateAwsIamAccountSchema,
  SanitizedAwsIamAccountWithResourceSchema,
  UpdateAwsIamAccountSchema
} from "@app/ee/services/pam-resource/aws-iam/aws-iam-resource-schemas";
import {
  CreateKubernetesAccountSchema,
  SanitizedKubernetesAccountWithResourceSchema,
  UpdateKubernetesAccountSchema
} from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
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
import {
  CreateRedisAccountSchema,
  SanitizedRedisAccountWithResourceSchema,
  UpdateRedisAccountSchema
} from "@app/ee/services/pam-resource/redis/redis-resource-schemas";
import {
  CreateSSHAccountSchema,
  SanitizedSSHAccountWithResourceSchema,
  UpdateSSHAccountSchema
} from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";

import { registerPamAccountEndpoints } from "./pam-account-endpoints";

export const PAM_ACCOUNT_REGISTER_ROUTER_MAP: Record<PamResource, (server: FastifyZodProvider) => Promise<void>> = {
  [PamResource.Postgres]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.Postgres,
      accountResponseSchema: SanitizedPostgresAccountWithResourceSchema,
      createAccountSchema: CreatePostgresAccountSchema,
      updateAccountSchema: UpdatePostgresAccountSchema
    });
  },
  [PamResource.MySQL]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.MySQL,
      accountResponseSchema: SanitizedMySQLAccountWithResourceSchema,
      createAccountSchema: CreateMySQLAccountSchema,
      updateAccountSchema: UpdateMySQLAccountSchema
    });
  },
  [PamResource.Redis]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.Redis,
      accountResponseSchema: SanitizedRedisAccountWithResourceSchema,
      createAccountSchema: CreateRedisAccountSchema,
      updateAccountSchema: UpdateRedisAccountSchema
    });
  },
  [PamResource.SSH]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.SSH,
      accountResponseSchema: SanitizedSSHAccountWithResourceSchema,
      createAccountSchema: CreateSSHAccountSchema,
      updateAccountSchema: UpdateSSHAccountSchema
    });
  },
  [PamResource.Kubernetes]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.Kubernetes,
      accountResponseSchema: SanitizedKubernetesAccountWithResourceSchema,
      createAccountSchema: CreateKubernetesAccountSchema,
      updateAccountSchema: UpdateKubernetesAccountSchema
    });
  },
  [PamResource.AwsIam]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      resourceType: PamResource.AwsIam,
      accountResponseSchema: SanitizedAwsIamAccountWithResourceSchema,
      createAccountSchema: CreateAwsIamAccountSchema,
      updateAccountSchema: UpdateAwsIamAccountSchema
    });
  }
};
