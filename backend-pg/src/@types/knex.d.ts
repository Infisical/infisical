import { Knex } from "knex";

import {
  TableName,
  TApiKeys,
  TApiKeysInsert,
  TApiKeysUpdate,
  TAuthTokens,
  TAuthTokenSessions,
  TAuthTokenSessionsInsert,
  TAuthTokenSessionsUpdate,
  TAuthTokensUpdate,
  TBackupPrivateKey,
  TBackupPrivateKeyInsert,
  TBackupPrivateKeyUpdate,
  TIncidentContacts,
  TIncidentContactsInsert,
  TIncidentContactsUpdate,
  TIntegrationAuths,
  TIntegrationAuthsInsert,
  TIntegrationAuthsUpdate,
  TIntegrations,
  TIntegrationsInsert,
  TIntegrationsUpdate,
  TOrganizations,
  TOrganizationsInsert,
  TOrganizationsUpdate,
  TOrgMemberships,
  TOrgMembershipsInsert,
  TOrgMembershipsUpdate,
  TOrgRoles,
  TOrgRolesInsert,
  TOrgRolesUpdate,
  TProjectBots,
  TProjectBotsInsert,
  TProjectBotsUpdate,
  TProjectEnvironments,
  TProjectEnvironmentsInsert,
  TProjectEnvironmentsUpdate,
  TProjectKeys,
  TProjectKeysInsert,
  TProjectKeysUpdate,
  TProjectMemberships,
  TProjectMembershipsInsert,
  TProjectMembershipsUpdate,
  TProjectRoles,
  TProjectRolesInsert,
  TProjectRolesUpdate,
  TProjects,
  TProjectsInsert,
  TProjectsUpdate,
  TSecretBlindIndexes,
  TSecretBlindIndexesInsert,
  TSecretBlindIndexesUpdate,
  TSecretFolders,
  TSecretFoldersInsert,
  TSecretFoldersUpdate,
  TSecretImports,
  TSecretImportsInsert,
  TSecretImportsUpdate,
  TSecrets,
  TSecretsInsert,
  TSecretsUpdate,
  TSecretTagJunction,
  TSecretTagJunctionInsert,
  TSecretTagJunctionUpdate,
  TSecretTags,
  TSecretTagsInsert,
  TSecretTagsUpdate,
  TSecretVersions,
  TSecretVersionsInsert,
  TSecretVersionsUpdate,
  TSuperAdmin,
  TSuperAdminInsert,
  TSuperAdminUpdate,
  TUserActions,
  TUserActionsInsert,
  TUserActionsUpdate,
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate,
  TUsers,
  TUsersInsert,
  TUsersUpdate
} from "@app/db/schemas";

declare module "knex/types/tables" {
  interface Tables {
    [TableName.Users]: Knex.CompositeTableType<TUsers, TUsersInsert, TUsersUpdate>;
    [TableName.UserEncryptionKey]: Knex.CompositeTableType<
      TUserEncryptionKeys,
      TUserEncryptionKeysInsert,
      TUserEncryptionKeysUpdate
    >;
    [TableName.AuthTokens]: Knex.CompositeTableType<
      TAuthTokens,
      TAuthTokensInsert,
      TAuthTokensUpdate
    >;
    [TableName.AuthTokenSession]: Knex.CompositeTableType<
      TAuthTokenSessions,
      TAuthTokenSessionsInsert,
      TAuthTokenSessionsUpdate
    >;
    [TableName.BackupPrivateKey]: Knex.CompositeTableType<
      TBackupPrivateKey,
      TBackupPrivateKeyInsert,
      TBackupPrivateKeyUpdate
    >;
    [TableName.Organization]: Knex.CompositeTableType<
      TOrganizations,
      TOrganizationsInsert,
      TOrganizationsUpdate
    >;
    [TableName.OrgMembership]: Knex.CompositeTableType<
      TOrgMemberships,
      TOrgMembershipsInsert,
      TOrgMembershipsUpdate
    >;
    [TableName.OrgRoles]: Knex.CompositeTableType<TOrgRoles, TOrgRolesInsert, TOrgRolesUpdate>;
    [TableName.IncidentContact]: Knex.CompositeTableType<
      TIncidentContacts,
      TIncidentContactsInsert,
      TIncidentContactsUpdate
    >;
    [TableName.UserAction]: Knex.CompositeTableType<
      TUserActions,
      TUserActionsInsert,
      TUserActionsUpdate
    >;
    [TableName.SuperAdmin]: Knex.CompositeTableType<
      TSuperAdmin,
      TSuperAdminInsert,
      TSuperAdminUpdate
    >;
    [TableName.ApiKey]: Knex.CompositeTableType<TApiKeys, TApiKeysInsert, TApiKeysUpdate>;
    [TableName.Project]: Knex.CompositeTableType<TProjects, TProjectsInsert, TProjectsUpdate>;
    [TableName.ProjectMembership]: Knex.CompositeTableType<
      TProjectMemberships,
      TProjectMembershipsInsert,
      TProjectMembershipsUpdate
    >;
    [TableName.Environment]: Knex.CompositeTableType<
      TProjectEnvironments,
      TProjectEnvironmentsInsert,
      TProjectEnvironmentsUpdate
    >;
    [TableName.ProjectBot]: Knex.CompositeTableType<
      TProjectBots,
      TProjectBotsInsert,
      TProjectBotsUpdate
    >;
    [TableName.ProjectRoles]: Knex.CompositeTableType<
      TProjectRoles,
      TProjectRolesInsert,
      TProjectRolesUpdate
    >;
    [TableName.ProjectKeys]: Knex.CompositeTableType<
      TProjectKeys,
      TProjectKeysInsert,
      TProjectKeysUpdate
    >;
    [TableName.Secret]: Knex.CompositeTableType<TSecrets, TSecretsInsert, TSecretsUpdate>;
    [TableName.SecretBlindIndex]: Knex.CompositeTableType<
      TSecretBlindIndexes,
      TSecretBlindIndexesInsert,
      TSecretBlindIndexesUpdate
    >;
    [TableName.SecretVersion]: Knex.CompositeTableType<
      TSecretVersions,
      TSecretVersionsInsert,
      TSecretVersionsUpdate
    >;
    [TableName.SecretFolder]: Knex.CompositeTableType<
      TSecretFolders,
      TSecretFoldersInsert,
      TSecretFoldersUpdate
    >;
    [TableName.SecretTag]: Knex.CompositeTableType<
      TSecretTags,
      TSecretTagsInsert,
      TSecretTagsUpdate
    >;
    [TableName.SecretImport]: Knex.CompositeTableType<
      TSecretImports,
      TSecretImportsInsert,
      TSecretImportsUpdate
    >;
    [TableName.Integration]: Knex.CompositeTableType<
      TIntegrations,
      TIntegrationsInsert,
      TIntegrationsUpdate
    >;
    [TableName.IntegrationAuth]: Knex.CompositeTableType<
      TIntegrationAuths,
      TIntegrationAuthsInsert,
      TIntegrationAuthsUpdate
    >;
    [TableName.JnSecretTag]: Knex.CompositeTableType<
      TSecretTagJunction,
      TSecretTagJunctionInsert,
      TSecretTagJunctionUpdate
    >;
  }
}
