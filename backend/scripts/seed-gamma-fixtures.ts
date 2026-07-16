/* eslint-disable no-console */
// Idempotent gamma e2e fixtures bootstrap.
//
// Creates the e2e org, a long-lived SCIM token row, and the SAML config row
// pointing at the mock IdP hosted in `preview-environments`. Re-runs are
// no-ops on row creation; the SCIM JWT is re-derived and printed each run so
// operators can recapture it without touching the DB.
//
// SAML config fields (cert / issuer / entryPoint) are KMS-encrypted using the
// same org-level data key the runtime SAML service uses, so gamma's
// `getSaml()` decrypt path sees identical values to anything the admin API
// would write.
//
// SAFETY: refuses to run against anything that looks like prod. Operator must
// also type the database name interactively to confirm. Do not pipe `yes` into
// this — that defeats the purpose.
//
// Usage (from backend/):
//   DB_CONNECTION_URI=<gamma uri> \
//   ENCRYPTION_KEY=<gamma encryption key> \
//   AUTH_SECRET=<gamma auth secret> \
//   E2E_ORG_NAME="e2e-scim-test" E2E_ORG_SLUG="e2e-scim-test" \
//   npx tsx scripts/seed-gamma-fixtures.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import knexLib from "knex";
import promptSync from "prompt-sync";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { SamlProviders } from "@app/ee/services/saml-config/saml-config-types";
import { getConfig, getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger, logger } from "@app/lib/logger";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "../src/db/schemas";
import { AuthTokenType } from "../src/services/auth/auth-type";

// Mock IdP hosted in preview-environments. The entryPoint is where gamma
// redirects the browser to start SAML SSO; the issuer matches the IdP's
// entityID; the cert is committed at e2e/fixtures/idp-cert.pem and the
// matching private key lives only in CF Secrets (SAML_IDP_PRIVATE_KEY).
const IDP_ENTRY_POINT = "https://preview-orchestrator.infisical.workers.dev/saml-idp/sso";
const IDP_ISSUER = "https://preview-orchestrator.infisical.workers.dev/saml-idp";
const IDP_CERT_PATH = path.resolve(__dirname, "../../e2e/fixtures/idp-cert.pem");

// Email domain the SCIM-provisioned test users live under. SCIM POST rejects
// any email whose domain isn't a `verified` row in `email_domains` for the
// org (backend/src/ee/services/email-domain/email-domain-fns.ts:29). Using a
// `.test` TLD (RFC 2606) avoids any collision with a real verified domain
// that might already exist for Infisical's primary org.
const E2E_EMAIL_DOMAIN = "infisical-e2e.test";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} must be set`);
  }
  return value;
};

const PROD_PATTERN = /(^|[-_.])(prod|production)([-_.]|$)/i;

const parseDbTarget = (uri: string): { host: string; dbName: string } => {
  const match = uri.match(/^postgres(?:ql)?:\/\/(?:[^@]+@)?([^:/]+)(?::\d+)?\/([^?]+)/i);
  if (!match) {
    throw new Error("DB_CONNECTION_URI is not a parseable postgres:// URI");
  }
  return { host: match[1], dbName: match[2] };
};

const guardAgainstProd = (host: string, dbName: string) => {
  if ((process.env.INFISICAL_ENV ?? "").toLowerCase() === "prod") {
    throw new Error("Refusing to run: INFISICAL_ENV=prod");
  }
  if (PROD_PATTERN.test(host)) {
    throw new Error(`Refusing to run: DB host "${host}" looks like prod.`);
  }
  if (PROD_PATTERN.test(dbName)) {
    throw new Error(`Refusing to run: database name "${dbName}" looks like prod.`);
  }

  const prompt = promptSync({ sigint: true });
  console.log("");
  console.log("About to seed e2e fixtures against:");
  console.log(`  host:     ${host}`);
  console.log(`  database: ${dbName}`);
  console.log("");
  const confirmation = prompt(`Re-type the database name to confirm: `);
  if (confirmation !== dbName) {
    throw new Error("Database name confirmation did not match — aborting.");
  }
};

const main = async () => {
  const dbUri = required("DB_CONNECTION_URI");
  const orgName = process.env.E2E_ORG_NAME ?? "e2e-scim-test";
  const orgSlug = process.env.E2E_ORG_SLUG ?? "e2e-scim-test";
  const scimTokenDescription = "e2e-fixture";

  const { host, dbName } = parseDbTarget(dbUri);
  guardAgainstProd(host, dbName);

  const knex = knexLib({
    client: "pg",
    connection: dbUri,
    pool: { min: 1, max: 2 }
  });

  // Match the main app: no replicas are configured here, so route everything
  // through the same connection. KMS service (kms-service.ts) reads via these.
  knex.primaryNode = () => knex;
  knex.replicaNode = () => knex;

  initLogger();

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const hsmConfig = getHsmConfig(logger);

  const hsmModule = initializeHsmModule(hsmConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig: hsmConfig
  });
  await hsmService.startService();
  const envConfig = await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

  // Wire just enough of the DAL graph for kmsService.createCipherPairWithDataKey
  // against an organization. projectDAL is required by the factory contract
  // even though it's only used on the project-scoped path.
  const kmsDAL = kmskeyDALFactory(knex);
  const internalKmsDAL = internalKmsDALFactory(knex);
  const internalKmsKeyVersionDAL = internalKmsKeyVersionDALFactory(knex);
  const orgDAL = orgDALFactory(knex);
  const projectDAL = projectDALFactory(knex);
  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsDAL,
    internalKmsDAL,
    internalKmsKeyVersionDAL,
    orgDAL,
    projectDAL,
    hsmService,
    envConfig
  });
  // Loads the decrypted root key into the service's in-memory buffer; the
  // generateKmsKey path called by createCipherPairWithDataKey requires it.
  // Gamma doesn't use HSM, so we pass an empty status — `null` strategy +
  // `isHsmConfigured: false` matches the runtime status the main app reports.
  await kmsService.startService({ rootKmsConfigEncryptionStrategy: null, isHsmConfigured: false });

  let org = await knex(TableName.Organization).where({ slug: orgSlug }).first();
  if (!org) {
    [org] = await knex(TableName.Organization)
      .insert({ name: orgName, slug: orgSlug, customerId: null, scimEnabled: true })
      .returning("*");
    console.log(`[seed] created org id=${org.id} slug=${orgSlug}`);
  } else {
    if (!org.scimEnabled) {
      await knex(TableName.Organization).where({ id: org.id }).update({ scimEnabled: true });
      console.log(`[seed] enabled SCIM on existing org id=${org.id}`);
    }
    console.log(`[seed] org exists id=${org.id} slug=${orgSlug}`);
  }

  // Standing admin member: deleteOrgMembershipsFn runs an unconditional last-admin
  // guard, so without one every SCIM DELETE of a test user 400s. Never logs in.
  const adminUsername = `e2e-admin@${E2E_EMAIL_DOMAIN}`;
  let adminUser = await knex(TableName.Users).where({ username: adminUsername }).first();
  if (!adminUser) {
    [adminUser] = await knex(TableName.Users)
      .insert({
        username: adminUsername,
        email: adminUsername,
        firstName: "E2E",
        lastName: "Admin",
        isAccepted: true,
        isEmailVerified: true
      })
      .returning("*");
    console.log(`[seed] created e2e admin user id=${adminUser.id} (${adminUsername})`);
  } else {
    console.log(`[seed] e2e admin user exists id=${adminUser.id} (${adminUsername})`);
  }

  let adminMembership = await knex(TableName.Membership)
    .where({ scopeOrgId: org.id, scope: AccessScope.Organization, actorUserId: adminUser.id })
    .first();
  if (!adminMembership) {
    [adminMembership] = await knex(TableName.Membership)
      .insert({
        scopeOrgId: org.id,
        scope: AccessScope.Organization,
        actorUserId: adminUser.id,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await knex(TableName.MembershipRole).insert({
      membershipId: adminMembership.id,
      role: OrgMembershipRole.Admin
    });
    console.log(`[seed] created e2e admin membership id=${adminMembership.id} role=admin`);
  } else {
    await knex(TableName.Membership).where({ id: adminMembership.id }).update({ isActive: true });
    const adminRole = await knex(TableName.MembershipRole)
      .where({ membershipId: adminMembership.id, role: OrgMembershipRole.Admin, isTemporary: false })
      .first();
    if (!adminRole) {
      await knex(TableName.MembershipRole).insert({
        membershipId: adminMembership.id,
        role: OrgMembershipRole.Admin
      });
      console.log(`[seed] e2e admin membership id=${adminMembership.id} — restored admin role`);
    } else {
      console.log(`[seed] e2e admin membership exists id=${adminMembership.id} role=admin`);
    }
  }

  let scimToken = await knex(TableName.ScimToken)
    .where({ orgId: org.id, description: scimTokenDescription })
    .first();
  if (!scimToken) {
    [scimToken] = await knex(TableName.ScimToken)
      .insert({
        orgId: org.id,
        description: scimTokenDescription,
        ttlDays: 0
      })
      .returning("*");
    console.log(`[seed] created scim token row id=${scimToken.id}`);
  } else {
    console.log(`[seed] scim token row exists id=${scimToken.id}`);
  }

  // SAML config pointing at the mock IdP. The encryptor uses the org's KMS
  // data key (created lazily on first access), so gamma's runtime SAML
  // service decrypts these via the same code path.
  const idpCert = fs.readFileSync(IDP_CERT_PATH, "utf8");
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId: org.id
  });
  const encryptedEntryPoint = encryptor({ plainText: Buffer.from(IDP_ENTRY_POINT) }).cipherTextBlob;
  const encryptedIssuer = encryptor({ plainText: Buffer.from(IDP_ISSUER) }).cipherTextBlob;
  const encryptedCert = encryptor({ plainText: Buffer.from(idpCert) }).cipherTextBlob;

  const existingSamlConfig = await knex(TableName.SamlConfig).where({ orgId: org.id }).first();
  let samlConfigId: string;
  if (!existingSamlConfig) {
    const [samlConfig] = await knex(TableName.SamlConfig)
      .insert({
        orgId: org.id,
        authProvider: SamlProviders.KEYCLOAK_SAML,
        isActive: true,
        encryptedSamlEntryPoint: encryptedEntryPoint,
        encryptedSamlIssuer: encryptedIssuer,
        encryptedSamlCertificate: encryptedCert,
        enableGroupSync: false
      })
      .returning("*");
    samlConfigId = samlConfig.id;
    console.log(`[seed] created saml config row id=${samlConfig.id} (mock idp ${IDP_ISSUER})`);
  } else {
    await knex(TableName.SamlConfig).where({ id: existingSamlConfig.id }).update({
      authProvider: SamlProviders.KEYCLOAK_SAML,
      isActive: true,
      encryptedSamlEntryPoint: encryptedEntryPoint,
      encryptedSamlIssuer: encryptedIssuer,
      encryptedSamlCertificate: encryptedCert
    });
    samlConfigId = existingSamlConfig.id;
    console.log(`[seed] saml config row exists id=${existingSamlConfig.id} — refreshed cert/entryPoint/issuer`);
  }

  // Verified email domain for SCIM-provisioned test users. Bypasses the DNS-TXT
  // verification flow by inserting status=verified directly. Idempotent on
  // (orgId, domain). Future-dated codeExpiresAt is a placeholder — once
  // status is verified, the runtime code path doesn't read expiry.
  const existingDomain = await knex(TableName.EmailDomains)
    .where({ orgId: org.id, domain: E2E_EMAIL_DOMAIN })
    .first();
  if (!existingDomain) {
    const [domainRow] = await knex(TableName.EmailDomains)
      .insert({
        orgId: org.id,
        domain: E2E_EMAIL_DOMAIN,
        verificationMethod: "dns-txt",
        verificationCode: "e2e-bootstrap-no-verification-required",
        verificationRecordName: `_infisical-verify.${E2E_EMAIL_DOMAIN}`,
        status: "verified",
        verifiedAt: new Date(),
        codeExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      })
      .returning("*");
    console.log(`[seed] created verified email domain id=${domainRow.id} (${E2E_EMAIL_DOMAIN})`);
  } else if (existingDomain.status !== "verified") {
    await knex(TableName.EmailDomains)
      .where({ id: existingDomain.id })
      .update({ status: "verified", verifiedAt: new Date() });
    console.log(`[seed] email domain row exists id=${existingDomain.id} — flipped to verified`);
  } else {
    console.log(`[seed] email domain row exists id=${existingDomain.id} (already verified)`);
  }

  // saml-config-service.updateSamlCfg() flips scimEnabled to false; we bypass
  // that path with a direct INSERT/UPDATE here, but re-assert true defensively
  // in case anything else in the bootstrap leaves it disabled.
  await knex(TableName.Organization).where({ id: org.id }).update({ scimEnabled: true });

  const appCfg = getConfig();
  const jwt = crypto.jwt().sign(
    {
      scimTokenId: scimToken.id,
      authTokenType: AuthTokenType.SCIM_TOKEN
    },
    appCfg.AUTH_SECRET
  );

  console.log("");
  console.log("=== e2e fixtures ===");
  console.log(`  organizationId      = ${org.id}`);
  console.log(`  E2E_ORG_SLUG        = ${orgSlug}`);
  console.log(`  E2E_SCIM_TOKEN      = ${jwt}`);
  console.log(`  E2E_SAML_CONFIG_ID  = ${samlConfigId}`);
  console.log("");
  console.log("Next steps (see e2e/CLAUDE.md):");
  console.log("  1. Confirm plan.scim and plan.samlSSO are enabled for this org.");
  console.log("  2. Deploy the mock IdP Worker with the SAML_IDP_PRIVATE_KEY and SAML_IDP_ADMIN_TOKEN");
  console.log("     secrets set via `wrangler secret put`, and an IDP_SESSIONS KV namespace created.");
  console.log("  3. Stash E2E_SCIM_TOKEN and E2E_IDP_ADMIN_TOKEN in the infrastructure repo GH");
  console.log("     Actions secrets.");

  await knex.destroy();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
