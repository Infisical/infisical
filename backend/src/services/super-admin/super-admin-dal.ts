import { TDbClient } from "@app/db";
import { TableName, TSuperAdmin } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSuperAdminDALFactory = ReturnType<typeof superAdminDALFactory>;

export const superAdminDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SuperAdmin);

  const findById = async (id: string) => {
    const config = await db(TableName.SuperAdmin)
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

  return {
    ...orm,
    findById
  };
};
