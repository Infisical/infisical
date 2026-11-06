import { describe, expect, test } from "vitest";

import { SshCertKeyAlgorithm } from "@app/lib/ssh";

import { DynamicSecretSshSchema } from "./models";

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
