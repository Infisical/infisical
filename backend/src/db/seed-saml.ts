/* eslint-disable no-console */
// Standalone dev helper: stands up SAML SSO + real SCIM provisioning against the local Authentik
// IdP (`make up-dev-saml`), without touching the shared `seed-dev` data. One `saml` org is used for
// both, since SCIM provisions the user and SAML logs them in (the SAML NameID must equal the SCIM
// userName, and Infisical only allows SCIM once an SSO config exists). It orchestrates BOTH sides:
//   * Infisical (DB): a `saml` org (scimEnabled), a login-capable `admin@saml.com` admin, a verified
//     `saml.com` domain, a SCIM token, and an active SAML config (Authentik's entryPoint + signing cert).
//   * Authentik (API, via the bootstrap token): the test users john/alice@saml.com in a group, a SAML
//     provider (ACS -> Infisical, NameID = email, audience spn:SITE_URL for SP-initiated), a SCIM
//     provider pointed at Infisical's SCIM endpoint with that token, and an application binding both.
//   * A SCIM sync is triggered at the end (provider save), provisioning the group into Infisical.
//
// Run: `make seed-dev-saml` / `npm run seed-saml`. See sso.md.
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { SamlProviders } from "@app/ee/services/saml-config/saml-config-types";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger, logger } from "@app/lib/logger";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { initDbConnection } from "./instance";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./migrations/utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./migrations/utils/services";
import { TableName } from "./schemas";
import { seedAdminUser } from "./seed-sso-shared";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SUPER_ADMIN_CONFIG_ID = "00000000-0000-0000-0000-000000000000";
// Fixed so the Infisical SAML config id (= the Authentik ACS path) is stable across re-runs.
const SAML_CONFIG_ID = "11111111-1111-1111-1111-111111111111";

const ORG_SLUG = "saml";
const ORG_NAME = "SAML Org";
const DOMAIN = "saml.com";
const ADMIN_EMAIL = "admin@saml.com";
const PASSWORD = process.env.SEED_SSO_USER_PASSWORD || "password123!";
const GROUP_NAME = "infisical-saml";
const APP_SLUG = "infisical";
const TEST_USERS = [
  { username: "john@saml.com", email: "john@saml.com", name: "John Doe" },
  { username: "alice@saml.com", email: "alice@saml.com", name: "Alice Smith" }
];

// Where the browser is sent (must be host-reachable) vs. where the backend/seed call the API and
// where Authentik's SCIM sync calls Infisical back (compose-internal).
const SITE_URL = process.env.SITE_URL || "http://localhost:8080";
const AK_PUBLIC = process.env.SEED_AUTHENTIK_PUBLIC_URL || "http://localhost:9100";
const AK = `${process.env.SEED_AUTHENTIK_URL || "http://authentik-server:9000"}/api/v3`;
const AK_TOKEN = process.env.SEED_AUTHENTIK_TOKEN || "authentik-dev-bootstrap-token";
const INFISICAL_SCIM_URL = process.env.SEED_SCIM_URL || "http://backend:4000/api/v1/scim";
const SAML_ENTRY_POINT = `${AK_PUBLIC}/application/saml/${APP_SLUG}/sso/binding/redirect/`;

const akHeaders = { Authorization: `Bearer ${AK_TOKEN}`, "Content-Type": "application/json" };

type TAkResult = { pk: string | number; [k: string]: unknown };

const akGet = async (path: string) => {
  const res = await fetch(`${AK}${path}`, { headers: akHeaders });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ results?: TAkResult[]; [k: string]: unknown }>;
};
const akSend = async (method: string, path: string, body: Record<string, unknown>) => {
  const res = await fetch(`${AK}${path}`, { method, headers: akHeaders, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  // Some endpoints (e.g. set_password) return 204 No Content.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as TAkResult;
};
// Returns the pk of the first result, or null.
const akFindPk = async (path: string) => {
  const d = await akGet(path);
  return d.results && d.results.length ? d.results[0].pk : null;
};
// Ensures a custom SAML property mapping (matched by exact name), creating it if missing.
const ensureSamlMapping = async (name: string, samlName: string, expression: string) => {
  const d = await akGet(`/propertymappings/provider/saml/?search=${encodeURIComponent(name)}`);
  const found = (d.results || []).find((r) => (r as { name?: string }).name === name);
  if (found) return found.pk;
  return (await akSend("POST", `/propertymappings/provider/saml/`, { name, saml_name: samlName, expression })).pk;
};

const main = async () => {
  initLogger();

  const dbConnectionUri = process.env.DB_CONNECTION_URI;
  if (!dbConnectionUri) throw new Error("DB_CONNECTION_URI is not set");
  const authSecret = process.env.AUTH_SECRET || process.env.JWT_AUTH_SECRET;
  if (!authSecret) throw new Error("AUTH_SECRET (or JWT_AUTH_SECRET) is not set; cannot sign the SCIM token");
  const db = initDbConnection({ dbConnectionUri });

  try {
    // ---- Infisical: KMS bootstrap ----
    const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
    const superAdminDAL = superAdminDALFactory(db);
    const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
    const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
    const keyStore = inMemoryKeyStore();
    const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db });

    // ---- Infisical: org (SCIM enabled) ----
    let org = await db(TableName.Organization).where({ slug: ORG_SLUG }).first();
    if (!org) {
      await db(TableName.SuperAdmin)
        .insert({
          // @ts-expect-error id is the fixed singleton id for the instance super-admin config row
          id: SUPER_ADMIN_CONFIG_ID,
          initialized: true,
          allowSignUp: true,
          fipsEnabled: process.env.FIPS_ENABLED === "true"
        })
        .onConflict("id")
        .ignore();
      [org] = await db(TableName.Organization)
        .insert({ name: ORG_NAME, slug: ORG_SLUG, customerId: null, scimEnabled: true })
        .returning("*");
      logger.info(`SAML seed: bootstrapped org 'saml' [orgId=${org.id}]`);
    } else if (!org.scimEnabled) {
      await db(TableName.Organization).where({ id: org.id }).update({ scimEnabled: true });
    }

    // ---- Infisical: login-capable admin (password login + org owner) ----
    await seedAdminUser(db, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      firstName: "SAML",
      lastName: "Admin",
      superAdmin: true,
      orgId: org.id
    });

    // ---- Infisical: verified email domain (required for SCIM POST + SAML login) ----
    await db(TableName.EmailDomains).where({ orgId: org.id, domain: DOMAIN }).del();
    await db(TableName.EmailDomains).insert({
      orgId: org.id,
      domain: DOMAIN,
      verificationMethod: "seed",
      verificationCode: crypto.randomBytes(16).toString("hex"),
      verificationRecordName: `_infisical-verification.${DOMAIN}`,
      status: EmailDomainStatus.Verified,
      verifiedAt: new Date(),
      codeExpiresAt: new Date(Date.now() + ONE_YEAR_MS)
    });

    // ---- Infisical: SCIM token (scim_tokens row + JWT signed with AUTH_SECRET, mirrors scim-service) ----
    // Regenerated each run; the Authentik SCIM provider is re-PATCHed with it below so the two never
    // drift (e.g. after an Infisical DB reset that leaves Authentik holding a now-dangling token).
    await db(TableName.ScimToken).where({ orgId: org.id }).del();
    const [scimTokenRow] = await db(TableName.ScimToken)
      .insert({ orgId: org.id, description: "authentik dev SCIM", ttlDays: 365 })
      .returning("*");
    const scimToken = crypto
      .jwt()
      .sign({ scimTokenId: scimTokenRow.id, authTokenType: AuthTokenType.SCIM_TOKEN }, authSecret);

    // ---- Authentik: reachability ----
    const reachable = await fetch(`${AK}/core/users/?username=akadmin`, { headers: akHeaders }).catch(() => null);
    if (!reachable || !reachable.ok) {
      logger.error(`Authentik not reachable/authorized at ${AK} (is \`make up-dev-saml\` running?).`);
      process.exitCode = 1;
      return;
    }

    // ---- Authentik: prerequisite ids (looked up by name/slug, not hardcoded) ----
    const authFlow = await akFindPk(`/flows/instances/?slug=default-provider-authorization-implicit-consent`);
    const invalidationFlow = await akFindPk(`/flows/instances/?slug=default-provider-invalidation-flow`);
    const keypairPk = await akFindPk(`/crypto/certificatekeypairs/?search=${encodeURIComponent("Self-signed")}`);

    // Custom SAML attribute mappings emitting the exact attribute names Infisical reads (`email`,
    // `firstName`, `lastName`); Authentik's defaults use different names (emailaddress, name, ...) and
    // have no first/last-name mapping (it stores only a full `name`, which we split).
    const emailMapping = await ensureSamlMapping("Infisical: email", "email", "return request.user.email");
    const firstNameMapping = await ensureSamlMapping(
      "Infisical: firstName",
      "firstName",
      'return (request.user.name or request.user.username).split(" ")[0]'
    );
    const lastNameMapping = await ensureSamlMapping(
      "Infisical: lastName",
      "lastName",
      'return " ".join((request.user.name or "").split(" ")[1:])'
    );

    // ---- Authentik: test users + group (SCIM provider syncs only this group) ----
    const userPks: (string | number)[] = [];
    for (const u of TEST_USERS) {
      // eslint-disable-next-line no-await-in-loop
      let pk = await akFindPk(`/core/users/?username=${encodeURIComponent(u.username)}`);
      if (!pk) {
        // eslint-disable-next-line no-await-in-loop
        const created = await akSend("POST", `/core/users/`, {
          username: u.username,
          name: u.name,
          email: u.email,
          is_active: true,
          path: "users"
        });
        pk = created.pk;
      }
      // eslint-disable-next-line no-await-in-loop
      await akSend("POST", `/core/users/${pk}/set_password/`, { password: PASSWORD });
      userPks.push(pk);
    }

    let groupPk = await akFindPk(`/core/groups/?name=${encodeURIComponent(GROUP_NAME)}`);
    if (!groupPk) {
      const g = await akSend("POST", `/core/groups/`, { name: GROUP_NAME, users: userPks });
      groupPk = g.pk;
    } else {
      await akSend("PATCH", `/core/groups/${groupPk}/`, { users: userPks });
    }

    // ---- Authentik: SAML provider (ACS -> Infisical, NameID = email) ----
    const samlBody = {
      name: "infisical-saml",
      authorization_flow: authFlow,
      invalidation_flow: invalidationFlow,
      acs_url: `${SITE_URL}/api/v1/sso/saml2/${SAML_CONFIG_ID}`,
      // node-saml validates the assertion audience against SITE_URL (the SP entityID / Infisical
      // `issuer`). Infisical only expects the `spn:${issuer}` variant when its spInitiated RelayState
      // reaches the ACS; Authentik doesn't carry it through, so the default SITE_URL audience applies.
      audience: SITE_URL,
      issuer: SAML_ENTRY_POINT,
      sp_binding: "post",
      signing_kp: keypairPk,
      sign_assertion: true,
      sign_response: true,
      name_id_mapping: emailMapping,
      property_mappings: [emailMapping, firstNameMapping, lastNameMapping]
    };
    let samlProviderPk = await akFindPk(`/providers/saml/?name=infisical-saml`);
    if (samlProviderPk) {
      await akSend("PATCH", `/providers/saml/${samlProviderPk}/`, samlBody);
    } else {
      samlProviderPk = (await akSend("POST", `/providers/saml/`, samlBody)).pk;
    }

    // ---- Authentik: read the SAML signing cert (for the Infisical SAML config) ----
    const certRes = await fetch(`${AK}/crypto/certificatekeypairs/${keypairPk}/view_certificate/`, {
      headers: akHeaders
    });
    if (!certRes.ok) throw new Error(`read cert -> ${certRes.status} ${await certRes.text()}`);
    const idpCert = ((await certRes.json()) as { data: string }).data;

    // ---- Infisical: active SAML config (entryPoint/issuer/cert KMS-encrypted; unblocks SCIM) ----
    const { encryptor } = await kmsService.createCipherPairWithDataKey(
      { type: KmsDataKey.Organization, orgId: org.id },
      db
    );
    await db(TableName.SamlConfig).where({ orgId: org.id }).del();
    await db(TableName.SamlConfig).insert({
      // @ts-expect-error id is normally auto-generated; we pin it so it matches the Authentik ACS path
      id: SAML_CONFIG_ID,
      orgId: org.id,
      authProvider: SamlProviders.KEYCLOAK_SAML,
      isActive: true,
      encryptedSamlEntryPoint: encryptor({ plainText: Buffer.from(SAML_ENTRY_POINT) }).cipherTextBlob,
      encryptedSamlIssuer: encryptor({ plainText: Buffer.from(SITE_URL) }).cipherTextBlob,
      encryptedSamlCertificate: encryptor({ plainText: Buffer.from(idpCert) }).cipherTextBlob
    });

    // ---- Authentik: SCIM provider -> Infisical (users + groups; service accounts excluded) ----
    const scimUserMapping = await akFindPk(
      `/propertymappings/provider/scim/?search=${encodeURIComponent("default SCIM Mapping: User")}`
    );
    const scimGroupMapping = await akFindPk(
      `/propertymappings/provider/scim/?search=${encodeURIComponent("default SCIM Mapping: Group")}`
    );
    const scimBody = {
      name: "infisical-scim",
      url: INFISICAL_SCIM_URL,
      token: scimToken,
      exclude_users_service_account: true,
      property_mappings: scimUserMapping ? [scimUserMapping] : [],
      property_mappings_group: scimGroupMapping ? [scimGroupMapping] : []
    };
    // Recreate the provider each run. Authentik stores per-object "connections" (the remote SCIM id of
    // each provisioned user/group); after an Infisical DB reset those point at rows that no longer
    // exist, so it would PUT to dead ids and provision nothing. Deleting + recreating clears them. The
    // create tolerates "provider with this name already exists" (a concurrent run or residual provider)
    // by deleting again and retrying once.
    const deleteScimProvider = async () => {
      const pk = await akFindPk(`/providers/scim/?name=infisical-scim`);
      if (pk) await fetch(`${AK}/providers/scim/${pk}/`, { method: "DELETE", headers: akHeaders });
    };
    await deleteScimProvider();
    const createScimProvider = async (): Promise<string | number> => {
      try {
        return (await akSend("POST", `/providers/scim/`, scimBody)).pk;
      } catch {
        await deleteScimProvider();
        return (await akSend("POST", `/providers/scim/`, scimBody)).pk;
      }
    };
    const scimProviderPk = await createScimProvider();

    // ---- Authentik: application binding SAML (primary) + SCIM (backchannel) ----
    const appBody = {
      name: "Infisical",
      slug: APP_SLUG,
      provider: samlProviderPk,
      backchannel_providers: [scimProviderPk]
    };
    if (await akFindPk(`/core/applications/?slug=${APP_SLUG}`)) {
      await akSend("PATCH", `/core/applications/${APP_SLUG}/`, appBody);
    } else {
      await akSend("POST", `/core/applications/`, appBody);
    }

    // Wait for the Infisical backend HTTP server to be reachable (it may still be booting after
    // `make up-dev-saml`, or mid hot-reload in dev) so Authentik's SCIM sync doesn't hit a refused
    // connection and silently provision nothing.
    const healthUrl = `${INFISICAL_SCIM_URL.replace(/\/api\/v1\/scim$/, "")}/api/status`;
    let backendUp = false;
    for (let i = 0; i < 30 && !backendUp; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      backendUp = await fetch(healthUrl)
        .then((r) => r.ok)
        .catch(() => false);
      if (!backendUp) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
      }
    }
    if (!backendUp) logger.warn(`Infisical backend not reachable at ${healthUrl}; SCIM sync may not provision.`);

    // ---- Provision + verify, with retries. Touch each test user to fire Authentik's per-object SCIM
    // sync (the user + their groups, i.e. infisical-saml). The sync is async, so poll Infisical and
    // re-touch for a few rounds: a transient miss (backend mid-restart, etc.) self-heals instead of
    // silently provisioning nothing. Per-object sync also keeps it scoped (no full-sync built-in-group
    // noise); the SCIM provider stays linked to the app as its backchannel provider. ----
    const expectedEmails = TEST_USERS.map((u) => u.email);
    let usersOk = 0;
    let groupMembers = 0;
    for (
      let round = 0;
      round < 8 && !(usersOk >= expectedEmails.length && groupMembers >= TEST_USERS.length);
      round += 1
    ) {
      // A changing attribute guarantees a save (hence a direct sync) each round. Touch the users so
      // they provision, and the group so it provisions with its members (the group re-syncs across
      // rounds until the users it references exist in Infisical).
      // eslint-disable-next-line no-await-in-loop
      await Promise.all([
        ...userPks.map((pk) => akSend("PATCH", `/core/users/${pk}/`, { attributes: { infisicalResync: round } })),
        akSend("PATCH", `/core/groups/${groupPk}/`, { attributes: { infisicalResync: round } })
      ]);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
      // eslint-disable-next-line no-await-in-loop
      usersOk = (await db(TableName.Users).whereIn("email", expectedEmails).select("id")).length;
      // eslint-disable-next-line no-await-in-loop
      const grp = await db(TableName.Groups).where({ orgId: org.id, name: GROUP_NAME }).first();
      groupMembers = grp
        ? // eslint-disable-next-line no-await-in-loop
          Number((await db(TableName.UserGroupMembership).where({ groupId: grp.id }).count())[0].count)
        : 0;
    }
    if (usersOk >= expectedEmails.length && groupMembers >= TEST_USERS.length) {
      logger.info(`SCIM provisioning confirmed (${usersOk} users + ${GROUP_NAME} with ${groupMembers} members)`);
    } else {
      logger.warn(
        `SCIM provisioning incomplete (users ${usersOk}/${expectedEmails.length}, ${GROUP_NAME} members ${groupMembers}); re-run`
      );
    }

    logger.info(
      `SAML/SCIM seeded [org=${org.slug}]: admin '${ADMIN_EMAIL}', verified '${DOMAIN}', SAML entryPoint ${SAML_ENTRY_POINT}, SCIM -> ${INFISICAL_SCIM_URL}; provisioning ${TEST_USERS.map(
        (u) => u.email
      ).join(", ")}`
    );
  } finally {
    await db.destroy();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
