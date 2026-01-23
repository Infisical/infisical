import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TBackupPrivateKey } from "@app/db/schemas/backup-private-key";
import { TableName } from "@app/db/schemas/models";
import { withTransaction } from "@app/lib/knex";

export type TAuthDALFactory = ReturnType<typeof authDALFactory>;

export const authDALFactory = (db: TDbClient) => {
  const getBackupPrivateKeyByUserId = async (userId: string) =>
    db(TableName.BackupPrivateKey).where({ userId }).first("*");

  const upsertBackupKey = async (
    userId: string,
    data: Partial<TBackupPrivateKey>,
    tx?: Knex
  ): Promise<TBackupPrivateKey | undefined> => {
    const [backupKey] = await (tx || db)(TableName.BackupPrivateKey)
      .insert({ userId, ...data, updatedAt: new Date() } as TBackupPrivateKey)
      .onConflict("userId")
      .merge()
      .returning("*");
    return backupKey;
  };

  return withTransaction(db, {
    getBackupPrivateKeyByUserId,
    upsertBackupKey
  });
};
