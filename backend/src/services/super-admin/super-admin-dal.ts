import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";
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

    return {
      defaultAuthOrgSlug: config?.defaultAuthOrgSlug || null,
      ...config
    } as TSuperAdmin & { defaultAuthOrgSlug: string | null };
  };

  const updateById = async (id: string, data: TSuperAdminUpdate, tx?: Knex) => {
    const updatedConfig = await superAdminOrm.transaction(async (trx) => {
      await superAdminOrm.updateById(id, data, tx || trx);
      const config = await findById(id, tx || trx);

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
