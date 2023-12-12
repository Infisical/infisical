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
  TOrganizations,
  TOrganizationsInsert,
  TOrganizationsUpdate,
  TOrgMemberships,
  TOrgMembershipsInsert,
  TOrgMembershipsUpdate,
  TOrgRoles,
  TOrgRolesInsert,
  TOrgRolesUpdate,
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
  }
}
