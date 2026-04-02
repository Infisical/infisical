import RE2 from "re2";
import slugify from "@sindresorhus/slugify";

import { BadRequestError } from "@app/lib/errors";

import { TDynamicSecretLeaseConfig } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { createSshCert, createSshKeyPair, getSshPublicKey } from "../../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../../ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "../../ssh-certificate/ssh-certificate-types";
import { DynamicSecretSshSchema, SshStoredSchema, TDynamicProviderFns } from "./models";

export const SshProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: object) => {
    const parsed = DynamicSecretSshSchema.parse(inputs);

    // Check if CA fields already exist (update case)
    const raw = inputs as Record<string, unknown>;
    if (raw.caPrivateKey && raw.caPublicKey) {
      return SshStoredSchema.parse(inputs);
    }

    // First creation: generate CA key pair (always ED25519 for the CA)
    const caKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.ED25519);

    return {
      caPrivateKey: caKeyPair.privateKey,
      caPublicKey: caKeyPair.publicKey,
      principals: parsed.principals,
      keyAlgorithm: parsed.keyAlgorithm
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
      certType: SshCertType.USER
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
