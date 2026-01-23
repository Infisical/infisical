import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas/super-admin";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSuperAdminDALFactory = ReturnType<typeof superAdminDALFactory>;

export const superAdminDALFactory = (db: TDbClient) => {
  const superAdminOrm = ormify(db, TableName.SuperAdmin);

  const findById = async (id: string, tx?: Knex) => {
    const config = await (tx || db.replicaNode())(TableName.SuperAdmin)
      .where(`${TableName.SuperAdmin}.id`, id)
      .leftJoin(TableName.Organization, `${TableName.SuperAdmin}.defaultAuthOrgId`, `${TableName.Organization}.id`)
      .leftJoin(TableName.SamlConfig, (qb) => {
        qb.on(`${TableName.SamlConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
          `${TableName.SamlConfig}.isActive`,
          "=",
          db.raw("true")
        );
      })
      .leftJoin(TableName.OidcConfig, (qb) => {
        qb.on(`${TableName.OidcConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
          `${TableName.OidcConfig}.isActive`,
          "=",
          db.raw("true")
        );
      })
      .select(
        db.ref("*").withSchema(TableName.SuperAdmin) as unknown as keyof TSuperAdmin,
        db.ref("slug").withSchema(TableName.Organization).as("defaultAuthOrgSlug"),
        db.ref("authEnforced").withSchema(TableName.Organization).as("defaultAuthOrgAuthEnforced"),
        db.raw(`
            CASE 
              WHEN ${TableName.SamlConfig}."orgId" IS NOT NULL THEN 'saml'
              WHEN ${TableName.OidcConfig}."orgId" IS NOT NULL THEN 'oidc'
              ELSE NULL
            END as "defaultAuthOrgAuthMethod"
        `)
      )
      .first();

    if (!config) {
      return null;
    }

    return {
      ...config,
      defaultAuthOrgSlug: config?.defaultAuthOrgSlug || null
    } as TSuperAdmin & {
      defaultAuthOrgSlug: string | null;
      defaultAuthOrgAuthEnforced?: boolean | null;
      defaultAuthOrgAuthMethod?: string | null;
    };
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
