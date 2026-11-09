import { Knex } from "knex";

import { TableName, TSuperAdminUpdate } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { INSTANCE_CONFIG_ID, InstanceConfig, TInstanceConfigProps } from "../model/instance-config";
import { InstanceConfigChange } from "../model/instance-config-change";

export type TInstanceConfigDataAccess = {
  findById(options?: TReadOptions): Promise<InstanceConfig | undefined>;
  // Run inside a transaction holding the init lock: returns the existing row or inserts this one.
  createIfMissing(initial: TSuperAdminUpdate & { id: string }): Promise<InstanceConfig>;
  update(change: InstanceConfigChange): Promise<void>;
};

// Owns super_admin. Its read also joins organizations, saml_configs and oidc_configs for the default auth org: a
// declared exception until Organizations & Projects and User Accounts expose that data (see ../../AGENTS.md).
export class InstanceConfigDataAccess implements TInstanceConfigDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // Before migrations and before any module exists: null when the table or the row is missing.
  static async readFipsSetting(knex: Knex): Promise<boolean | null> {
    if (!(await knex.schema.hasTable(TableName.SuperAdmin))) return null;
    const row = (await knex(TableName.SuperAdmin).where({ id: INSTANCE_CONFIG_ID }).first("*")) as
      | { fipsEnabled?: boolean | null }
      | undefined;
    return row ? Boolean(row.fipsEnabled) : null;
  }

  // For the boot banner, outside any module: false until an instance admin finished setup.
  static async readInitialized(knex: Knex): Promise<boolean> {
    if (!(await knex.schema.hasTable(TableName.SuperAdmin))) return false;
    const row = (await knex(TableName.SuperAdmin).where({ id: INSTANCE_CONFIG_ID }).first("initialized")) as
      | { initialized?: boolean | null }
      | undefined;
    return Boolean(row?.initialized);
  }

  async findById(options?: TReadOptions): Promise<InstanceConfig | undefined> {
    try {
      const knex = this.db.reader(options);
      const row = (await knex(TableName.SuperAdmin)
        .where(`${TableName.SuperAdmin}.id`, INSTANCE_CONFIG_ID)
        .leftJoin(TableName.Organization, `${TableName.SuperAdmin}.defaultAuthOrgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.SamlConfig, (qb) => {
          qb.on(`${TableName.SamlConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.SamlConfig}.isActive`,
            "=",
            knex.raw("true")
          );
        })
        .leftJoin(TableName.OidcConfig, (qb) => {
          qb.on(`${TableName.OidcConfig}.orgId`, "=", `${TableName.Organization}.id`).andOn(
            `${TableName.OidcConfig}.isActive`,
            "=",
            knex.raw("true")
          );
        })
        .select(
          knex.ref("*").withSchema(TableName.SuperAdmin),
          knex.ref("slug").withSchema(TableName.Organization).as("defaultAuthOrgSlug"),
          knex.ref("authEnforced").withSchema(TableName.Organization).as("defaultAuthOrgAuthEnforced"),
          knex.raw(`
            CASE
              WHEN ${TableName.SamlConfig}."orgId" IS NOT NULL THEN 'saml'
              WHEN ${TableName.OidcConfig}."orgId" IS NOT NULL THEN 'oidc'
              ELSE NULL
            END as "defaultAuthOrgAuthMethod"
          `)
        )
        .first()) as TInstanceConfigProps | undefined;
      return row ? InstanceConfig.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find instance config" });
    }
  }

  async createIfMissing(initial: TSuperAdminUpdate & { id: string }): Promise<InstanceConfig> {
    const existing = await this.findById();
    if (existing) return existing;
    try {
      // A pod of the previous release creates the row without this conflict clause, under the same lock.
      await this.db
        .writer()(TableName.SuperAdmin)
        .insert(initial as never)
        .onConflict("id")
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Create instance config" });
    }
    const created = await this.findById();
    if (!created) {
      throw new DatabaseError({ error: "Inserted row not found", name: "Create instance config" });
    }
    return created;
  }

  async update(change: InstanceConfigChange): Promise<void> {
    try {
      await this.db
        .writer()(TableName.SuperAdmin)
        .where({ id: INSTANCE_CONFIG_ID })
        .update(change.toJSON() as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update instance config" });
    }
  }
}
