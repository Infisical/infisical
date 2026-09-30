import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { inferSshCertKeyAlgorithm, SshPublicKeyType } from "@app/lib/ssh";

describe("inferSshCertKeyAlgorithm", () => {
  test("accepts each supported OpenSSH public key type", () => {
    expect(inferSshCertKeyAlgorithm(`${SshPublicKeyType.ED25519} AAAA`)).toBe(SshPublicKeyType.ED25519);
    expect(inferSshCertKeyAlgorithm(`${SshPublicKeyType.ECDSA_P256} AAAA`)).toBe(SshPublicKeyType.ECDSA_P256);
    expect(inferSshCertKeyAlgorithm(`${SshPublicKeyType.ECDSA_P384} AAAA`)).toBe(SshPublicKeyType.ECDSA_P384);
    expect(inferSshCertKeyAlgorithm(`${SshPublicKeyType.RSA} AAAA`)).toBe(SshPublicKeyType.RSA);
  });

  test("rejects an unknown OpenSSH public key type", () => {
    expect(() => inferSshCertKeyAlgorithm("ssh-dss AAAA")).toThrow(BadRequestError);
    expect(() => inferSshCertKeyAlgorithm("ssh-dss AAAA")).toThrow("Unsupported SSH key type 'ssh-dss'");
  });
});
