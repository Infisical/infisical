import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiCollectionItemDALFactory = ReturnType<typeof pkiCollectionItemDALFactory>;

export const pkiCollectionItemDALFactory = (db: TDbClient) => {
  const pkiCollectionItemOrm = ormify(db, TableName.PkiCollectionItem);

  const countItemsInPkiCollection = async (collectionId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const query = db
        .replicaNode()(TableName.PkiCollectionItem)
        .where(`${TableName.PkiCollectionItem}.pkiCollectionId`, collectionId);

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all project certificates" });
    }
  };

  return {
    ...pkiCollectionItemOrm,
    countItemsInPkiCollection
  };
};
