/* eslint-disable no-console */
// Standalone dev helper: stands up everything needed to test LDAP SSO against the local OpenLDAP
// dev container, without touching the shared `seed-dev` data. It is idempotent and writes:
//   1. a login-capable `admin@ldap.com` admin (password `password123!`),
//   2. a `status=verified` `ldap.com` email-domain row (satisfies verifyEmailDomainOwnership
//      for LDAP logins), and
//   3. an active `ldap_configs` row pointing at OpenLDAP, bind DN/password encrypted with the org
//      KMS data key (the same key the login path decrypts with).
//
// Org selection:
//   * `make seed-dev-ldap ORG_ID=<uuid>` / `npm run seed-ldap -- <uuid>` -> configure that org.
//   * no org id -> bootstrap a dedicated `ldap` org (slug `ldap`) if missing.
//
// The directory entries themselves live in docker/openldap/bootstrap.ldif (`make seed-dev-ldap`
// applies both). The seeded users john, alice, and admin all sign in with `password123!`, by uid
// (john) or email (admin@ldap.com). See sso.md.
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

  const email = process.env.SEED_SSO_USER_EMAIL || "admin@ldap.com";
  const password = process.env.SEED_SSO_USER_PASSWORD || "password123!";
  const domain = (process.env.SEED_SSO_DOMAIN || email.split("@")[1] || "ldap.com").toLowerCase().trim();

  // The backend binds to OpenLDAP over the internal compose network (openldap:389). LDAP has no
  // browser redirect, so there is no hostname/issuer problem. Override for a host-run backend
  // (e.g. ldap://localhost:389).
  const url = process.env.SEED_LDAP_URL || "ldap://openldap:389";
  const bindDN = process.env.SEED_LDAP_BIND_DN || "cn=admin,dc=ldap,dc=com";
  const bindPass = process.env.SEED_LDAP_BIND_PASS || "admin";
  const searchBase = process.env.SEED_LDAP_SEARCH_BASE || "ou=people,dc=ldap,dc=com";
  const groupSearchBase = process.env.SEED_LDAP_GROUP_SEARCH_BASE || "ou=groups,dc=ldap,dc=com";
  // Match on uid OR mail so you can sign in with `john` or `admin@ldap.com`.
  const searchFilter = process.env.SEED_LDAP_SEARCH_FILTER || "(|(uid={{username}})(mail={{username}}))";

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

    // Resolve the org: use the one the caller passed, otherwise bootstrap a dedicated `ldap` org.
    let org;
    if (useProvidedOrg) {
      org = await orgDAL.findById(orgIdArg);
      if (!org) {
        logger.error(
          `LDAP seed: org not found [orgId=${orgIdArg}]. Pass an existing org id, or omit it to bootstrap one.`
        );
        process.exitCode = 1;
        return;
      }
    } else {
      org = await db(TableName.Organization).where({ slug: "ldap" }).first();
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
          .insert({ name: "LDAP Org", slug: "ldap", customerId: null })
          .returning("*");
        logger.info(`LDAP seed: bootstrapped org 'ldap' [orgId=${org.id}]`);
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
          firstName: "LDAP",
          lastName: "Admin",
          authMethods: [AuthMethod.EMAIL],
          isAccepted: true,
          isEmailVerified: true,
          isMfaEnabled: false,
          mfaMethods: null,
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

    // Active LDAP config. The bind DN/password are encrypted with the org KMS data key, the same
    // key the LDAP login path decrypts with, so placeholders would break the bind.
    const { encryptor } = await kmsService.createCipherPairWithDataKey(
      { type: KmsDataKey.Organization, orgId: org.id },
      db
    );

    await db(TableName.LdapConfig).where({ orgId: org.id }).del();
    await db(TableName.LdapConfig).insert({
      orgId: org.id,
      isActive: true,
      url,
      uniqueUserAttribute: "uid",
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter: "",
      encryptedLdapBindDN: encryptor({ plainText: Buffer.from(bindDN) }).cipherTextBlob,
      encryptedLdapBindPass: encryptor({ plainText: Buffer.from(bindPass) }).cipherTextBlob,
      encryptedLdapCaCertificate: null,
      encryptedLdapClientCertificate: null,
      encryptedLdapClientKeyCertificate: null
    });

    logger.info(
      `LDAP seeded [orgId=${org.id}] [org=${org.slug}]: admin '${email}', verified domain '${domain}', active LDAP config -> ${url}`
    );
  } finally {
    await db.destroy();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
