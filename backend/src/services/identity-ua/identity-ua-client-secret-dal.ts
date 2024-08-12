import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";

export type TIdentityUaClientSecretDALFactory = ReturnType<typeof identityUaClientSecretDALFactory>;

export const identityUaClientSecretDALFactory = (db: TDbClient) => {
  const uaClientSecretOrm = ormify(db, TableName.IdentityUaClientSecret);

  const incrementUsage = async (id: string, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.IdentityUaClientSecret)
        .where({ id })
        .update({ clientSecretLastUsedAt: new Date() })
        .increment("clientSecretNumUses", 1)
        .returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "IncrementUsage" });
    }
  };

  const removeExpiredClientSecrets = async (tx?: Knex) => {
    const BATCH_SIZE = 10000;
    const MAX_RETRY_ON_FAILURE = 3;

    let deletedClientSecret: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;

    do {
      try {
        const findExpiredClientSecretQuery = (tx || db)(TableName.IdentityUaClientSecret)
          .where({
            isClientSecretRevoked: true
          })
          .orWhere((qb) => {
            void qb
              .where("clientSecretNumUses", ">", 0)
              .andWhere(
                "clientSecretNumUses",
                ">=",
                db.ref("clientSecretNumUsesLimit").withSchema(TableName.IdentityUaClientSecret)
              );
          })
          .orWhere((qb) => {
            void qb
              .where("clientSecretTTL", ">", 0)
              .andWhereRaw(
                `"${TableName.IdentityUaClientSecret}"."createdAt" + make_interval(secs => "${TableName.IdentityUaClientSecret}"."clientSecretTTL") < NOW()`
              );
          })
          .select("id")
          .limit(BATCH_SIZE);

        // eslint-disable-next-line no-await-in-loop
        deletedClientSecret = await (tx || db)(TableName.IdentityUaClientSecret)
          .whereIn("id", findExpiredClientSecretQuery)
          .del()
          .returning("id");
        numberOfRetryOnFailure = 0; // reset
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete client secret on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
    } while (deletedClientSecret.length > 0 || numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE);
  };

  return { ...uaClientSecretOrm, incrementUsage, removeExpiredClientSecrets };
};
