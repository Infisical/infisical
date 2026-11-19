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
  RSAESOAEPParams,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo
} from "pkijs";
import { beforeAll, describe, expect, test } from "vitest";

import { parseScepMessage } from "./pki-scep-message-parser";
import { KEY_TRANSPORT_OIDS, SCEP_OIDS, ScepMessageType } from "./pki-scep-types";

const AES_128_CBC_OID = "2.16.840.1.101.3.4.1.2";
const SHA1_OID = "1.3.14.3.2.26";
const SHA256_OID = "2.16.840.1.101.3.4.2.1";

type TIdentity = { certificate: Certificate; privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };

type TKeyEncryption = {
  algorithm: AlgorithmIdentifier;
  wrap: (cek: Buffer, recipientPublicKey: crypto.KeyObject) => Buffer;
};

const oaepParams = (hashOid: string, mgfHashOid: string, pSourceAlgorithm?: AlgorithmIdentifier) =>
  new RSAESOAEPParams({
    hashAlgorithm: new AlgorithmIdentifier({ algorithmId: hashOid }),
    maskGenAlgorithm: new AlgorithmIdentifier({
      algorithmId: KEY_TRANSPORT_OIDS.mgf1,
      algorithmParams: new AlgorithmIdentifier({ algorithmId: mgfHashOid }).toSchema()
    }),
    ...(pSourceAlgorithm && { pSourceAlgorithm })
  }).toSchema();

const OAEP_LABEL = Buffer.from("scep-oaep-label");

const PKCS1_V15: TKeyEncryption = {
  algorithm: new AlgorithmIdentifier({
    algorithmId: KEY_TRANSPORT_OIDS.rsaEncryption,
    algorithmParams: new asn1js.Null()
  }),
  wrap: (cek, key) => crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, cek)
};

const OAEP_DEFAULT_PARAMS: TKeyEncryption = {
  algorithm: new AlgorithmIdentifier({
    algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
    algorithmParams: new asn1js.Sequence()
  }),
  wrap: (cek, key) =>
    crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" }, cek)
};

const OAEP_SHA256: TKeyEncryption = {
  algorithm: new AlgorithmIdentifier({
    algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
    algorithmParams: oaepParams(SHA256_OID, SHA256_OID)
  }),
  wrap: (cek, key) =>
    crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, cek)
};

const OAEP_SHA256_WITH_LABEL: TKeyEncryption = {
  algorithm: new AlgorithmIdentifier({
    algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
    algorithmParams: oaepParams(
      SHA256_OID,
      SHA256_OID,
      new AlgorithmIdentifier({
        algorithmId: KEY_TRANSPORT_OIDS.pSpecified,
        algorithmParams: new asn1js.OctetString({ valueHex: OAEP_LABEL })
      })
    )
  }),
  wrap: (cek, key) =>
    crypto.publicEncrypt(
      { key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256", oaepLabel: OAEP_LABEL },
      cek
    )
};

const createIdentity = async (commonName: string): Promise<TIdentity> => {
  const keys = await globalThis.crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(8).toString("hex"),
    name: `CN=${commonName}`,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    keys
  });
  const privateKeyDer = Buffer.from(await globalThis.crypto.subtle.exportKey("pkcs8", keys.privateKey));

  return {
    certificate: new Certificate({ schema: asn1js.fromBER(cert.rawData).result }),
    privateKey: crypto.createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" }),
    publicKey: crypto.createPublicKey({ key: Buffer.from(cert.publicKey.rawData), format: "der", type: "spki" })
  };
};

const buildEnvelopedData = (plainText: Buffer, recipient: TIdentity, keyEncryption: TKeyEncryption): Buffer => {
  const cek = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", cek, iv);
  const encryptedContent = Buffer.concat([cipher.update(plainText), cipher.final()]);

  const keyTransRecipientInfo = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new IssuerAndSerialNumber({
        issuer: recipient.certificate.issuer,
        serialNumber: recipient.certificate.serialNumber
      }).toSchema(),
      keyEncryption.algorithm.toSchema(),
      new asn1js.OctetString({ valueHex: keyEncryption.wrap(cek, recipient.publicKey) })
    ]
  });

  const envelopedData = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Set({ value: [keyTransRecipientInfo] }),
      new asn1js.Sequence({
        value: [
          new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" }),
          new AlgorithmIdentifier({
            algorithmId: AES_128_CBC_OID,
            algorithmParams: new asn1js.OctetString({ valueHex: iv })
          }).toSchema(),
          new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 0 }, valueHex: encryptedContent })
        ]
      })
    ]
  });

  return Buffer.from(
    new ContentInfo({ contentType: "1.2.840.113549.1.7.3", content: envelopedData }).toSchema().toBER(false)
  );
};

const buildPkcsReq = (plainText: Buffer, client: TIdentity, ra: TIdentity, keyEncryption: TKeyEncryption) => {
  const envelopedDataDer = buildEnvelopedData(plainText, ra, keyEncryption);

  const signedAttrs = new SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new Attribute({
        type: "1.2.840.113549.1.9.3",
        values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })]
      }),
      new Attribute({
        type: "1.2.840.113549.1.9.4",
        values: [new asn1js.OctetString({ valueHex: crypto.createHash("sha256").update(envelopedDataDer).digest() })]
      }),
      new Attribute({
        type: SCEP_OIDS.messageType,
        values: [new asn1js.PrintableString({ value: ScepMessageType.PKCSReq })]
      }),
      new Attribute({
        type: SCEP_OIDS.transactionId,
        values: [new asn1js.PrintableString({ value: "test-transaction" })]
      }),
      new Attribute({
        type: SCEP_OIDS.senderNonce,
        values: [new asn1js.OctetString({ valueHex: crypto.randomBytes(16) })]
      })
    ]
  });

  const signedAttrsDer = Buffer.from(signedAttrs.toSchema().toBER(false));
  signedAttrsDer[0] = 0x31;

  const signedData = new SignedData({
    version: 1,
    digestAlgorithms: [new AlgorithmIdentifier({ algorithmId: SHA256_OID })],
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1",
      eContent: new asn1js.OctetString({ valueHex: envelopedDataDer })
    }),
    certificates: [client.certificate],
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({
          issuer: client.certificate.issuer,
          serialNumber: client.certificate.serialNumber
        }),
        digestAlgorithm: new AlgorithmIdentifier({ algorithmId: SHA256_OID }),
        signedAttrs,
        signatureAlgorithm: new AlgorithmIdentifier({ algorithmId: "1.2.840.113549.1.1.11" }),
        signature: new asn1js.OctetString({ valueHex: crypto.sign("sha256", signedAttrsDer, client.privateKey) })
      })
    ]
  });

  return Buffer.from(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    new ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signedData.toSchema() }).toSchema().toBER(false)
  );
};

const exportPkcs8 = (identity: TIdentity) => identity.privateKey.export({ format: "der", type: "pkcs8" });

describe("parseScepMessage key transport", () => {
  let ra: TIdentity;
  let client: TIdentity;
  const csr = Buffer.from("certificate request bytes");

  beforeAll(async () => {
    x509.cryptoProvider.set(globalThis.crypto);
    ra = await createIdentity("Infisical SCEP RA");
    client = await createIdentity("SCEP Protocol Certificate");
  });

  test.each([
    ["RSA PKCS#1 v1.5", PKCS1_V15],
    [
      "RSA PKCS#1 v1.5 labelled with a non-standard algorithm",
      { ...PKCS1_V15, algorithm: new AlgorithmIdentifier({ algorithmId: SHA256_OID }) }
    ],
    ["RSAES-OAEP with default SHA-1 parameters", OAEP_DEFAULT_PARAMS],
    ["RSAES-OAEP with SHA-256 parameters", OAEP_SHA256],
    ["RSAES-OAEP with an explicit label", OAEP_SHA256_WITH_LABEL]
  ])("decrypts a PKCSReq whose content key is wrapped with %s", (_name, keyEncryption) => {
    const parsed = parseScepMessage(buildPkcsReq(csr, client, ra, keyEncryption), exportPkcs8(ra));

    expect(parsed.messageType).toBe(ScepMessageType.PKCSReq);
    expect(parsed.csr?.equals(csr)).toBe(true);
    expect(parsed.clientCipherOid).toBe(AES_128_CBC_OID);
  });

  test("rejects RSAES-OAEP whose mask generation hash differs from its digest", () => {
    const mismatched: TKeyEncryption = {
      algorithm: new AlgorithmIdentifier({
        algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
        algorithmParams: oaepParams(SHA256_OID, SHA1_OID)
      }),
      wrap: OAEP_SHA256.wrap
    };

    expect(() => parseScepMessage(buildPkcsReq(csr, client, ra, mismatched), exportPkcs8(ra))).toThrow(
      "RSA-OAEP with unsupported parameters"
    );
  });

  test("rejects RSAES-OAEP parameters that do not match the RSAES-OAEP-params structure", () => {
    const malformed: TKeyEncryption = {
      algorithm: new AlgorithmIdentifier({
        algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
        algorithmParams: new asn1js.Sequence({ value: [new asn1js.Integer({ value: 5 })] })
      }),
      wrap: OAEP_DEFAULT_PARAMS.wrap
    };

    expect(() => parseScepMessage(buildPkcsReq(csr, client, ra, malformed), exportPkcs8(ra))).toThrow(
      "malformed RSA-OAEP parameters"
    );
  });

  test("rejects an RSAES-OAEP label source other than pSpecified", () => {
    const unsupportedLabelSource: TKeyEncryption = {
      algorithm: new AlgorithmIdentifier({
        algorithmId: KEY_TRANSPORT_OIDS.rsaesOaep,
        algorithmParams: oaepParams(
          SHA256_OID,
          SHA256_OID,
          new AlgorithmIdentifier({ algorithmId: SHA1_OID, algorithmParams: new asn1js.OctetString() })
        )
      }),
      wrap: OAEP_SHA256.wrap
    };

    expect(() => parseScepMessage(buildPkcsReq(csr, client, ra, unsupportedLabelSource), exportPkcs8(ra))).toThrow(
      "unsupported RSA-OAEP label source"
    );
  });

  test("never returns the request when it was encrypted for a different key", async () => {
    const otherRa = await createIdentity("Other RA");
    const message = buildPkcsReq(csr, client, otherRa, OAEP_DEFAULT_PARAMS);

    let decryptedCsr: Buffer | undefined;
    try {
      decryptedCsr = parseScepMessage(message, exportPkcs8(ra)).csr;
    } catch (err) {
      expect((err as Error).message).toBe(
        `Failed to decrypt SCEP enveloped data (key encryption algorithm ${KEY_TRANSPORT_OIDS.rsaesOaep})`
      );
    }

    expect(decryptedCsr?.equals(csr) ?? false).toBe(false);
  });
});
