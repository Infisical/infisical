// Shared helpers for the standalone SSO dev seeds: SRP key generation and login-capable
// admin-user + org-membership creation. Used by seed-saml.ts (seed-oidc/seed-ldap still inline
// their own copies; converge them here when convenient). See sso.md.
import argon2, { argon2id } from "argon2";
import jsrp from "jsrp";
import { Knex } from "knex";

import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { AuthMethod } from "@app/services/auth/auth-type";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "./schemas";

// Parameterized variant of seed-data#generateUserSrpKeys; the SRP verifier is bound to the
// username (the email here), so it can't be shared with the hardcoded seed user.
export const generateUserSrpKeys = async (email: string, password: string) => {
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

type TSeedAdminUserDTO = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  superAdmin: boolean;
  orgId: string;
};

// Creates a login-capable user (if missing) and ensures an org Admin membership.
export const seedAdminUser = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Knex<any, unknown[]>,
  { email, password, firstName, lastName, superAdmin, orgId }: TSeedAdminUserDTO
) => {
  let user = await db(TableName.Users).where({ email }).first();
  if (!user) {
    [user] = await db(TableName.Users)
      .insert({
        username: email,
        email,
        superAdmin,
        firstName,
        lastName,
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

  const existing = await db(TableName.Membership)
    .where({ scope: AccessScope.Organization, scopeOrgId: orgId, actorUserId: user.id })
    .first();
  if (!existing) {
    const [membership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: user.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Admin });
  }

  return user;
};
