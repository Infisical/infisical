import { Knex } from "knex";

import {
  TableName,
  TBackupPrivateKey,
  TBackupPrivateKeyInsert,
  TToken,
  TTokenInsert,
  TTokenUpdate,
  TUser,
  TUserEncryptionKey,
  TUserEncryptionKeyInsert,
  TUserEncryptionKeyUpdate,
  TUserInsert,
  TUserUpdate
} from "@app/db/schemas";
import {
  TTokenSession,
  TTokenSessionInsert,
  TTokenSessionUpdate
} from "@app/db/schemas/token-session";

declare module "knex/types/tables" {
  interface Tables extends { [key in TableName]: Knex.CompositeTableType<any> } {
    [TableName.Users]: Knex.CompositeTableType<TUser, TUserInsert, TUserUpdate>;
    [TableName.UserEncryptionKey]: Knex.CompositeTableType<
      TUserEncryptionKey,
      TUserEncryptionKeyInsert,
      TUserEncryptionKeyUpdate
    >;
    [TableName.AuthTokens]: Knex.CompositeTableType<TToken, TTokenInsert, TTokenUpdate>;
    [TableName.AuthTokenSession]: Knex.CompositeTableType<
      TTokenSession,
      TTokenSessionInsert,
      TTokenSessionUpdate
    >;
    [TableName.BackupPrivateKey]: Knex.CompositeTableType<
      TBackupPrivateKey,
      TBackupPrivateKeyInsert,
      TTokenSessionUpdate
    >;
  }
}
