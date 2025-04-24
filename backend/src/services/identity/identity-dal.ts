import { TDbClient } from "@app/db";
import { TableName, TIdentities } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityDALFactory = ReturnType<typeof identityDALFactory>;

export const identityDALFactory = (db: TDbClient) => {
  const identityOrm = ormify(db, TableName.Identity);

  const getIdentitiesByFilter = async ({
    limit,
    offset,
    searchTerm,
    sortBy
  }: {
    limit: number;
    offset: number;
    searchTerm: string;
    sortBy?: keyof TIdentities;
  }) => {
    try {
      let query = db.replicaNode()(TableName.Identity);

      if (searchTerm) {
        query = query.where((qb) => {
          void qb.whereILike("name", `%${searchTerm}%`);
        });
      }

      if (sortBy) {
        query = query.orderBy(sortBy);
      }

      return await query.limit(limit).offset(offset).select(selectAllTableCols(TableName.Identity));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get identities by filter" });
    }
  };

  return { ...identityOrm, getIdentitiesByFilter };
};
