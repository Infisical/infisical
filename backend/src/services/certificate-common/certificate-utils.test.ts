import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it } from "vitest";

import { extractSelfSignedRootCaFromChain, removeRootCaFromChain } from "./certificate-utils";

const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };

const generateKeys = () =>
  crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;

const notBefore = new Date(Date.now() - 60 * 1000);
const notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

const createSelfSigned = async (name: string, keys: CryptoKeyPair) =>
  (
    await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name,
      notBefore,
      notAfter,
      keys,
      signingAlgorithm: SIGNING_ALGORITHM,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    })
  ).toString("pem");

const createSigned = async ({
  subject,
  issuer,
  publicKey,
  signingKey
}: {
  subject: string;
  issuer: string;
  publicKey: CryptoKey;
  signingKey: CryptoKey;
}) =>
  (
    await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject,
      issuer,
      notBefore,
      notAfter,
      publicKey,
      signingKey,
      signingAlgorithm: SIGNING_ALGORITHM,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    })
  ).toString("pem");

describe("root CA stripping", () => {
  let infisicalRoot: string;
  let intermediate: string;
  let crossSignedRoot: string;
  let legacyRoot: string;

  beforeAll(async () => {
    const rootKeys = await generateKeys();
    const intermediateKeys = await generateKeys();
    const legacyKeys = await generateKeys();

    infisicalRoot = await createSelfSigned("CN=Corp Root CA", rootKeys);
    intermediate = await createSigned({
      subject: "CN=Corp Issuing CA",
      issuer: "CN=Corp Root CA",
      publicKey: intermediateKeys.publicKey,
      signingKey: rootKeys.privateKey
    });
    legacyRoot = await createSelfSigned("CN=Legacy Root CA G2", legacyKeys);
    crossSignedRoot = await createSigned({
      subject: "CN=Corp Root CA",
      issuer: "CN=Legacy Root CA G2",
      publicKey: rootKeys.publicKey,
      signingKey: legacyKeys.privateKey
    });
  });

  describe("removeRootCaFromChain", () => {
    it("drops a trailing self-signed root", () => {
      expect(removeRootCaFromChain([intermediate, infisicalRoot].join("\n"))).toBe(intermediate);
    });

    it("keeps a trailing cross-signed certificate", () => {
      expect(removeRootCaFromChain([intermediate, crossSignedRoot].join("\n"))).toBe(
        [intermediate, crossSignedRoot].join("\n")
      );
    });

    it("drops only the legacy root after a cross-signed certificate", () => {
      expect(removeRootCaFromChain([intermediate, crossSignedRoot, legacyRoot].join("\n"))).toBe(
        [intermediate, crossSignedRoot].join("\n")
      );
    });

    it("keeps a trailing cross-signed certificate whose old root has the same name", async () => {
      const rootKeys = await generateKeys();
      const sameNameLegacyKeys = await generateKeys();
      const sameNameCopy = (
        await x509.X509CertificateGenerator.create({
          serialNumber: "03",
          subject: "CN=Corp Root CA",
          issuer: "CN=Corp Root CA",
          notBefore,
          notAfter,
          publicKey: rootKeys.publicKey,
          signingKey: sameNameLegacyKeys.privateKey,
          signingAlgorithm: SIGNING_ALGORITHM,
          extensions: [
            new x509.BasicConstraintsExtension(true, undefined, true),
            await x509.SubjectKeyIdentifierExtension.create(rootKeys.publicKey),
            await x509.AuthorityKeyIdentifierExtension.create(sameNameLegacyKeys.publicKey)
          ]
        })
      ).toString("pem");

      expect(removeRootCaFromChain([intermediate, sameNameCopy].join("\n"))).toBe(
        [intermediate, sameNameCopy].join("\n")
      );
    });

    it("returns an empty string for a chain of only a root", () => {
      expect(removeRootCaFromChain(infisicalRoot)).toBe("");
    });

    it("returns an empty string for an empty chain", () => {
      expect(removeRootCaFromChain("")).toBe("");
    });
  });

  describe("extractSelfSignedRootCaFromChain", () => {
    const fallbackChain = () => [intermediate, infisicalRoot].join("\n");

    it("returns the chain's trailing self-signed root", () => {
      const chain = [intermediate, crossSignedRoot, legacyRoot].join("\n");
      expect(extractSelfSignedRootCaFromChain(chain, fallbackChain())).toBe(legacyRoot.trim());
    });

    it("falls back to the CA's own root when the chain ends in a cross-signed certificate", () => {
      const chain = [intermediate, crossSignedRoot].join("\n");
      expect(extractSelfSignedRootCaFromChain(chain, fallbackChain())).toBe(infisicalRoot.trim());
    });
  });
});
