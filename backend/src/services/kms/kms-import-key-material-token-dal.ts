import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { KmsImportKeyMaterialTokensSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TKmsImportKeyMaterialTokenDALFactory = ReturnType<typeof kmsImportKeyMaterialTokenDALFactory>;

export const kmsImportKeyMaterialTokenDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.KmsImportKeyMaterialToken);

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    try {
      const parsed = KmsImportKeyMaterialTokensSchema.safeParse(
        await tx(TableName.KmsImportKeyMaterialToken).where({ id }).forUpdate().first()
      );
      return parsed.success ? parsed.data : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS import key material token for update" });
    }
  };

  return { ...orm, findByIdForUpdate };
};
