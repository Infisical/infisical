import { describe, expect, it } from "vitest";

import {
  assertKnownHostKeysAreNegotiable,
  describeKeyType,
  isKnownHostKeysValid,
  negotiableAlgorithmsForKnownHosts,
  parseKnownHostKeys,
  presentedKeyMatchesKnownHosts
} from "./ssh-host-key-fns";

const RSA = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDLpnBHDX8Xz4V3xkGvHY6L9nCwHZ0Vp7iEYq2ThTgKlm5R";
const ECDSA = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBFzQ1n4pQfR9dLpXvJ7cKmQ";
const ED25519 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGx3vQnPqZ4hR8yLmWkKdT5oUvBcXeJfAaQiNrMsHtEw";

describe("parseKnownHostKeys", () => {
  it("reads a bare 'type base64' line", () => {
    const [key] = parseKnownHostKeys(RSA);
    expect(key.keyType).toBe("ssh-rsa");
    expect(key.key.length).toBeGreaterThan(0);
  });

  it("ignores the host column that ssh-keyscan prefixes", () => {
    expect(parseKnownHostKeys(`172.31.34.53 ${RSA}`)[0].keyType).toBe("ssh-rsa");
  });

  it("reads every key from a multi-line paste, which is what ssh-keyscan prints", () => {
    const keys = parseKnownHostKeys([RSA, ECDSA, ED25519].map((k) => `host ${k}`).join("\n"));
    expect(keys.map((k) => k.keyType)).toEqual(["ssh-rsa", "ecdsa-sha2-nistp256", "ssh-ed25519"]);
  });

  it("skips comments and blank lines", () => {
    expect(parseKnownHostKeys(`# comment\n\n${RSA}\n\n`)).toHaveLength(1);
  });

  it.each([
    ["empty", ""],
    ["only a comment", "# nothing here"],
    ["a fingerprint rather than a key", "SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"],
    ["a key type with no key", "ssh-rsa"],
    ["non-base64 key material", "ssh-rsa not!valid!base64!"]
  ])("rejects %s", (_label, input) => {
    expect(() => parseKnownHostKeys(input)).toThrow();
  });

  it("names ssh-keyscan in the rejection so the user knows where to get the value", () => {
    expect(() => parseKnownHostKeys("garbage")).toThrow(/ssh-keyscan/);
  });
});

describe("assertKnownHostKeysAreNegotiable", () => {
  it("accepts a paste containing a key this client negotiates", () => {
    expect(() => assertKnownHostKeysAreNegotiable(parseKnownHostKeys(`${ED25519}\n${RSA}`))).not.toThrow();
  });

  // the failure the fingerprint format could not catch until the first connection attempt
  it("rejects a paste of only key types this client never negotiates, at save time", () => {
    expect(() => assertKnownHostKeysAreNegotiable(parseKnownHostKeys(ED25519))).toThrow(/ssh-ed25519/);
    expect(isKnownHostKeysValid(ED25519)).toBe(false);
  });

  it("explains which types are negotiated", () => {
    expect(() => assertKnownHostKeysAreNegotiable(parseKnownHostKeys(ED25519))).toThrow(/ssh-rsa/);
  });
});

describe("presentedKeyMatchesKnownHosts", () => {
  const rsaKey = parseKnownHostKeys(RSA)[0].key;
  const ecdsaKey = parseKnownHostKeys(ECDSA)[0].key;

  it("matches when the presented key is in the trusted set", () => {
    expect(presentedKeyMatchesKnownHosts(rsaKey, `${ED25519}\n${RSA}\n${ECDSA}`)).toBe(true);
  });

  it("matches whichever algorithm gets negotiated, so no picking is required", () => {
    const both = `${RSA}\n${ECDSA}`;
    expect(presentedKeyMatchesKnownHosts(rsaKey, both)).toBe(true);
    expect(presentedKeyMatchesKnownHosts(ecdsaKey, both)).toBe(true);
  });

  it("rejects a key that is not in the set", () => {
    expect(presentedKeyMatchesKnownHosts(ecdsaKey, RSA)).toBe(false);
  });

  it("rejects a truncated key rather than matching on a prefix", () => {
    expect(presentedKeyMatchesKnownHosts(rsaKey.subarray(0, rsaKey.length - 4), RSA)).toBe(false);
  });
});

describe("describeKeyType", () => {
  it("reads the algorithm name out of the wire format", () => {
    expect(describeKeyType(parseKnownHostKeys(RSA)[0].key)).toBe("ssh-rsa");
    expect(describeKeyType(parseKnownHostKeys(ED25519)[0].key)).toBe("ssh-ed25519");
  });
});

describe("negotiableAlgorithmsForKnownHosts", () => {
  it("offers only RSA when only an RSA key is trusted", () => {
    expect(negotiableAlgorithmsForKnownHosts(RSA)).toEqual(["rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"]);
  });

  it("offers only ECDSA when only an ECDSA key is trusted", () => {
    expect(negotiableAlgorithmsForKnownHosts(ECDSA)).toEqual(["ecdsa-sha2-nistp256"]);
  });

  it("offers both when both are trusted", () => {
    expect(negotiableAlgorithmsForKnownHosts(`${RSA}\n${ECDSA}`)).toContain("rsa-sha2-512");
    expect(negotiableAlgorithmsForKnownHosts(`${RSA}\n${ECDSA}`)).toContain("ecdsa-sha2-nistp256");
  });

  it("ignores trusted keys of types that are never negotiated", () => {
    expect(negotiableAlgorithmsForKnownHosts(`${ED25519}\n${RSA}`)).not.toContain("ssh-ed25519");
  });
});
