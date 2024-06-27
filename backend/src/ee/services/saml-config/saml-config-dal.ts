import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSamlConfigDALFactory = ReturnType<typeof samlConfigDALFactory>;

export const samlConfigDALFactory = (db: TDbClient) => {
  const samlCfgOrm = ormify(db, TableName.SamlConfig);

  const findEnforceableSamlCfg = async (orgId: string) => {
    try {
      const samlCfg = await db
        .replicaNode()(TableName.SamlConfig)
        .where({
          orgId,
          isActive: true
        })
        .whereNotNull("lastUsed")
        .first();

      return samlCfg;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by id" });
    }
  };

  return {
    ...samlCfgOrm,
    findEnforceableSamlCfg
  };
};
