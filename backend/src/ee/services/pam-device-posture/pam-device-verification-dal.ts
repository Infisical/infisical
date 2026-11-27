import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamDeviceVerifications } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export type TPamDeviceVerificationDALFactory = ReturnType<typeof pamDeviceVerificationDALFactory>;

export const pamDeviceVerificationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDeviceVerification);

  // A check is read right after it's written, so reads go to the primary rather than a lagging replica
  const findById = (id: string, tx?: Knex) => orm.findById(id, tx || db);
  const findOne = (filter: Partial<TPamDeviceVerifications>, tx?: Knex) => orm.findOne(filter, tx || db);

  const pruneExpired = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.PamDeviceVerification)
        .where("expiresAt", "<", new Date(Date.now() - PRUNE_AFTER_MS))
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune expired PAM device verifications" });
    }
  };

  return { ...orm, findById, findOne, pruneExpired };
};
