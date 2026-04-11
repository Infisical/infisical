/* eslint-disable no-bitwise, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it } from "vitest";

import { getPqcCrypto, initializePqcSupport } from "./index";
import { verifyPqcOpenSSLAvailability } from "./pqc-openssl";

// These tests require the PQC OpenSSL 3.5+ binary
describe("ML-DSA X.509 Certificate Operations", () => {
  let pqcAvailable = false;

  beforeAll(async () => {
    pqcAvailable = await verifyPqcOpenSSLAvailability();
    if (pqcAvailable) {
      await initializePqcSupport();
    }
  });

  it("should create and verify self-signed cert directly", async ({ skip }) => {
    if (!pqcAvailable) skip();
    const pqcCrypto = getPqcCrypto();
    const alg = { name: "ML-DSA-87" };
    const keys = (await pqcCrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;

    // Sign data manually and verify
    const tbs = new TextEncoder().encode("test data to sign");
    const sig = await pqcCrypto.subtle.sign(alg, keys.privateKey, tbs);
    const ok = await pqcCrypto.subtle.verify(alg, keys.publicKey, sig, tbs);
    expect(ok).toBe(true);

    // Now create a self-signed cert and verify it
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=Direct Test",
      serialNumber: "01",
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: alg,
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(true, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
      ]
    });

    // Verify the self-signed cert using its own verify method
    const certVerify = await cert.verify({ publicKey: keys.publicKey, signatureOnly: true });
    expect(certVerify).toBe(true);

    // Also verify self-signed detection works
    const isSelfSigned = await cert.isSelfSigned();
    expect(isSelfSigned).toBe(true);
  });

  it("should create a self-signed root CA cert with ML-DSA-87", async ({ skip }) => {
    if (!pqcAvailable) skip();
    const pqcCrypto = getPqcCrypto();
    const alg = { name: "ML-DSA-87" };
    const keys = (await pqcCrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=Test Root CA, O=Test",
      serialNumber: "01",
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: alg,
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(true, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
      ]
    });

    expect(cert).toBeDefined();
    expect(cert.subject).toContain("CN=Test Root CA");
    const pem = cert.toString("pem");
    expect(pem).toContain("-----BEGIN CERTIFICATE-----");
  });

  it("should sign an intermediate CA cert with an ML-DSA-87 root", async ({ skip }) => {
    if (!pqcAvailable) skip();
    const pqcCrypto = getPqcCrypto();
    const alg = { name: "ML-DSA-87" };

    // Generate root CA key pair and self-signed cert
    const rootKeys = (await pqcCrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
    const rootCert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=ML-DSA Root CA",
      serialNumber: "01",
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: alg,
      keys: rootKeys,
      extensions: [
        new x509.BasicConstraintsExtension(true, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.SubjectKeyIdentifierExtension.create(rootKeys.publicKey)
      ]
    });

    // Generate intermediate CA key pair (RSA - cross-algorithm signing)
    const interKeys = await pqcCrypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
      true,
      ["sign", "verify"]
    );

    // Create CSR for intermediate
    const interCsr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: "CN=ML-DSA Intermediate CA",
      keys: interKeys,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
      ]
    });

    // Sign the intermediate cert with the ML-DSA root key
    const interCert = await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject: interCsr.subject,
      issuer: rootCert.subject,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
      signingKey: rootKeys.privateKey,
      publicKey: interCsr.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.AuthorityKeyIdentifierExtension.create(rootCert, false),
        await x509.SubjectKeyIdentifierExtension.create(interCsr.publicKey)
      ]
    });

    expect(interCert).toBeDefined();
    expect(interCert.issuer).toContain("CN=ML-DSA Root CA");
    expect(interCert.subject).toContain("CN=ML-DSA Intermediate CA");

    // First verify the intermediate cert signature directly using root's public key
    const rootPubKey = await pqcCrypto.subtle.importKey("spki", new Uint8Array(rootCert.publicKey.rawData), alg, true, [
      "verify"
    ]);

    // Verify with signatureOnly and explicit public key
    const verifyResult = await interCert.verify({ publicKey: rootPubKey, signatureOnly: true });
    expect(verifyResult).toBe(true);

    // Verify chain building works
    const chain = new x509.X509ChainBuilder({ certificates: [rootCert] });
    const chainItems = await chain.build(interCert);
    expect(chainItems.length).toBe(2); // intermediate + root
  });

  it("should sign an ML-DSA-65 intermediate cert with an ML-DSA-87 root", async ({ skip }) => {
    if (!pqcAvailable) skip();
    const pqcCrypto = getPqcCrypto();

    // ML-DSA-87 root
    const rootAlg = { name: "ML-DSA-87" };
    const rootKeys = (await pqcCrypto.subtle.generateKey(rootAlg, true, ["sign", "verify"])) as CryptoKeyPair;
    const rootCert = await x509.X509CertificateGenerator.createSelfSigned({
      name: "CN=PQC Root CA",
      serialNumber: "01",
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: rootAlg,
      keys: rootKeys,
      extensions: [
        new x509.BasicConstraintsExtension(true, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
      ]
    });

    // ML-DSA-65 intermediate
    const interAlg = { name: "ML-DSA-65" };
    const interKeys = (await pqcCrypto.subtle.generateKey(interAlg, true, ["sign", "verify"])) as CryptoKeyPair;

    const interCsr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: "CN=PQC Intermediate CA",
      keys: interKeys,
      signingAlgorithm: interAlg,
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true)
      ]
    });

    // Sign with root's ML-DSA-87 key
    const interCert = await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject: interCsr.subject,
      issuer: rootCert.subject,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
      signingKey: rootKeys.privateKey,
      publicKey: interCsr.publicKey,
      signingAlgorithm: rootAlg, // Signing uses root's algorithm
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
        await x509.AuthorityKeyIdentifierExtension.create(rootCert, false)
      ]
    });

    expect(interCert).toBeDefined();

    // Verify chain
    const chain = new x509.X509ChainBuilder({ certificates: [rootCert] });
    const chainItems = await chain.build(interCert);
    expect(chainItems.length).toBe(2);
  });
});
