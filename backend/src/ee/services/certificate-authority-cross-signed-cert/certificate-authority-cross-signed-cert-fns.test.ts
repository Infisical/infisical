import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  assertCrossSignedCertsAllowSubCa,
  validateCrossSignedCertificate
} from "./certificate-authority-cross-signed-cert-fns";

describe("validateCrossSignedCertificate", () => {
  const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };

  const generateKeys = () =>
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ]) as Promise<CryptoKeyPair>;

  const createCaCert = async ({
    subject,
    issuer,
    publicKey,
    signingKey,
    pathLength,
    keyUsages = x509.KeyUsageFlags.keyCertSign,
    validityMs = 24 * 60 * 60 * 1000
  }: {
    subject: string;
    issuer: string;
    publicKey: CryptoKey;
    signingKey: CryptoKey;
    pathLength?: number;
    keyUsages?: number;
    validityMs?: number;
  }) =>
    (
      await x509.X509CertificateGenerator.create({
        serialNumber: "01",
        subject,
        issuer,
        notBefore: new Date(Date.now() - 60 * 1000),
        notAfter: new Date(Date.now() + validityMs),
        publicKey,
        signingKey,
        signingAlgorithm: SIGNING_ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(true, pathLength, true),
          new x509.KeyUsagesExtension(keyUsages, true)
        ]
      })
    ).toString("pem");

  let rootKeys: CryptoKeyPair;
  let legacyRootKeys: CryptoKeyPair;
  let legacyIntermediateKeys: CryptoKeyPair;
  let infisicalRoot: string;
  let legacyRoot: string;
  let legacyIntermediate: string;

  beforeAll(async () => {
    rootKeys = await generateKeys();
    legacyRootKeys = await generateKeys();
    legacyIntermediateKeys = await generateKeys();

    infisicalRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: rootKeys.publicKey,
      signingKey: rootKeys.privateKey
    });
    legacyRoot = await createCaCert({
      subject: "CN=Legacy Root CA",
      issuer: "CN=Legacy Root CA",
      publicKey: legacyRootKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    legacyIntermediate = await createCaCert({
      subject: "CN=Legacy Issuing CA",
      issuer: "CN=Legacy Root CA",
      publicKey: legacyIntermediateKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
  });

  const crossSignRoot = (
    signingKey: CryptoKey,
    issuer: string,
    options: { pathLength?: number; keyUsages?: number; validityMs?: number } = {}
  ) =>
    createCaCert({
      subject: "CN=Corp Root CA",
      issuer,
      publicKey: rootKeys.publicKey,
      signingKey,
      validityMs: 12 * 60 * 60 * 1000,
      ...options
    });

  const validate = (overrides: Partial<Parameters<typeof validateCrossSignedCertificate>[0]>) =>
    validateCrossSignedCertificate({
      caCertificate: infisicalRoot,
      caCertificateChain: "",
      subCaDepth: 0,
      certificate: "",
      certificateChain: legacyRoot,
      ...overrides
    });

  const createLegacyIntermediate = (options: { pathLength?: number; keyUsages?: number }) =>
    createCaCert({
      subject: "CN=Legacy Issuing CA",
      issuer: "CN=Legacy Root CA",
      publicKey: legacyIntermediateKeys.publicKey,
      signingKey: legacyRootKeys.privateKey,
      ...options
    });

  it("accepts a copy signed by an old root that has the same name as the CA", async () => {
    const sameNameLegacyKeys = await generateKeys();
    const sameNameLegacyRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: sameNameLegacyKeys.publicKey,
      signingKey: sameNameLegacyKeys.privateKey
    });
    const crossSigned = await crossSignRoot(sameNameLegacyKeys.privateKey, "CN=Corp Root CA");

    const { crossSignedCertObj } = await validate({ certificate: crossSigned, certificateChain: sameNameLegacyRoot });

    expect(crossSignedCertObj.issuer).toBe("CN=Corp Root CA");
  });

  it("rejects the CA's own self-signed certificate", async () => {
    await expect(validate({ certificate: infisicalRoot })).rejects.toThrow("self-signed");
  });

  it("rejects a copy whose path length leaves no room for the CAs under this CA", async () => {
    const crossSigned = await crossSignRoot(legacyRootKeys.privateKey, "CN=Legacy Root CA", { pathLength: 0 });

    await expect(validate({ certificate: crossSigned, subCaDepth: 1 })).rejects.toThrow("fewer CA levels");
    await expect(validate({ certificate: crossSigned, subCaDepth: 0 })).resolves.toBeDefined();
  });

  it("rejects a copy that can't sign certificates", async () => {
    const crossSigned = await crossSignRoot(legacyRootKeys.privateKey, "CN=Legacy Root CA", {
      keyUsages: x509.KeyUsageFlags.digitalSignature
    });

    await expect(validate({ certificate: crossSigned })).rejects.toThrow("can't sign certificates");
  });

  it("requires the chain", async () => {
    const crossSigned = await crossSignRoot(legacyRootKeys.privateKey, "CN=Legacy Root CA");

    await expect(validate({ certificate: crossSigned, certificateChain: "" })).rejects.toThrow(
      "Paste the old CA's certificates"
    );
  });

  it("rejects a chain that doesn't end with a root", async () => {
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    await expect(validate({ certificate: crossSigned, certificateChain: legacyIntermediate })).rejects.toThrow(
      "doesn't end with a root certificate"
    );
  });

  it("rejects a chain whose upper certificate didn't sign the one below it", async () => {
    const otherRootKeys = await generateKeys();
    const otherRoot = await createCaCert({
      subject: "CN=Legacy Root CA",
      issuer: "CN=Legacy Root CA",
      publicKey: otherRootKeys.publicKey,
      signingKey: otherRootKeys.privateKey
    });
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    await expect(
      validate({ certificate: crossSigned, certificateChain: `${legacyIntermediate}\n${otherRoot}` })
    ).rejects.toThrow("Certificate 2 in the chain didn't sign certificate 1");
  });

  it("rejects a chain certificate that expires before the cross-signed certificate", async () => {
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA", {
      validityMs: 48 * 60 * 60 * 1000
    });

    await expect(
      validate({ certificate: crossSigned, certificateChain: `${legacyIntermediate}\n${legacyRoot}` })
    ).rejects.toThrow("Certificate 1 in the chain (Legacy Issuing CA) expires on");
  });

  it("rejects an old issuing CA whose path length forbids a CA below it", async () => {
    const issuingCaWithPathLengthZero = await createLegacyIntermediate({ pathLength: 0 });
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    await expect(
      validate({ certificate: crossSigned, certificateChain: `${issuingCaWithPathLengthZero}\n${legacyRoot}` })
    ).rejects.toThrow("Certificate 1 in the chain (Legacy Issuing CA) allows fewer CA levels below it");
  });

  it("rejects a chain certificate that can't sign certificates", async () => {
    const issuingCaWithoutCertSign = await createLegacyIntermediate({ keyUsages: x509.KeyUsageFlags.digitalSignature });
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    await expect(
      validate({ certificate: crossSigned, certificateChain: `${issuingCaWithoutCertSign}\n${legacyRoot}` })
    ).rejects.toThrow("Certificate 1 in the chain (Legacy Issuing CA) can't sign certificates");
  });

  it("doesn't count a same-name copy as a CA level", async () => {
    const sameNameLegacyKeys = await generateKeys();
    const sameNameLegacyRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: sameNameLegacyKeys.publicKey,
      signingKey: sameNameLegacyKeys.privateKey,
      pathLength: 0
    });
    const crossSigned = await crossSignRoot(sameNameLegacyKeys.privateKey, "CN=Corp Root CA");

    const { maxPathLength } = await validate({ certificate: crossSigned, certificateChain: sameNameLegacyRoot });

    expect(maxPathLength).toBe(0);
  });

  it("accepts a key rollover certificate in the middle of the chain", async () => {
    const newLegacyRootKeys = await generateKeys();
    const rolloverCert = await createCaCert({
      subject: "CN=Legacy Root CA",
      issuer: "CN=Legacy Root CA",
      publicKey: newLegacyRootKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    const crossSigned = await crossSignRoot(newLegacyRootKeys.privateKey, "CN=Legacy Root CA");

    const { crossSignedCertChainPem } = await validate({
      certificate: crossSigned,
      certificateChain: `${rolloverCert}\n${legacyRoot}`
    });

    expect(crossSignedCertChainPem.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
  });

  it("returns the CA levels the copy and its chain allow below the CA", async () => {
    const issuingCaWithPathLengthTwo = await createLegacyIntermediate({ pathLength: 2 });
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    const { maxPathLength } = await validate({
      certificate: crossSigned,
      certificateChain: `${issuingCaWithPathLengthTwo}\n${legacyRoot}`
    });

    expect(maxPathLength).toBe(1);
  });

  it("accepts a copy with a complete, ordered chain", async () => {
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    const { crossSignedCertChainPem } = await validate({
      certificate: crossSigned,
      certificateChain: `${legacyIntermediate}\n${legacyRoot}`,
      subCaDepth: 1
    });

    expect(crossSignedCertChainPem.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
  });
});

describe("assertCrossSignedCertsAllowSubCa", () => {
  const assertAllowed = (rows: { depth: number; maxPathLength: number | null }[], attachedCaSubCaDepth = 0) =>
    assertCrossSignedCertsAllowSubCa({
      parentCaId: "parent-ca",
      attachedCaId: "attached-ca",
      certificateAuthorityDAL: { findMaxSubCaDepth: vi.fn().mockResolvedValue(attachedCaSubCaDepth) },
      certificateAuthorityCrossSignedCertDAL: {
        lockCaHierarchyAndFindUnexpired: vi
          .fn()
          .mockResolvedValue(rows.map((row) => ({ ...row, caId: "root-ca", caName: "corp-root-ca" })))
      },
      tx: {} as never
    });

  it("allows a sub-CA when no cross-signed certificate above it has a limit", async () => {
    await expect(assertAllowed([])).resolves.toBeUndefined();
    await expect(assertAllowed([{ depth: 3, maxPathLength: null }])).resolves.toBeUndefined();
  });

  it("allows a sub-CA within the cross-signed certificate's limit", async () => {
    await expect(assertAllowed([{ depth: 0, maxPathLength: 1 }])).resolves.toBeUndefined();
  });

  it("refuses a sub-CA deeper than the cross-signed certificate allows", async () => {
    await expect(assertAllowed([{ depth: 1, maxPathLength: 1 }])).rejects.toThrow(
      "The cross-signed certificate of CA 'corp-root-ca' doesn't allow another CA level below it"
    );
  });

  it("counts the CAs already under the CA being attached", async () => {
    await expect(assertAllowed([{ depth: 0, maxPathLength: 1 }], 1)).rejects.toThrow(
      "doesn't allow another CA level below it"
    );
  });
});
