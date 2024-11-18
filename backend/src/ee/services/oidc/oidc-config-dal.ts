import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TOidcConfigDALFactory = ReturnType<typeof oidcConfigDALFactory>;

export const oidcConfigDALFactory = (db: TDbClient) => {
  const oidcCfgOrm = ormify(db, TableName.OidcConfig);

  const findEnforceableOidcCfg = async (orgId: string) => {
    try {
      const oidcCfg = await db
        .replicaNode()(TableName.OidcConfig)
        .where({
          orgId,
          isActive: true
        })
        .whereNotNull("lastUsed")
        .first();

      return oidcCfg;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by id" });
    }
  };

  return { ...oidcCfgOrm, findEnforceableOidcCfg };
};
