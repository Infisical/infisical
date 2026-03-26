import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // 1. Create user_authentications table
  if (!(await knex.schema.hasTable(TableName.UserAuthentication))) {
    await knex.schema.createTable(TableName.UserAuthentication, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable().unique();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.string("type").notNullable(); // email, google, github, gitlab, oidc, saml, ldap
      t.string("externalId").nullable(); // email for email/pw, IdP subject for SSO, null = SSO required but first login not yet completed
      t.string("domain").notNullable(); // company-a.com, gmail.com, etc.
      t.timestamps(true, true, true);
      t.index("domain");
    });
  }

  // 2. Create domain_sso_connectors table
  if (!(await knex.schema.hasTable(TableName.DomainSsoConnector))) {
    await knex.schema.createTable(TableName.DomainSsoConnector, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("domain").notNullable().unique();
      t.uuid("ownerOrgId").notNullable();
      t.foreign("ownerOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("verificationStatus").notNullable().defaultTo("pending"); // pending, verified
      t.string("verificationToken").notNullable();
      t.timestamp("verifiedAt", { useTz: true }).nullable();
      t.string("type").notNullable(); // oidc, saml, ldap
      t.boolean("isActive").notNullable().defaultTo(false);
      t.timestamps(true, true, true);
    });
  }

  // 3. Add domainSsoConnectorId FK to SSO config tables
  if (!(await knex.schema.hasColumn(TableName.OidcConfig, "domainSsoConnectorId"))) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.uuid("domainSsoConnectorId").nullable();
      t.foreign("domainSsoConnectorId").references("id").inTable(TableName.DomainSsoConnector).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.SamlConfig, "domainSsoConnectorId"))) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      t.uuid("domainSsoConnectorId").nullable();
      t.foreign("domainSsoConnectorId").references("id").inTable(TableName.DomainSsoConnector).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.LdapConfig, "domainSsoConnectorId"))) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      t.uuid("domainSsoConnectorId").nullable();
      t.foreign("domainSsoConnectorId").references("id").inTable(TableName.DomainSsoConnector).onDelete("SET NULL");
    });
  }

  // 4. Backfill user_authentications from user_aliases + users
  //
  // Strategy: For each non-ghost user, create exactly one UserAuthentication row.
  // Priority: SSO alias (oidc/saml/ldap) > social alias (google/github/gitlab) > email/password.
  // We use DISTINCT ON to pick one alias per user, ordered by priority.
  //
  // Step 1: Users with aliases — pick the highest-priority alias per user
  await knex.raw(`
    INSERT INTO ${TableName.UserAuthentication} (id, "userId", type, "externalId", domain, "createdAt", "updatedAt")
    SELECT
      gen_random_uuid(),
      ranked."userId",
      ranked."aliasType",
      ranked."externalId",
      COALESCE(
        SUBSTRING(u.email FROM POSITION('@' IN u.email) + 1),
        'unknown'
      ),
      NOW(),
      NOW()
    FROM (
      SELECT DISTINCT ON (ua."userId")
        ua."userId",
        ua."aliasType",
        ua."externalId",
        CASE ua."aliasType"
          WHEN 'oidc' THEN 1
          WHEN 'saml' THEN 2
          WHEN 'ldap' THEN 3
          WHEN 'google' THEN 4
          WHEN 'github' THEN 5
          WHEN 'gitlab' THEN 6
          ELSE 7
        END AS priority
      FROM ${TableName.UserAliases} ua
      ORDER BY ua."userId", priority ASC
    ) ranked
    JOIN ${TableName.Users} u ON u.id = ranked."userId"
    ON CONFLICT ("userId") DO NOTHING
  `);

  // Step 2: Users without any alias — default to email/password
  await knex.raw(`
    INSERT INTO ${TableName.UserAuthentication} (id, "userId", type, "externalId", domain, "createdAt", "updatedAt")
    SELECT
      gen_random_uuid(),
      u.id,
      'email',
      u.email,
      COALESCE(
        SUBSTRING(u.email FROM POSITION('@' IN u.email) + 1),
        'unknown'
      ),
      NOW(),
      NOW()
    FROM ${TableName.Users} u
    WHERE u.email IS NOT NULL
      AND u."isGhost" = false
    ON CONFLICT ("userId") DO NOTHING
  `);

  // 5. Backfill domain_sso_connectors from orgs with authEnforced + active SSO configs
  //
  // Only OIDC configs with allowedEmailDomains are auto-migrated — they have explicit domain lists.
  // SAML/LDAP configs don't store domains, so those orgs will need to re-claim and verify
  // their domains manually after the migration. This is safer than guessing domains from
  // member emails which could include personal domains like gmail.com.
  await knex.raw(`
    INSERT INTO ${TableName.DomainSsoConnector} (id, domain, "ownerOrgId", "verificationStatus", "verificationToken", "verifiedAt", type, "isActive", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid(),
      TRIM(d.domain),
      oc."orgId",
      'verified',
      'migrated-' || gen_random_uuid()::text,
      NOW(),
      'oidc',
      oc."isActive",
      NOW(),
      NOW()
    FROM ${TableName.OidcConfig} oc
    JOIN ${TableName.Organization} o ON o.id = oc."orgId"
    CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(oc."allowedEmailDomains", ',')) AS d(domain)
    WHERE o."authEnforced" = true
      AND oc."allowedEmailDomains" IS NOT NULL
      AND oc."allowedEmailDomains" != ''
      AND TRIM(d.domain) != ''
    ON CONFLICT (domain) DO NOTHING
  `);

  // 6. Link existing SSO configs to their domain connectors
  await knex.raw(`
    UPDATE ${TableName.OidcConfig} oc
    SET "domainSsoConnectorId" = dsc.id
    FROM ${TableName.DomainSsoConnector} dsc
    WHERE dsc."ownerOrgId" = oc."orgId"
      AND dsc.type = 'oidc'
  `);

  await knex.raw(`
    UPDATE ${TableName.SamlConfig} sc
    SET "domainSsoConnectorId" = dsc.id
    FROM ${TableName.DomainSsoConnector} dsc
    WHERE dsc."ownerOrgId" = sc."orgId"
      AND dsc.type = 'saml'
  `);

  await knex.raw(`
    UPDATE ${TableName.LdapConfig} lc
    SET "domainSsoConnectorId" = dsc.id
    FROM ${TableName.DomainSsoConnector} dsc
    WHERE dsc."ownerOrgId" = lc."orgId"
      AND dsc.type = 'ldap'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove FKs from SSO config tables
  if (await knex.schema.hasColumn(TableName.OidcConfig, "domainSsoConnectorId")) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.dropColumn("domainSsoConnectorId");
    });
  }

  if (await knex.schema.hasColumn(TableName.SamlConfig, "domainSsoConnectorId")) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      t.dropColumn("domainSsoConnectorId");
    });
  }

  if (await knex.schema.hasColumn(TableName.LdapConfig, "domainSsoConnectorId")) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      t.dropColumn("domainSsoConnectorId");
    });
  }

  // Drop new tables
  await knex.schema.dropTableIfExists(TableName.DomainSsoConnector);
  await knex.schema.dropTableIfExists(TableName.UserAuthentication);
}
