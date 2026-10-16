import slugify from "@sindresorhus/slugify";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { createSshCert, createSshKeyPair, getSshPublicKey, inferSshCertKeyAlgorithm, SshCertType } from "@app/lib/ssh";

import { TDynamicSecretLeaseConfig } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import {
  DynamicSecretSshSchema,
  SshStoredSchema,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";

const SSH_LEASE_MAX_TTL_MS = ms("7d");

const assertSshTtlWithinLimit = (ttlMs: number, message: string) => {
  if (ttlMs > SSH_LEASE_MAX_TTL_MS) {
    throw new BadRequestError({ message });
  }
};

const assertSshTtlStringWithinLimit = (ttl: string | null | undefined, fieldLabel: string) => {
  if (!ttl) return;
  assertSshTtlWithinLimit(ms(ttl), `SSH ${fieldLabel} must be 7 days or less`);
};

export const SshProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, defaultTTL, maxTTL }: TDynamicProviderValidateMetadata
  ) => {
    assertSshTtlStringWithinLimit(defaultTTL, "default TTL");
    assertSshTtlStringWithinLimit(maxTTL, "max TTL");

    const parsed = DynamicSecretSshSchema.parse(inputs);

    const raw = inputs as Record<string, unknown>;
    const hasCa = Boolean(raw.caPrivateKey && raw.caPublicKey);

    if (hasCa && typeof raw.caPublicKey === "string") {
      inferSshCertKeyAlgorithm(raw.caPublicKey);
    }

    const storedCaKeyAlgorithm = previousInputs
      ? DynamicSecretSshSchema.pick({ caKeyAlgorithm: true }).parse(previousInputs).caKeyAlgorithm
      : parsed.caKeyAlgorithm;

    if (hasCa && storedCaKeyAlgorithm === parsed.caKeyAlgorithm) {
      return SshStoredSchema.parse({
        caPrivateKey: raw.caPrivateKey,
        caPublicKey: raw.caPublicKey,
        principals: parsed.principals,
        keyAlgorithm: parsed.keyAlgorithm,
        caKeyAlgorithm: parsed.caKeyAlgorithm
      });
    }

    const caKeyPair = await createSshKeyPair(parsed.caKeyAlgorithm);

    return {
      caPrivateKey: caKeyPair.privateKey,
      caPublicKey: caKeyPair.publicKey,
      principals: parsed.principals,
      keyAlgorithm: parsed.keyAlgorithm,
      caKeyAlgorithm: parsed.caKeyAlgorithm
    };
  };

  // No remote connection to test for SSH — this validates the CA key pair consistency instead.
  // Required by the TDynamicProviderFns interface that all providers implement.
  const validateConnection = async (inputs: unknown) => {
    // On create, the service passes the raw user inputs (no CA keys — those are generated
    // in validateProviderInputs). On update, it passes the merged stored + new inputs.
    const storedResult = SshStoredSchema.safeParse(inputs);

    if (!storedResult.success) {
      // Initial creation — CA keys not present yet. Validate the user-facing fields.
      DynamicSecretSshSchema.parse(inputs);
      return true;
    }

    // Update path — CA keys are present. Verify the key pair is consistent.
    const parsed = storedResult.data;
    const derivedPublicKey = await getSshPublicKey(parsed.caPrivateKey);

    const normalize = (key: string) => key.trim().split(new RE2(/\s+/)).slice(0, 2).join(" ");
    if (normalize(derivedPublicKey) !== normalize(parsed.caPublicKey)) {
      throw new BadRequestError({
        message: "SSH CA key pair validation failed: derived public key does not match stored public key"
      });
    }

    return true;
  };

  const create = async ({
    inputs,
    expireAt,
    identity,
    config
  }: {
    inputs: unknown;
    expireAt: number;
    identity: { name: string };
    config?: TDynamicSecretLeaseConfig;
  }) => {
    assertSshTtlWithinLimit(expireAt - Date.now(), "SSH lease TTL must be 7 days or less");

    const parsed = SshStoredSchema.parse(inputs);

    // Validate principals from lease config
    const requestedPrincipals = config?.principals;
    if (!requestedPrincipals || requestedPrincipals.length === 0) {
      throw new BadRequestError({
        message: "SSH lease requires at least one principal in config.principals"
      });
    }

    // Validate each requested principal is in the allowed list
    const allowedSet = new Set(parsed.principals);
    const invalidPrincipals = requestedPrincipals.filter((p: string) => !allowedSet.has(p));
    if (invalidPrincipals.length > 0) {
      throw new BadRequestError({
        message: `Requested principals not in allowed list: ${invalidPrincipals.join(", ")}`
      });
    }

    const keyId = `infisical-${slugify(identity.name)}`;

    // Generate ephemeral key pair with configured algorithm
    const ephemeralKeyPair = await createSshKeyPair(parsed.keyAlgorithm);

    // Calculate TTL string for createSshCert (expects ms-lib format)
    const ttlSeconds = Math.ceil((expireAt - Date.now()) / 1000);
    const requestedTtl = `${ttlSeconds}s`;

    // Sign the ephemeral public key with the CA
    const { serialNumber, signedPublicKey } = await createSshCert({
      caPrivateKey: parsed.caPrivateKey,
      clientPublicKey: ephemeralKeyPair.publicKey,
      keyId,
      principals: requestedPrincipals,
      requestedTtl,
      certType: SshCertType.USER,
      // revoke is a no-op for this provider, so the certificate's expiry is the only thing ending
      // the lease and must not drift past it
      enforceExactExpiry: true
    });

    return {
      entityId: serialNumber,
      data: {
        PRIVATE_KEY: ephemeralKeyPair.privateKey,
        SIGNED_KEY: signedPublicKey
      }
    };
  };

  const revoke = async (_inputs: unknown, entityId: string) => {
    // SSH certs are time-bound — revocation is a no-op
    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // SSH cert validity is baked in at signing time — renewal is not supported
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
