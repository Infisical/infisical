/* eslint-disable no-await-in-loop */
import snowflake from "snowflake-sdk";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import {
  executeSnowflakeSql,
  quoteSnowflakeIdent,
  sanitizeSnowflakeError,
  withSnowflakeClient
} from "@app/services/app-connection/snowflake";

import {
  TSnowflakeUserKeyPairRotationGeneratedCredentials,
  TSnowflakeUserKeyPairRotationWithConnection
} from "./snowflake-user-key-pair-rotation-types";

const RSA_PUBLIC_KEY_FIRST_SLOT = "RSA_PUBLIC_KEY";
const RSA_PUBLIC_KEY_SECOND_SLOT = "RSA_PUBLIC_KEY_2";

// Snowflake exposes two public-key slots per user. index 0 -> RSA_PUBLIC_KEY, index 1 -> RSA_PUBLIC_KEY_2.
const RSA_PUBLIC_KEY_SLOTS = [RSA_PUBLIC_KEY_FIRST_SLOT, RSA_PUBLIC_KEY_SECOND_SLOT] as const;
type TSnowflakePublicKeySlot = (typeof RSA_PUBLIC_KEY_SLOTS)[number];

const slotForIndex = (index: number): TSnowflakePublicKeySlot =>
  index === 0 ? RSA_PUBLIC_KEY_FIRST_SLOT : RSA_PUBLIC_KEY_SECOND_SLOT;

const generateRsaKeyPair = (modulusLength: number) =>
  new Promise<{ privateKey: string; publicKey: string }>((resolve, reject) => {
    crypto.nativeCrypto.generateKeyPair(
      "rsa",
      {
        modulusLength,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
      },
      (err, publicKey, privateKey) => {
        if (err) reject(err);
        else resolve({ publicKey, privateKey });
      }
    );
  });

// Snowflake's ALTER USER ... SET RSA_PUBLIC_KEY expects the base64 body only (no PEM delimiters/newlines).
const toSnowflakePublicKeyBody = (spkiPem: string) =>
  spkiPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");

// Snowflake stores the public key fingerprint as SHA256:<base64(sha256(spki-DER))>.
const computeFingerprint = (privateKeyPem: string) => {
  const privateKeyObj = crypto.nativeCrypto.createPrivateKey({ key: privateKeyPem, format: "pem", type: "pkcs8" });
  const publicKeyDer = crypto.nativeCrypto.createPublicKey(privateKeyObj).export({ type: "spki", format: "der" });
  return `SHA256:${crypto.nativeCrypto.createHash("sha256").update(publicKeyDer).digest("base64")}`;
};

export const snowflakeUserKeyPairRotationFactory: TRotationFactory<
  TSnowflakeUserKeyPairRotationWithConnection,
  TSnowflakeUserKeyPairRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { username, modulusLength },
    activeIndex,
    secretsMapping
  } = secretRotation;

  // The connection's own credentials are used to perform the rotation, so rotating that same user's
  // key can break the connection. Disallow targeting it. Snowflake login names are case-insensitive
  // (unquoted identifiers fold to uppercase), so compare case-insensitively.
  if (username.trim().toUpperCase() === connection.credentials.username.trim().toUpperCase()) {
    throw new BadRequestError({
      message:
        "The user being rotated cannot be the same as the user configured on the Snowflake connection, since the connection's credentials are used to perform the rotation."
    });
  }

  const runSnowflake = async <T>(fn: (client: snowflake.Connection) => Promise<T>, errorPrefix: string): Promise<T> => {
    try {
      return await withSnowflakeClient(connection.credentials, fn);
    } catch (error) {
      throw sanitizeSnowflakeError(error, connection.credentials, errorPrefix);
    }
  };

  // Snowflake's DESC USER can return the literal string "null" when a key slot is unset.
  const isPresentFingerprint = (value: string | null | undefined): value is string =>
    typeof value === "string" && value.trim() !== "" && value.trim().toLowerCase() !== "null";

  const readFingerprints = async (client: snowflake.Connection, resolvedUsername: string) => {
    // DESC USER returns one row per user property with `property`/`value` columns. Snowflake reports
    // these column names in lowercase, but we read them case-insensitively to be safe across drivers.
    const rows = await executeSnowflakeSql<Record<string, unknown>>(
      client,
      `DESC USER ${quoteSnowflakeIdent(resolvedUsername)}`
    );

    const fingerprints: Partial<Record<TSnowflakePublicKeySlot, string>> = {};
    for (const row of rows) {
      const property = String(row.property ?? row.PROPERTY ?? "").toUpperCase();
      const value = (row.value ?? row.VALUE) as string | null | undefined;
      if (isPresentFingerprint(value)) {
        if (property === "RSA_PUBLIC_KEY_FP") fingerprints.RSA_PUBLIC_KEY = value;
        else if (property === "RSA_PUBLIC_KEY_2_FP") fingerprints.RSA_PUBLIC_KEY_2 = value;
      }
    }
    return fingerprints;
  };

  const resolveSnowflakeUsername = async (client: snowflake.Connection): Promise<string | null> => {
    const escapedUsername = username.replace(/'/g, "''");
    const rows = await executeSnowflakeSql<Record<string, unknown>>(client, `SHOW USERS LIKE '${escapedUsername}'`);
    const names = rows.map((row) => String(row.name ?? row.NAME ?? ""));
    const matches = names.filter((name) => name.toUpperCase() === username.toUpperCase());

    if (matches.length > 1) {
      throw new BadRequestError({
        message: `Multiple Snowflake users found for "${username}". Please ensure the username is unique.`
      });
    }
    return matches[0] ?? null;
  };

  // Assign the public key to the given slot, then confirm Snowflake stored it by comparing fingerprints.
  const setPublicKeyForSlot = async (
    slot: TSnowflakePublicKeySlot,
    keyPair: { privateKey: string; publicKey: string }
  ) => {
    const expectedFingerprint = computeFingerprint(keyPair.privateKey);

    const fingerprints = await runSnowflake(async (client) => {
      const resolvedUsername = (await resolveSnowflakeUsername(client)) ?? username;
      await executeSnowflakeSql(
        client,
        `ALTER USER ${quoteSnowflakeIdent(resolvedUsername)} SET ${slot} = '${toSnowflakePublicKeyBody(keyPair.publicKey)}'`
      );
      return readFingerprints(client, resolvedUsername);
    }, `Failed to set RSA public key for Snowflake user "${username}"`);

    if (fingerprints[slot] !== expectedFingerprint) {
      throw new BadRequestError({
        message: `Failed to verify the RSA public key on Snowflake user "${username}" (${slot}). Ensure the connection's role has privileges to alter this user.`
      });
    }
  };

  // Create the target user as a key-pair-only SERVICE account if it does not already exist. We check
  // first (rather than CREATE USER IF NOT EXISTS) so managing a pre-existing user still needs only
  // ALTER privileges; the CREATE USER privilege is required only when a user is actually created.
  const ensureUserExists = async () => {
    await runSnowflake(async (client) => {
      const resolvedUsername = await resolveSnowflakeUsername(client);
      if (!resolvedUsername) {
        // Create the user in Snowflake's canonical (uppercase) form, matching how an unquoted CREATE USER
        // folds the identifier, so the account resolves case-insensitively on every subsequent rotation.
        await executeSnowflakeSql(
          client,
          `CREATE USER ${quoteSnowflakeIdent(username.toUpperCase())} TYPE = SERVICE COMMENT = 'Created by Infisical secret rotation'`
        );
      }
    }, `Failed to ensure Snowflake user "${username}" exists`);
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TSnowflakeUserKeyPairRotationGeneratedCredentials> = async (
    callback
  ) => {
    // On creation the first credential always occupies slot 0 (activeIndex defaults to 0).
    const keyPair = await generateRsaKeyPair(modulusLength);
    await ensureUserExists();

    // Block creation if the RSA_PUBLIC_KEY slot already holds a key, so we never overwrite a
    // pre-existing key that was set outside this rotation. We resolve the slot occupancy outside
    // runSnowflake so the BadRequestError isn't re-wrapped by sanitizeSnowflakeError.
    const fingerprints = await runSnowflake(async (client) => {
      const resolvedUsername = (await resolveSnowflakeUsername(client)) ?? username;
      return readFingerprints(client, resolvedUsername);
    }, `Failed to read existing RSA public keys for Snowflake user "${username}"`);

    if (fingerprints.RSA_PUBLIC_KEY || fingerprints.RSA_PUBLIC_KEY_2) {
      throw new BadRequestError({
        message: `Snowflake user "${username}" already has a key set in the RSA_PUBLIC_KEY slot. Remove it before creating this rotation so an existing key is not overwritten.`
      });
    }

    await setPublicKeyForSlot(slotForIndex(0), keyPair);
    return callback(keyPair);
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TSnowflakeUserKeyPairRotationGeneratedCredentials
  > = async (_credentialsToRevoke, callback) => {
    // Write the new key to the currently-inactive slot. SET overwrites whatever key was there
    // (invalidating the credential from two rotations ago), while the active slot's key remains
    // valid as the retired credential - Snowflake's documented no-downtime dual-key rotation.
    const inactiveIndex = (activeIndex + 1) % RSA_PUBLIC_KEY_SLOTS.length;
    const keyPair = await generateRsaKeyPair(modulusLength);
    await setPublicKeyForSlot(slotForIndex(inactiveIndex), keyPair);
    return callback(keyPair);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TSnowflakeUserKeyPairRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    if (!credentialsToRevoke?.length) return callback();

    // Only unset slots holding a key Infisical generated, so we never remove a key set outside this rotation.
    const managedFingerprints = new Set(credentialsToRevoke.map((cred) => computeFingerprint(cred.privateKey)));

    await runSnowflake(async (client) => {
      const resolvedUsername = (await resolveSnowflakeUsername(client)) ?? username;
      const fingerprints = await readFingerprints(client, resolvedUsername);
      for (const slot of RSA_PUBLIC_KEY_SLOTS) {
        const slotFingerprint = fingerprints[slot];
        if (slotFingerprint && managedFingerprints.has(slotFingerprint)) {
          await executeSnowflakeSql(client, `ALTER USER ${quoteSnowflakeIdent(resolvedUsername)} UNSET ${slot}`);
        }
      }
    }, `Failed to revoke RSA public keys for Snowflake user "${username}"`);

    return callback();
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TSnowflakeUserKeyPairRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.privateKey, value: generatedCredentials.privateKey },
    { key: secretsMapping.publicKey, value: generatedCredentials.publicKey }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TSnowflakeUserKeyPairRotationGeneratedCredentials
  > = async (activeCredentials) => {
    const expectedFingerprint = computeFingerprint(activeCredentials.privateKey);
    const fingerprints = await runSnowflake(async (client) => {
      const resolvedUsername = (await resolveSnowflakeUsername(client)) ?? username;
      return readFingerprints(client, resolvedUsername);
    }, `Failed to verify RSA public key for Snowflake user "${username}"`);

    const isPresent = RSA_PUBLIC_KEY_SLOTS.some((slot) => fingerprints[slot] === expectedFingerprint);
    if (!isPresent) {
      throw new BadRequestError({
        message: `The active key pair is no longer present on Snowflake user "${username}".`
      });
    }
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
