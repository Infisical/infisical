import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CertKeySource } from "@app/services/signer/signer-enums";

import { buildLocalCaSigner } from "../ca-signer";
import { InternalCaType } from "../certificate-authority-enums";
import { internalCertificateAuthorityServiceFactory } from "./internal-certificate-authority-service";

const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };

const generateKeys = async () =>
  (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;

describe("importCertToCa", () => {
  let caKeys: CryptoKeyPair;
  let certificate: string;
  let certificateChain: string;

  beforeAll(async () => {
    const rootKeys = await generateKeys();
    caKeys = await generateKeys();
    const notBefore = new Date(Date.now() - 60 * 1000);
    const notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const rootCert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=External Root CA",
      notBefore,
      notAfter,
      keys: rootKeys,
      signingAlgorithm: SIGNING_ALGORITHM,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
    const caCert = await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject: "CN=Example Intermediate CA",
      issuer: rootCert.subject,
      notBefore,
      notAfter,
      publicKey: caKeys.publicKey,
      signingKey: rootKeys.privateKey,
      signingAlgorithm: SIGNING_ALGORITHM,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });

    certificate = caCert.toString("pem");
    certificateChain = rootCert.toString("pem");
  });

  const buildService = (createCrl: ReturnType<typeof vi.fn>) => {
    const tx = { id: "tx" };
    const ca = {
      id: "ca-1",
      name: "intermediate",
      projectId: "project-1",
      internalCa: {
        id: "internal-ca-1",
        type: InternalCaType.INTERMEDIATE,
        dn: "CN=Example Intermediate CA",
        commonName: "Example Intermediate CA",
        organization: "",
        ou: "",
        country: "",
        province: "",
        locality: "",
        keyAlgorithm: "EC_prime256v1",
        maxPathLength: null,
        parentCaId: null,
        activeCaCertId: null
      }
    };

    const certificateAuthorityCertDAL = {
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "ca-cert-1" }),
      transaction: vi.fn((fn: (trx: unknown) => unknown) => fn(tx))
    };
    const internalCertificateAuthorityDAL = { update: vi.fn() };
    const certificateAuthorityCrlDAL = { update: vi.fn() };
    const caSigningConfigDAL = { findByCaId: vi.fn(), create: vi.fn() };
    const signer = {
      ...buildLocalCaSigner({
        privateKey: caKeys.privateKey,
        publicKey: caKeys.publicKey,
        signingAlgorithm: SIGNING_ALGORITHM
      }),
      createCrl
    };

    const service = internalCertificateAuthorityServiceFactory({
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca),
        findWithAssociatedCa: vi.fn().mockResolvedValue([]),
        updateById: vi.fn()
      },
      certificateAuthorityCertDAL,
      internalCertificateAuthorityDAL,
      certificateAuthorityCrlDAL,
      caSigningConfigDAL,
      certificateAuthoritySecretDAL: {
        findOne: vi.fn().mockResolvedValue({ id: "secret-1", keySource: CertKeySource.Hsm })
      },
      projectDAL: {
        transaction: vi.fn((fn: (trx: unknown) => unknown) => fn(undefined)),
        findOne: vi.fn().mockResolvedValue({
          id: "project-1",
          kmsCertificateKeyId: "kms-key-1"
        })
      },
      certificateDAL: { find: vi.fn().mockResolvedValue([]) },
      kmsService: {
        encryptWithKmsKey: vi.fn().mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: plainText
        }))
      },
      caKeySourceService: { buildSigner: vi.fn().mockResolvedValue(signer) }
    } as never);

    return {
      service,
      tx,
      certificateAuthorityCertDAL,
      internalCertificateAuthorityDAL,
      certificateAuthorityCrlDAL,
      caSigningConfigDAL
    };
  };

  it("commits nothing when signing the CRL fails", async () => {
    const deps = buildService(vi.fn().mockRejectedValue(new Error("HSM unavailable")));

    await expect(
      deps.service.importCertToCa({
        isInternal: true,
        caId: "ca-1",
        certificate,
        certificateChain
      })
    ).rejects.toThrow("HSM unavailable");

    expect(deps.certificateAuthorityCertDAL.transaction).not.toHaveBeenCalled();
    expect(deps.certificateAuthorityCertDAL.create).not.toHaveBeenCalled();
    expect(deps.internalCertificateAuthorityDAL.update).not.toHaveBeenCalled();
    expect(deps.certificateAuthorityCrlDAL.update).not.toHaveBeenCalled();
  });

  it("saves the CRL in the same transaction that activates the certificate", async () => {
    const crl = { rawData: new Uint8Array([1, 2, 3]).buffer };
    const deps = buildService(vi.fn().mockResolvedValue(crl));

    await deps.service.importCertToCa({
      isInternal: true,
      caId: "ca-1",
      certificate,
      certificateChain
    });

    expect(deps.internalCertificateAuthorityDAL.update).toHaveBeenCalledWith(
      { caId: "ca-1" },
      expect.objectContaining({ activeCaCertId: "ca-cert-1" }),
      deps.tx
    );
    expect(deps.certificateAuthorityCrlDAL.update).toHaveBeenCalledWith(
      { caId: "ca-1" },
      { encryptedCrl: Buffer.from([1, 2, 3]) },
      deps.tx
    );
  });
});
