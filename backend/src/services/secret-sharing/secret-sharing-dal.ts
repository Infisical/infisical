import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretSharing } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TSecretSharingDALFactory = ReturnType<typeof secretSharingDALFactory>;

export const secretSharingDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.SecretSharing);

  const countAllUserOrgSharedSecrets = async ({ orgId, userId }: { orgId: string; userId: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.SecretSharing)
        .where(`${TableName.SecretSharing}.orgId`, orgId)
        .where(`${TableName.SecretSharing}.userId`, userId)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user-org shared secrets" });
    }
  };

  const pruneExpiredSharedSecrets = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired shared secret started`);
    try {
      const today = new Date();
      const docs = await (tx || db)(TableName.SecretSharing)
        .where("expiresAt", "<", today)
        .andWhere("encryptedValue", "<>", "")
        .update({
          encryptedValue: "",
          tag: "",
          iv: ""
        });
      logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired shared secret completed`);
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "pruneExpiredSharedSecrets" });
    }
  };

  const findActiveSharedSecrets = async (filters: Partial<TSecretSharing>, tx?: Knex) => {
    try {
      const now = new Date();
      return await (tx || db)(TableName.SecretSharing)
        .where(filters)
        .andWhere("expiresAt", ">", now)
        .andWhere("encryptedValue", "<>", "")
        .select(selectAllTableCols(TableName.SecretSharing))
        .orderBy("expiresAt", "asc");
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find Active Shared Secrets"
      });
    }
  };

  const softDeleteById = async (id: string) => {
    try {
      await sharedSecretOrm.updateById(id, {
        encryptedValue: "",
        iv: "",
        tag: ""
      });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Soft Delete Shared Secret"
      });
    }
  };

  return {
    ...sharedSecretOrm,
    countAllUserOrgSharedSecrets,
    pruneExpiredSharedSecrets,
    softDeleteById,
    findActiveSharedSecrets
  };
};
