import { Knex } from "knex";

import {
  TableName,
  TAuthTokens,
  TAuthTokenSessions,
  TAuthTokenSessionsInsert,
  TAuthTokenSessionsUpdate,
  TAuthTokensUpdate,
  TBackupPrivateKey,
  TBackupPrivateKeyInsert,
  TBackupPrivateKeyUpdate,
  TOrganizationMemberships,
  TOrganizations,
  TOrganizationsInsert,
  TOrganizationsUpdate,
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate,
  TUsers,
  TUsersInsert,
  TUsersUpdate
} from "@app/db/schemas";

declare module "knex/types/tables" {
  interface Tables extends { [key in TableName]: Knex.CompositeTableType<any> } {
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
      TOrganizationMemberships,
      TOrganizationsInsert,
      TOrganizationsUpdate
    >;
  }
}
