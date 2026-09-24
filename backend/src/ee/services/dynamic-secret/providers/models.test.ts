import { describe, expect, test } from "vitest";

import { SshCertKeyAlgorithm } from "@app/lib/ssh";

import {
  DYNAMIC_SECRET_SECRET_FIELDS,
  DynamicSecretProviders,
  DynamicSecretSshSchema,
  redactStoredInputs
} from "./models";

describe("redactStoredInputs", () => {
  const sshStoredInputs = {
    caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nca-key-material\n-----END OPENSSH PRIVATE KEY-----",
    caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 ca@infisical",
    principals: ["ubuntu"],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519,
    caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
  };

  test("withholds the SSH CA private key and keeps the rest of the configuration", () => {
    const redacted = redactStoredInputs(DynamicSecretProviders.Ssh, sshStoredInputs);

    expect(redacted).toStrictEqual({
      caPublicKey: sshStoredInputs.caPublicKey,
      principals: sshStoredInputs.principals,
      keyAlgorithm: SshCertKeyAlgorithm.ED25519,
      caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
    });
    expect(JSON.stringify(redacted)).not.toContain("ca-key-material");
  });

  test("returns inputs untouched for a provider that declares no secret fields", () => {
    const sqlStoredInputs = { host: "db.internal", username: "admin", password: "hunter2" };

    expect(redactStoredInputs(DynamicSecretProviders.SqlDatabase, sqlStoredInputs)).toStrictEqual(sqlStoredInputs);
  });

  test("tolerates stored input that is not an object", () => {
    expect(redactStoredInputs(DynamicSecretProviders.Ssh, null)).toBeNull();
    expect(redactStoredInputs(DynamicSecretProviders.Ssh, undefined)).toBeUndefined();
  });

  test("declares a secret field list for every provider", () => {
    const declared = Object.keys(DYNAMIC_SECRET_SECRET_FIELDS).sort();

    expect(declared).toStrictEqual(Object.values(DynamicSecretProviders).sort());
  });
});

describe("DynamicSecretSshSchema", () => {
  test("accepts a supported cert algorithm value", () => {
    expect(
      DynamicSecretSshSchema.parse({
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ECDSA_P256,
        caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
      })
    ).toMatchObject({
      keyAlgorithm: SshCertKeyAlgorithm.ECDSA_P256,
      caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
    });
  });

  test("rejects a TypeScript enum key that is not an algorithm value", () => {
    expect(() =>
      DynamicSecretSshSchema.parse({
        principals: ["ubuntu"],
        keyAlgorithm: "ECDSA_P256",
        caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
      })
    ).toThrow();
  });

  test("rejects an OpenSSH public key type in place of a cert algorithm", () => {
    expect(() =>
      DynamicSecretSshSchema.parse({
        principals: ["ubuntu"],
        keyAlgorithm: "ssh-ed25519",
        caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
      })
    ).toThrow();
  });
});
