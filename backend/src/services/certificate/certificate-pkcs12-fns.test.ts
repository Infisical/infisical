import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { describe, expect, test } from "vitest";

import * as fixtures from "./certificate-pkcs12-fixtures";
import { extractPkcs12Entries, Pkcs12ErrorCode, Pkcs12ExtractionError } from "./certificate-pkcs12-fns";

const extract = (fixture: string, password: string) =>
  extractPkcs12Entries({ pkcs12: Buffer.from(fixture, "base64"), password });

const expectFailure = async (fixture: string, password: string, code: string) => {
  await expect(extract(fixture, password)).rejects.toSatisfy(
    (err) => err instanceof Pkcs12ExtractionError && err.code === code
  );
};

const countCertsIn = (pem: string) => pem.split("BEGIN CERTIFICATE").length - 1;

describe("extractPkcs12Entries", () => {
  test("reads a modern AES-256 keystore", async () => {
    const { entries } = await extract(fixtures.rsaModern, "test");

    expect(entries).toHaveLength(1);
    expect(entries[0].commonName).toBe("rsa-leaf");
    expect(entries[0].keyAlgorithm).toBe("RSA 2048");
    expect(entries[0].certificatePem).toContain("BEGIN CERTIFICATE");
    expect(entries[0].privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  test("reads a legacy RC2/3DES keystore, which WebCrypto cannot decrypt", async () => {
    const { entries } = await extract(fixtures.rsaLegacy, "test");

    expect(entries).toHaveLength(1);
    expect(entries[0].keyAlgorithm).toBe("RSA 2048");
  });

  test("reads an EC keystore, where node-forge cannot build key or certificate objects", async () => {
    const { entries } = await extract(fixtures.ecModern, "test");

    expect(entries).toHaveLength(1);
    expect(entries[0].keyAlgorithm).toBe("ECDSA P-256");
    expect(() => crypto.createPrivateKey(entries[0].privateKeyPem ?? "")).not.toThrow();
  });

  test("reads a keystore with no password", async () => {
    const { entries } = await extract(fixtures.rsaEmptyPassword, "");

    expect(entries).toHaveLength(1);
  });

  test("returns a private key whose public half matches its certificate", async () => {
    const { entries } = await extract(fixtures.rsaModern, "test");

    const fromKey = crypto
      .createPublicKey(crypto.createPrivateKey(entries[0].privateKeyPem ?? ""))
      .export({ format: "der", type: "spki" })
      .toString("hex");
    const fromCert = crypto
      .createPublicKey(entries[0].certificatePem)
      .export({ format: "der", type: "spki" })
      .toString("hex");

    expect(fromKey).toBe(fromCert);
  });
});

describe("extractPkcs12Entries chain building", () => {
  test("gives every entry its own chain when they share a CA", async () => {
    const { entries } = await extract(fixtures.sharedCaBundle, "test");

    expect(entries).toHaveLength(2);
    entries.forEach((entry) => {
      expect(countCertsIn(entry.chainPem ?? "")).toBe(2);
      expect(entry.chainWarning).toBeNull();
    });
  });

  test("picks the issuer that signed, not the one whose name matches", async () => {
    const { entries } = await extract(fixtures.renewedCa, "test");

    expect(entries).toHaveLength(1);
    expect(countCertsIn(entries[0].chainPem ?? "")).toBe(2);
    expect(entries[0].chainWarning).toBeNull();
  });

  test("imports a keystore of certificates with no private keys, like the PEM form does", async () => {
    const { entries } = await extract(fixtures.truststore, "changeit");

    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry) => {
      expect(entry.privateKeyPem).toBeUndefined();
      expect(entry.chainPem).toBeUndefined();
    });
  });

  test("returns an expired certificate without its chain, and says why", async () => {
    const { entries } = await extract(fixtures.expiredLeaf, "test");

    expect(entries).toHaveLength(1);
    expect(new Date(entries[0].notAfter).getTime()).toBeLessThan(Date.now());
    expect(entries[0].chainPem).toBeUndefined();
    expect(entries[0].chainWarning).toContain("imported on its own");
  });

  test("drops the chain when an issuer in it has expired, not just the leaf", async () => {
    const { entries } = await extract(fixtures.expiredIntermediate, "test");

    expect(entries).toHaveLength(1);
    expect(new Date(entries[0].notAfter).getTime()).toBeGreaterThan(Date.now());
    expect(entries[0].chainPem).toBeUndefined();
    expect(entries[0].chainWarning).toContain("No usable issuer chain");
  });

  test("drops the chain when the leaf is not valid yet, like it does for expired ones", async () => {
    const { entries } = await extract(fixtures.notYetValidLeaf, "test");

    expect(entries).toHaveLength(1);
    expect(entries[0].chainPem).toBeUndefined();
    expect(entries[0].chainWarning).toContain("No usable issuer chain");
  });

  test("returns a leaf-only keystore without a chain, and says so", async () => {
    const { entries } = await extract(fixtures.leafOnly, "test");

    expect(entries).toHaveLength(1);
    expect(entries[0].chainPem).toBeUndefined();
    expect(entries[0].chainWarning).toContain("No usable issuer chain");
  });

  test("collapses the same pair stored under two aliases", async () => {
    const { entries } = await extract(fixtures.duplicateAliases, "changeit");

    expect(entries).toHaveLength(1);
    expect(new Set(entries.map((entry) => entry.fingerprintSha256)).size).toBe(entries.length);
  });

  test("extracts a post-quantum keystore, warning that its chain cannot be verified", async () => {
    const { entries } = await extract(fixtures.mlDsa, "hunter2");

    expect(entries).toHaveLength(1);
    expect(entries[0].privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(entries[0].chainWarning).toContain("No usable issuer chain");
    // The algorithm label is whatever the runtime can name, and only some Node builds know ML-DSA.
  });
});

describe("extractPkcs12Entries produces entries the import endpoint accepts", () => {
  // Mirrors importCert's own validation.
  const splitPem = (pem: string) => pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];

  const assertImportable = async (entry: { certificatePem: string; chainPem?: string; privateKeyPem?: string }) => {
    const leaf = new x509.X509Certificate(entry.certificatePem);

    if (entry.chainPem) {
      const chainCerts = splitPem(entry.chainPem).map((pem) => new x509.X509Certificate(pem));
      expect(chainCerts.length).toBeGreaterThan(0);
      expect(await leaf.verify({ publicKey: chainCerts[0].publicKey })).toBe(true);

      await Promise.all(
        chainCerts.slice(0, -1).map(async (cert, index) => {
          expect(await cert.verify({ publicKey: chainCerts[index + 1].publicKey })).toBe(true);
        })
      );
    }

    if (entry.privateKeyPem) {
      const message = Buffer.alloc(32);
      const signature = crypto.sign(null, message, crypto.createPrivateKey(entry.privateKeyPem));
      expect(crypto.verify(null, message, crypto.createPublicKey(entry.certificatePem), signature)).toBe(true);
    }
  };

  test.each([
    ["rsaModern", fixtures.rsaModern, "test"],
    ["rsaLegacy", fixtures.rsaLegacy, "test"],
    ["ecModern", fixtures.ecModern, "test"],
    ["rsaEmptyPassword", fixtures.rsaEmptyPassword, ""],
    ["sharedCaBundle", fixtures.sharedCaBundle, "test"],
    ["renewedCa", fixtures.renewedCa, "test"],
    ["expiredLeaf", fixtures.expiredLeaf, "test"],
    ["leafOnly", fixtures.leafOnly, "test"],
    ["noMac", fixtures.noMac, "test"],
    ["expiredIntermediate", fixtures.expiredIntermediate, "test"],
    ["notYetValidLeaf", fixtures.notYetValidLeaf, "test"]
  ])("%s", async (_name, fixture, password) => {
    const { entries } = await extract(fixture, password);

    await Promise.all(entries.map(assertImportable));
  });
});

describe("extractPkcs12Entries failures", () => {
  test("reports a wrong password as a password problem", async () => {
    await expectFailure(fixtures.rsaModern, "not-the-password", Pkcs12ErrorCode.BadPassword);
  });

  test("reports a wrong password on a MAC-less keystore as a password problem too", async () => {
    await expectFailure(fixtures.noMac, "not-the-password", Pkcs12ErrorCode.BadPassword);
  });

  test("refuses a keystore that declares an absurd key-derivation cost", async () => {
    await expectFailure(fixtures.hostileIterations, "test", Pkcs12ErrorCode.TooExpensive);
  });

  test("refuses one that hides the cost on a key inside the safe contents", async () => {
    await expectFailure(fixtures.hostileNestedIterations, "test", Pkcs12ErrorCode.TooExpensive);
  });

  test("reports a file that is not a keystore", async () => {
    await expectFailure(Buffer.from("this is not a keystore").toString("base64"), "test", Pkcs12ErrorCode.NotAKeystore);
  });

  test("reports entry types we cannot read, rather than failing as corrupt", async () => {
    await expectFailure(fixtures.secretKeyBag, "changeit", Pkcs12ErrorCode.UnsupportedEntries);
  });
});
