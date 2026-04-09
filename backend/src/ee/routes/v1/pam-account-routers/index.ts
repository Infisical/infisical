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
  CreateMongoDBAccountSchema,
  SanitizedMongoDBAccountWithResourceSchema,
  UpdateMongoDBAccountSchema
} from "@app/ee/services/pam-resource/mongodb/mongodb-resource-schemas";
import {
  CreateMsSQLAccountSchema,
  SanitizedMsSQLAccountWithResourceSchema,
  UpdateMsSQLAccountSchema
} from "@app/ee/services/pam-resource/mssql/mssql-resource-schemas";
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
import {
  CreateWindowsAccountSchema,
  SanitizedWindowsAccountWithResourceSchema,
  UpdateWindowsAccountSchema
} from "@app/ee/services/pam-resource/windows-server/windows-server-resource-schemas";

import { registerPamAccountEndpoints } from "./pam-account-endpoints";

export const PAM_ACCOUNT_REGISTER_ROUTER_MAP: Record<PamResource, (server: FastifyZodProvider) => Promise<void>> = {
  [PamResource.Postgres]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.Postgres,
      accountResponseSchema: SanitizedPostgresAccountWithResourceSchema,
      createAccountSchema: CreatePostgresAccountSchema,
      updateAccountSchema: UpdatePostgresAccountSchema
    });
  },
  [PamResource.MySQL]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.MySQL,
      accountResponseSchema: SanitizedMySQLAccountWithResourceSchema,
      createAccountSchema: CreateMySQLAccountSchema,
      updateAccountSchema: UpdateMySQLAccountSchema
    });
  },
  [PamResource.MsSQL]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.MsSQL,
      accountResponseSchema: SanitizedMsSQLAccountWithResourceSchema,
      createAccountSchema: CreateMsSQLAccountSchema,
      updateAccountSchema: UpdateMsSQLAccountSchema
    });
  },
  [PamResource.Redis]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.Redis,
      accountResponseSchema: SanitizedRedisAccountWithResourceSchema,
      createAccountSchema: CreateRedisAccountSchema,
      updateAccountSchema: UpdateRedisAccountSchema
    });
  },
  [PamResource.MongoDB]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.MongoDB,
      accountResponseSchema: SanitizedMongoDBAccountWithResourceSchema,
      createAccountSchema: CreateMongoDBAccountSchema,
      updateAccountSchema: UpdateMongoDBAccountSchema
    });
  },
  [PamResource.SSH]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.SSH,
      accountResponseSchema: SanitizedSSHAccountWithResourceSchema,
      createAccountSchema: CreateSSHAccountSchema,
      updateAccountSchema: UpdateSSHAccountSchema
    });
  },
  [PamResource.Kubernetes]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.Kubernetes,
      accountResponseSchema: SanitizedKubernetesAccountWithResourceSchema,
      createAccountSchema: CreateKubernetesAccountSchema,
      updateAccountSchema: UpdateKubernetesAccountSchema
    });
  },
  [PamResource.AwsIam]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.AwsIam,
      accountResponseSchema: SanitizedAwsIamAccountWithResourceSchema,
      createAccountSchema: CreateAwsIamAccountSchema,
      updateAccountSchema: UpdateAwsIamAccountSchema
    });
  },
  [PamResource.Windows]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamResource.Windows,
      accountResponseSchema: SanitizedWindowsAccountWithResourceSchema,
      createAccountSchema: CreateWindowsAccountSchema,
      updateAccountSchema: UpdateWindowsAccountSchema
    });
  }
};
