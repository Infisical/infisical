/* eslint-disable no-console */
// Standalone dev helper: stands up everything needed to test OIDC SSO against the local Keycloak
// dev container, without touching the shared `seed-dev` data. It is idempotent and writes:
//   1. a login-capable `admin@oidc.com` admin (password `password123!`),
//   2. a `status=verified` `oidc.com` email-domain row (satisfies verifyEmailDomainOwnership
//      for OIDC logins), and
//   3. an active `oidc_configs` row pointing at Keycloak, client id/secret encrypted with the org
//      KMS data key (the same key the login path decrypts with).
//
// Org selection:
//   * `make seed-dev-oidc ORG_ID=<uuid>` / `npm run seed-oidc -- <uuid>` -> configure that org.
//   * no org id -> bootstrap a dedicated `oidc` org (slug `oidc`) if missing.
//
// It is deliberately NOT a Knex seed in `src/db/seeds/` (those all run on every `seed-dev`), so a
// normal dev never ends up with a dangling active SSO config. See sso.md.
import argon2, { argon2id } from "argon2";
import jsrp from "jsrp";

import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { initLogger, logger } from "@app/lib/logger";
import { AuthMethod } from "@app/services/auth/auth-type";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { initDbConnection } from "./instance";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./migrations/utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./migrations/utils/services";
import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "./schemas";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SUPER_ADMIN_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

// Parameterized variant of seed-data#generateUserSrpKeys; the SRP verifier is bound to the
// username (the email here), so it can't be shared with the hardcoded seed user.
const generateUserSrpKeys = async (email: string, password: string) => {
  const { publicKey, privateKey } = await crypto.encryption().asymmetric().generateKeyPair();

  // eslint-disable-next-line
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: email, password }, () => resolve(null));
  });
  const { salt, verifier } = await new Promise<{ salt: string; verifier: string }>((resolve, reject) => {
    client.createVerifier((err, res) => (err ? reject(err) : resolve(res)));
  });

  const derivedKey = await argon2.hash(password, {
    salt: Buffer.from(salt),
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    type: argon2id,
    raw: true
  });
  if (!derivedKey) throw new Error("Failed to derive key from password");

  const key = crypto.randomBytes(32);
  const {
    ciphertext: encryptedPrivateKey,
    iv: encryptedPrivateKeyIV,
    tag: encryptedPrivateKeyTag
  } = crypto.encryption().symmetric().encrypt({ plaintext: privateKey, key, keySize: SymmetricKeySize.Bits128 });
  const {
    ciphertext: protectedKey,
    iv: protectedKeyIV,
    tag: protectedKeyTag
  } = crypto
    .encryption()
    .symmetric()
    .encrypt({ plaintext: key.toString("hex"), key: derivedKey, keySize: SymmetricKeySize.Bits128 });

  return {
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    publicKey,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier
  };
};

const main = async () => {
  initLogger();

  const orgIdArg = process.argv[2] || process.env.SEED_ORG_ID || "";
  const useProvidedOrg = Boolean(orgIdArg);

  const email = process.env.SEED_SSO_USER_EMAIL || "admin@oidc.com";
  const password = process.env.SEED_SSO_USER_PASSWORD || "password123!";
  const domain = (process.env.SEED_SSO_DOMAIN || email.split("@")[1] || "oidc.com").toLowerCase().trim();
  const clientId = process.env.SEED_OIDC_CLIENT_ID || "infisical-dev";
  const clientSecret = process.env.SEED_OIDC_CLIENT_SECRET || "infisical-dev-client-secret";
  // The backend fetches discovery over the internal compose network (keycloak:8080). Keycloak's
  // KC_HOSTNAME pins the issuer and browser-facing endpoints to http://localhost:8088, so the
  // browser stays on localhost and no keycloak.local /etc/hosts entry is needed. Override for a
  // host-run backend (e.g. http://localhost:8088/...).
  const discoveryURL =
    process.env.SEED_OIDC_DISCOVERY_URL || "http://keycloak:8080/realms/infisical/.well-known/openid-configuration";
  const jwtSignatureAlgorithm = process.env.SEED_OIDC_JWT_ALG || "RS256";

  const dbConnectionUri = process.env.DB_CONNECTION_URI;
  if (!dbConnectionUri) throw new Error("DB_CONNECTION_URI is not set");

  const db = initDbConnection({ dbConnectionUri });

  try {
    // Bootstrap the KMS stack outside the service container, exactly as the *-to-kms migrations do.
    const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
    const superAdminDAL = superAdminDALFactory(db);
    const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
    const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
    const keyStore = inMemoryKeyStore();
    const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db });
    const orgDAL = orgDALFactory(db);

    // Resolve the org: use the one the caller passed, otherwise bootstrap a dedicated `oidc` org.
    let org;
    if (useProvidedOrg) {
      org = await orgDAL.findById(orgIdArg);
      if (!org) {
        logger.error(
          `SSO seed: org not found [orgId=${orgIdArg}]. Pass an existing org id, or omit it to bootstrap one.`
        );
        process.exitCode = 1;
        return;
      }
    } else {
      org = await db(TableName.Organization).where({ slug: "oidc" }).first();
      if (!org) {
        // Make sure a fresh DB is marked initialized so the instance is usable.
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
          .insert({ name: "OIDC Org", slug: "oidc", customerId: null })
          .returning("*");
        logger.info(`SSO seed: bootstrapped org 'oidc' [orgId=${org.id}]`);
      }
    }

    // Ensure a login-capable admin user with this email, then ensure org membership (admin role).
    let user = await db(TableName.Users).where({ email }).first();
    if (!user) {
      [user] = await db(TableName.Users)
        .insert({
          username: email,
          email,
          // Full instance admin only when standing up our own dev org; when configuring a
          // caller-provided org, just add a normal org admin.
          superAdmin: !useProvidedOrg,
          firstName: "Test",
          lastName: "",
          authMethods: [AuthMethod.EMAIL],
          isAccepted: true,
          isEmailVerified: true,
          isMfaEnabled: false,
          devices: null
        })
        .returning("*");

      const hashedPassword = await crypto.hashing().createHash(password, 10);
      await db(TableName.Users).where({ id: user.id }).update({ hashedPassword });

      const k = await generateUserSrpKeys(email, password);
      await db(TableName.UserEncryptionKey).insert({
        encryptionVersion: 2,
        protectedKey: k.protectedKey,
        protectedKeyIV: k.protectedKeyIV,
        protectedKeyTag: k.protectedKeyTag,
        publicKey: k.publicKey,
        encryptedPrivateKey: k.encryptedPrivateKey,
        iv: k.encryptedPrivateKeyIV,
        tag: k.encryptedPrivateKeyTag,
        salt: k.salt,
        verifier: k.verifier,
        userId: user.id
      });
    }

    const existingMembership = await db(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: org.id, actorUserId: user.id })
      .first();
    if (!existingMembership) {
      const [membership] = await db(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: org.id,
          actorUserId: user.id,
          isActive: true,
          status: OrgMembershipStatus.Accepted
        })
        .returning("*");
      await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Admin });
    }

    // Pre-verified email domain (plain insert; email_domains has no encrypted columns).
    await db(TableName.EmailDomains).where({ orgId: org.id, domain }).del();
    await db(TableName.EmailDomains).insert({
      orgId: org.id,
      domain,
      verificationMethod: "seed",
      verificationCode: crypto.randomBytes(16).toString("hex"),
      verificationRecordName: `_infisical-verification.${domain}`,
      status: EmailDomainStatus.Verified,
      verifiedAt: new Date(),
      codeExpiresAt: new Date(Date.now() + ONE_YEAR_MS)
    });

    // Active OIDC config. client id/secret are encrypted with the org KMS data key, the same
    // key the OIDC login path decrypts with, so placeholders would break login.
    const { encryptor } = await kmsService.createCipherPairWithDataKey(
      { type: KmsDataKey.Organization, orgId: org.id },
      db
    );

    await db(TableName.OidcConfig).where({ orgId: org.id }).del();
    await db(TableName.OidcConfig).insert({
      orgId: org.id,
      configurationType: "discoveryURL",
      discoveryURL,
      isActive: true,
      jwtSignatureAlgorithm,
      manageGroupMemberships: false,
      allowedEmailDomains: null,
      encryptedOidcClientId: encryptor({ plainText: Buffer.from(clientId) }).cipherTextBlob,
      encryptedOidcClientSecret: encryptor({ plainText: Buffer.from(clientSecret) }).cipherTextBlob
    });

    logger.info(
      `SSO seeded [orgId=${org.id}] [org=${org.slug}]: admin '${email}', verified domain '${domain}', active OIDC config -> ${discoveryURL}`
    );
  } finally {
    await db.destroy();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
