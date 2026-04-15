/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";

import { Knex } from "knex";

import { isValidEmailDomain } from "@app/lib/validator/validate-email";

import { TableName } from "../schemas";

// Public/shared email providers that should never be claimed as org-owned domains
const PUBLIC_EMAIL_DOMAINS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "onmicrosoft.com",
  // Yahoo
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // ProtonMail
  "protonmail.com",
  "proton.me",
  "pm.me",
  // Other major providers
  "aol.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "fastmail.com",
  "tutanota.com",
  "tuta.io",
  // IdP provider domains (test/default accounts)
  "okta.com",
  "auth0.com",
  "onelogin.com",
  "jumpcloud.com",
  "duo.com",
  // Development/testing
  "example.com",
  "test.com",
  "localhost",
  "localhost.local"
]);

/**
 * For non-cloud (self-hosted) environments only:
 * Auto-seed verified email domains from existing SSO configurations.
 *
 * Looks at orgs with SAML, OIDC, or LDAP configs and finds the unique email domains
 * from their verified user aliases. For each domain, inserts it as a verified email domain
 * for the org with the most verified aliases in that domain.
 */
export async function up(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-console
  const log = (msg: string) => console.log(`[auto domain seeding] ${msg}`);

  // Only run for non-cloud (self-hosted) environments
  // Cloud environments have LICENSE_SERVER_KEY set
  if (process.env.LICENSE_SERVER_KEY) {
    log("Skipping — cloud environment (LICENSE_SERVER_KEY set)");
    return;
  }

  const emailDomainsPopulated = await knex(TableName.EmailDomains).select("id").limit(1);
  if (emailDomainsPopulated.length) {
    log("Skipping — email_domains table already has data");
    return;
  }

  // Find all orgs that have SSO configured (SAML, OIDC, or LDAP)
  log("Finding orgs with active SSO configs...");
  const ssoOrgs = await knex.raw(`
    SELECT DISTINCT org_id FROM (
      SELECT "orgId" as org_id FROM "${TableName.SamlConfig}" WHERE "isActive" = TRUE
      UNION
      SELECT "orgId" as org_id FROM "${TableName.OidcConfig}" WHERE "isActive" = TRUE
      UNION
      SELECT "orgId" as org_id FROM "${TableName.LdapConfig}" WHERE "isActive" = TRUE
    ) sso_orgs
  `);

  const ssoOrgIds = (ssoOrgs.rows as { org_id: string }[]).map((r) => r.org_id);
  log(`Found ${ssoOrgIds.length} orgs with active SSO`);
  if (ssoOrgIds.length === 0) return;

  // For each SSO org, find unique email domains from verified user aliases
  // Count how many verified aliases each org has per domain
  log("Counting verified aliases per domain per org...");
  const domainCounts = await knex.raw(
    `
    SELECT
      ua."orgId" as org_id,
      LOWER(SPLIT_PART(ua.emails[1], '@', 2)) as domain,
      COUNT(*) as alias_count
    FROM "${TableName.UserAliases}" ua
    WHERE ua."orgId" = ANY(?)
      AND ua."isEmailVerified" = TRUE
      AND ua.emails IS NOT NULL
      AND array_length(ua.emails, 1) > 0
      AND SPLIT_PART(ua.emails[1], '@', 2) != ''
    GROUP BY ua."orgId", LOWER(SPLIT_PART(ua.emails[1], '@', 2))
    ORDER BY domain, alias_count DESC
  `,
    [ssoOrgIds]
  );
  log(`Found ${domainCounts.rows.length} org-domain pairs`);

  // For each domain, pick the org with the most verified aliases
  const domainToOrg = new Map<string, { orgId: string; count: number }>();
  for (const row of domainCounts.rows as { org_id: string; domain: string; alias_count: string }[]) {
    const { org_id: orgId, domain, alias_count: aliasCount } = row;
    // eslint-disable-next-line no-continue
    if (!domain || domain.length < 3) continue;
    const isDomain = isValidEmailDomain(domain);

    if (!isDomain) {
      log(`Skipping invalid domain: ${domain}`);
      // eslint-disable-next-line no-continue
      continue;
    }

    // Skip public/shared email providers — these are not org-owned domains
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      log(`Skipping public domain: ${domain} (org ${orgId}, ${aliasCount} aliases)`);
      // eslint-disable-next-line no-continue
      continue;
    }

    const count = parseInt(aliasCount, 10);
    const existing = domainToOrg.get(domain);
    if (!existing) {
      log(`Domain ${domain} -> org ${orgId} (${count} aliases)`);
      domainToOrg.set(domain, { orgId, count });
    } else if (count > existing.count) {
      log(
        `Domain ${domain} -> org ${orgId} (${count} aliases) replaces org ${existing.orgId} (${existing.count} aliases)`
      );
      domainToOrg.set(domain, { orgId, count });
    } else {
      log(
        `Domain ${domain} -> org ${orgId} (${count} aliases) skipped, org ${existing.orgId} has more (${existing.count})`
      );
    }
  }

  log(`Resolved ${domainToOrg.size} unique domains`);
  if (domainToOrg.size === 0) return;

  // Check which domains already exist in email_domains table
  const existingDomains = await knex(TableName.EmailDomains)
    .whereIn("domain", Array.from(domainToOrg.keys()))
    .select("domain");

  const existingDomainSet = new Set(existingDomains.map((r) => r.domain));
  if (existingDomainSet.size > 0) {
    log(`${existingDomainSet.size} domains already exist in email_domains, skipping those`);
  }

  // Insert new verified email domains
  const toInsert = Array.from(domainToOrg.entries())
    .filter(([domain]) => !existingDomainSet.has(domain))
    .map(([domain, { orgId }]) => ({
      orgId,
      domain,
      verificationMethod: "migration",
      verificationCode: crypto.randomBytes(16).toString("hex"),
      verificationRecordName: `_infisical-verification.${domain}`,
      status: "verified",
      verifiedAt: new Date(),
      codeExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    }));

  log(`Inserting ${toInsert.length} new email domains...`);
  if (toInsert.length > 0) {
    // Insert in batches to avoid hitting parameter limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      await knex(TableName.EmailDomains).insert(batch);
      log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} domains)`);
    }
  }
  log(`Done — seeded ${toInsert.length} verified email domains`);
}

export async function down(): Promise<void> {
  // Data seeding — not reversible
}
