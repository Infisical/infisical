import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import {
  AlgorithmIdentifier,
  Attribute,
  Certificate,
  ContentInfo,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo
} from "pkijs";
import { beforeAll, describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { parseEnrollmentRequestToken } from "./microsoft-autoenrollment-cmc-fns";

const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const DATA_OID = "1.2.840.113549.1.7.1";
const CMC_PKI_DATA_OID = "1.3.6.1.5.5.7.12.2";
const NO_SIGNATURE_OID = "1.3.6.1.5.5.7.6.2";
const RSA_SHA256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

type TSigner = { privateKey: crypto.KeyObject; certificate: Certificate | null };

const generateKeys = () =>
  globalThis.crypto.subtle.generateKey(
    { ...RSA_SHA256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"]
  );

const toKeyObject = async (keys: CryptoKeyPair) =>
  crypto.createPrivateKey({
    key: Buffer.from(await globalThis.crypto.subtle.exportKey("pkcs8", keys.privateKey)),
    format: "der",
    type: "pkcs8"
  });

const createCertificateSigner = async (commonName: string): Promise<TSigner> => {
  const keys = await generateKeys();
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(8).toString("hex"),
    name: `CN=${commonName}`,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    signingAlgorithm: RSA_SHA256,
    keys
  });
  return {
    privateKey: await toKeyObject(keys),
    certificate: new Certificate({ schema: asn1js.fromBER(certificate.rawData).result })
  };
};

const buildSignedData = ({
  content,
  contentType = DATA_OID,
  signer,
  attachedCertificates,
  messageDigest = crypto.createHash("sha256").update(content).digest(),
  noSignatureSigner
}: {
  content: Buffer;
  contentType?: string;
  signer: TSigner;
  attachedCertificates: Certificate[];
  messageDigest?: Buffer;
  noSignatureSigner?: { signatureValue?: Buffer };
}) => {
  const signedAttrs = new SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1js.ObjectIdentifier({ value: contentType })] }),
      new Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1js.OctetString({ valueHex: messageDigest })] })
    ]
  });
  const signedAttrsDer = Buffer.from(signedAttrs.toSchema().toBER(false));
  signedAttrsDer[0] = 0x31;

  const issuerCertificate = signer.certificate ?? attachedCertificates[0];
  const signerIdentifier = () =>
    new IssuerAndSerialNumber({
      issuer: issuerCertificate.issuer,
      serialNumber: issuerCertificate.serialNumber
    });
  const unsignedSignerInfos = noSignatureSigner
    ? [
        new SignerInfo({
          version: 1,
          sid: signerIdentifier(),
          digestAlgorithm: new AlgorithmIdentifier({ algorithmId: SHA256_OID }),
          signedAttrs,
          signatureAlgorithm: new AlgorithmIdentifier({
            algorithmId: NO_SIGNATURE_OID,
            algorithmParams: new asn1js.Null()
          }),
          signature: new asn1js.OctetString({
            valueHex: noSignatureSigner.signatureValue ?? crypto.createHash("sha256").update(signedAttrsDer).digest()
          })
        })
      ]
    : [];
  const signedData = new SignedData({
    version: 3,
    digestAlgorithms: [new AlgorithmIdentifier({ algorithmId: SHA256_OID })],
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: contentType,
      eContent: new asn1js.OctetString({ valueHex: content })
    }),
    certificates: attachedCertificates,
    signerInfos: [
      ...unsignedSignerInfos,
      new SignerInfo({
        version: 1,
        sid: signerIdentifier(),
        digestAlgorithm: new AlgorithmIdentifier({ algorithmId: SHA256_OID }),
        signedAttrs,
        signatureAlgorithm: new AlgorithmIdentifier({ algorithmId: "1.2.840.113549.1.1.11" }),
        signature: new asn1js.OctetString({ valueHex: crypto.sign("sha256", signedAttrsDer, signer.privateKey) })
      })
    ]
  });

  return Buffer.from(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    new ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signedData.toSchema() }).toSchema().toBER(false)
  );
};

const wrapInPkiData = (csrDer: Buffer) =>
  Buffer.from(
    new asn1js.Sequence({
      value: [
        new asn1js.Sequence({ value: [] }),
        new asn1js.Sequence({
          value: [
            new asn1js.Constructed({
              idBlock: { tagClass: 3, tagNumber: 0 },
              value: [new asn1js.Integer({ value: 1 }), asn1js.fromBER(csrDer).result]
            })
          ]
        }),
        new asn1js.Sequence({ value: [] }),
        new asn1js.Sequence({ value: [] })
      ]
    }).toBER(false)
  );

describe("parseEnrollmentRequestToken", () => {
  let csrDer: Buffer;
  let csrSigner: TSigner;
  let currentCertificateSigner: TSigner;
  let unrelatedSigner: TSigner;

  beforeAll(async () => {
    x509.cryptoProvider.set(globalThis.crypto);
    const keys = await generateKeys();
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({ keys, signingAlgorithm: RSA_SHA256 });
    csrDer = Buffer.from(csr.rawData);
    csrSigner = { privateKey: await toKeyObject(keys), certificate: null };
    currentCertificateSigner = await createCertificateSigner("laptop01.corp.example.com");
    unrelatedSigner = await createCertificateSigner("unrelated");
  });

  test("accepts a plain PKCS#10 request with no current certificate", async () => {
    const parsed = await parseEnrollmentRequestToken(csrDer);

    expect(Buffer.from(parsed.csr.rawData).equals(csrDer)).toBe(true);
    expect(parsed.currentCertificate).toBeNull();
  });

  test("rejects a request whose signature does not match its public key", async () => {
    const tampered = Buffer.from(csrDer);
    tampered[tampered.length - 1] = 0xff - tampered[tampered.length - 1];

    await expect(parseEnrollmentRequestToken(tampered)).rejects.toThrow(BadRequestError);
  });

  test("rejects bytes that are not DER", async () => {
    await expect(parseEnrollmentRequestToken(Buffer.from("not a request"))).rejects.toThrow(BadRequestError);
  });

  test("extracts the CSR from a CMC request signed with the new key", async () => {
    const token = buildSignedData({
      content: wrapInPkiData(csrDer),
      contentType: CMC_PKI_DATA_OID,
      signer: csrSigner,
      attachedCertificates: [currentCertificateSigner.certificate as Certificate]
    });

    const parsed = await parseEnrollmentRequestToken(token);

    expect(Buffer.from(parsed.csr.rawData).equals(csrDer)).toBe(true);
    expect(parsed.currentCertificate).toBeNull();
  });

  test("returns the attached certificate whose key signed a renewal request", async () => {
    const token = buildSignedData({
      content: csrDer,
      signer: currentCertificateSigner,
      attachedCertificates: [
        unrelatedSigner.certificate as Certificate,
        currentCertificateSigner.certificate as Certificate
      ]
    });

    const parsed = await parseEnrollmentRequestToken(token);

    expect(parsed.currentCertificate?.subject).toBe("CN=laptop01.corp.example.com");
  });

  test("accepts a renewal whose first signer uses the No-Signature mechanism", async () => {
    const token = buildSignedData({
      content: wrapInPkiData(csrDer),
      contentType: CMC_PKI_DATA_OID,
      signer: currentCertificateSigner,
      attachedCertificates: [currentCertificateSigner.certificate as Certificate],
      noSignatureSigner: {}
    });

    const parsed = await parseEnrollmentRequestToken(token);

    expect(Buffer.from(parsed.csr.rawData).equals(csrDer)).toBe(true);
    expect(parsed.currentCertificate?.subject).toBe("CN=laptop01.corp.example.com");
  });

  test("rejects a No-Signature signer whose value is not the hash of the signed data", async () => {
    const token = buildSignedData({
      content: wrapInPkiData(csrDer),
      contentType: CMC_PKI_DATA_OID,
      signer: currentCertificateSigner,
      attachedCertificates: [currentCertificateSigner.certificate as Certificate],
      noSignatureSigner: { signatureValue: crypto.createHash("sha256").update("other content").digest() }
    });

    await expect(parseEnrollmentRequestToken(token)).rejects.toThrow("does not carry the hash");
  });

  test("rejects a signature that matches neither the new key nor an attached certificate", async () => {
    const token = buildSignedData({
      content: csrDer,
      signer: unrelatedSigner,
      attachedCertificates: [currentCertificateSigner.certificate as Certificate]
    });

    await expect(parseEnrollmentRequestToken(token)).rejects.toThrow(BadRequestError);
  });

  test("rejects a message digest that does not match the signed content", async () => {
    const token = buildSignedData({
      content: csrDer,
      signer: currentCertificateSigner,
      attachedCertificates: [currentCertificateSigner.certificate as Certificate],
      messageDigest: crypto.createHash("sha256").update("other content").digest()
    });

    await expect(parseEnrollmentRequestToken(token)).rejects.toThrow(BadRequestError);
  });
});
