import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSuperAdminDALFactory = ReturnType<typeof superAdminDALFactory>;

export const superAdminDALFactory = (db: TDbClient) => {
  const superAdminOrm = ormify(db, TableName.SuperAdmin);

  const findById = async (id: string, tx?: Knex) => {
    const config = await (tx || db)(TableName.SuperAdmin)
      .where(`${TableName.SuperAdmin}.id`, id)
      .leftJoin(TableName.Organization, `${TableName.SuperAdmin}.defaultAuthOrgId`, `${TableName.Organization}.id`)
      .select(
        db.ref("*").withSchema(TableName.SuperAdmin) as unknown as keyof TSuperAdmin,
        db.ref("slug").withSchema(TableName.Organization).as("defaultAuthOrgSlug")
      )
      .first();

    if (!config) {
      return null;
    }

    return {
      ...config,
      defaultAuthOrgSlug: config?.defaultAuthOrgSlug || null
    } as TSuperAdmin & { defaultAuthOrgSlug: string | null };
  };

  const updateById = async (id: string, data: TSuperAdminUpdate, tx?: Knex) => {
    const updatedConfig = await (superAdminOrm || tx).transaction(async (trx: Knex) => {
      await superAdminOrm.updateById(id, data, trx);
      const config = await findById(id, trx);

      if (!config) {
        throw new DatabaseError({
          error: "Failed to find updated super admin config",
          message: "Failed to update super admin config",
          name: "UpdateById"
        });
      }

      return config;
    });

    return updatedConfig;
  };

  return {
    ...superAdminOrm,
    findById,
    updateById
  };
};
