import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretScanningGitRisksInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretScanningDALFactory = ReturnType<typeof secretScanningDALFactory>;

export const secretScanningDALFactory = (db: TDbClient) => {
  const gitRiskOrm = ormify(db, TableName.SecretScanningGitRisk);

  const upsert = async (data: TSecretScanningGitRisksInsert[], tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretScanningGitRisk).insert(data).onConflict("fingerprint").merge();
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "GitRiskUpsert" });
    }
  };

  return { ...gitRiskOrm, upsert };
};
