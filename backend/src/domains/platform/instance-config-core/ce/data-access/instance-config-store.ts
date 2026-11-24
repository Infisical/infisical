import { Knex } from "knex";

import { TableName, TSuperAdmin, TSuperAdminInsert } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { INSTANCE_CONFIG_ID, InstanceConfig, TInstanceConfigRecord } from "../models/instance-config";
import { TInstanceConfigStore } from "../services/dependencies";

// The row with its default auth org: the org's slug and enforcement, and which SSO it has active. The lock, when
// taken, covers only super_admin: Postgres refuses to lock the nullable side of an outer join.
const selectRow = (knex: Knex, forUpdate = false): Promise<TInstanceConfigRecord | undefined> => {
  const query = knex(TableName.SuperAdmin)
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
    );
  // The raw CASE column is beyond Knex's inference, so the joined row's type is declared on first().
  return (forUpdate ? query.forUpdate(TableName.SuperAdmin) : query).first<TInstanceConfigRecord | undefined>();
};

export class InstanceConfigStore implements TInstanceConfigStore {
  constructor(private readonly connection: TStoreConnection) {}

  // For boot, before migrations and before any module exists: null when the table or the row is missing.
  static async readFipsSetting(knex: Knex): Promise<boolean | null> {
    if (!(await knex.schema.hasTable(TableName.SuperAdmin))) return null;
    // "*" rather than the column: an instance from before fipsEnabled existed has a row without it, and is not FIPS.
    const row = await knex(TableName.SuperAdmin).where({ id: INSTANCE_CONFIG_ID }).first("*");
    return row ? Boolean(row.fipsEnabled) : null;
  }

  // For the boot banner, which has no modules: false until an instance admin finished setup.
  static async readInitialized(knex: Knex): Promise<boolean> {
    if (!(await knex.schema.hasTable(TableName.SuperAdmin))) return false;
    const row = await knex(TableName.SuperAdmin).where({ id: INSTANCE_CONFIG_ID }).first("initialized");
    return Boolean(row?.initialized);
  }

  async find(options?: TReadOptions): Promise<InstanceConfig | null> {
    try {
      const row = await selectRow(this.connection.reader(options));
      return row ? InstanceConfig.restore(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find instance config" });
    }
  }

  async findForUpdate(): Promise<InstanceConfig | null> {
    try {
      const row = await selectRow(this.connection.writer(), true);
      return row ? InstanceConfig.restore(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock instance config" });
    }
  }

  async createIfMissing(config: InstanceConfig): Promise<void> {
    const record = config.toJSON();
    // id is not insertable in the generated type, but this table's one row has a fixed id.
    const row: TSuperAdminInsert & { id: string } = {
      id: record.id,
      instanceId: record.instanceId,
      initialized: record.initialized,
      allowSignUp: record.allowSignUp,
      defaultAuthOrgId: record.defaultAuthOrgId,
      fipsEnabled: record.fipsEnabled,
      onboardingCompleted: record.onboardingCompleted
    };
    try {
      // A concurrent boot's insert waits for the first to commit and then does nothing. Read-then-insert would fail
      // all but one boot on the primary key.
      await this.connection.writer()(TableName.SuperAdmin).insert(row).onConflict("id").ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Create instance config" });
    }
  }

  async save(config: InstanceConfig): Promise<void> {
    const record = config.toJSON();
    try {
      await this.connection
        .writer()(TableName.SuperAdmin)
        .where({ id: record.id })
        .update({
          initialized: record.initialized,
          allowSignUp: record.allowSignUp,
          allowedSignUpDomain: record.allowedSignUpDomain,
          trustLdapEmails: record.trustLdapEmails,
          defaultAuthOrgId: record.defaultAuthOrgId,
          enabledLoginMethods: record.enabledLoginMethods,
          authConsentContent: record.authConsentContent,
          pageFrameContent: record.pageFrameContent,
          adminIdentityIds: record.adminIdentityIds,
          onboardingCompleted: record.onboardingCompleted,
          allowedStorageHostnames: record.allowedStorageHostnames,
          encryptedSlackClientId: record.encryptedSlackClientId,
          encryptedSlackClientSecret: record.encryptedSlackClientSecret,
          encryptedMicrosoftTeamsAppId: record.encryptedMicrosoftTeamsAppId,
          encryptedMicrosoftTeamsClientSecret: record.encryptedMicrosoftTeamsClientSecret,
          encryptedMicrosoftTeamsBotId: record.encryptedMicrosoftTeamsBotId,
          encryptedGitHubAppConnectionClientId: record.encryptedGitHubAppConnectionClientId,
          encryptedGitHubAppConnectionClientSecret: record.encryptedGitHubAppConnectionClientSecret,
          encryptedGitHubAppConnectionSlug: record.encryptedGitHubAppConnectionSlug,
          encryptedGitHubAppConnectionId: record.encryptedGitHubAppConnectionId,
          encryptedGitHubAppConnectionPrivateKey: record.encryptedGitHubAppConnectionPrivateKey,
          encryptedEnvOverrides: record.encryptedEnvOverrides
          // Fails to compile when super_admin gains a column until it is written here (or listed as never written).
        } satisfies Record<
          Exclude<keyof TSuperAdmin, "id" | "instanceId" | "fipsEnabled" | "createdAt" | "updatedAt">,
          unknown
        >);
    } catch (error) {
      throw new DatabaseError({ error, name: "Save instance config" });
    }
  }
}
