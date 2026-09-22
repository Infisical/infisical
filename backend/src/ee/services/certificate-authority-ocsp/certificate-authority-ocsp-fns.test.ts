import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { beforeAll, describe, expect, it } from "vitest";

import { TCaSigner } from "@app/services/certificate-authority/ca-signer";

import {
  OCSP_HASH_NAME_BY_OID,
  OCSP_NONCE_OID,
  OcspCertStatus,
  OcspResponseStatus
} from "./certificate-authority-ocsp-enums";
import {
  buildOcspErrorResponse,
  buildOcspRequestFingerprint,
  buildSignedOcspResponse,
  getCaOcspIdentifiers,
  normalizeSerialNumber,
  parseOcspRequest,
  resolveOcspSignatureAlgorithm
} from "./certificate-authority-ocsp-fns";

const RSA_ALG: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048
};

const LEAF_SERIAL = "4f2a9c1b33";

let caKeys: CryptoKeyPair;
let caCert: x509.X509Certificate;
let leafCert: x509.X509Certificate;
let signer: TCaSigner;

const buildClientRequest = async (serialHex?: string, withNonce = false) => {
  const request = new pkijs.OCSPRequest();
  await request.createForCertificate(pkijs.Certificate.fromBER(leafCert.rawData), {
    hashAlgorithm: "SHA-1",
    issuerCertificate: pkijs.Certificate.fromBER(caCert.rawData)
  });

  if (serialHex) {
    request.tbsRequest.requestList[0].reqCert.serialNumber = new asn1js.Integer({
      valueHex: Buffer.from(serialHex, "hex")
    });
  }

  if (withNonce) {
    request.tbsRequest.requestExtensions = [
      new pkijs.Extension({
        extnID: OCSP_NONCE_OID,
        extnValue: new asn1js.OctetString({ valueHex: Buffer.from("0102030405060708", "hex") }).toBER()
      })
    ];
  }

  return Buffer.from(request.toSchema(true).toBER(false));
};

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  pkijs.setEngine("test", new pkijs.CryptoEngine({ crypto: webcrypto as unknown as Crypto }));

  caKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;

  caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Unit Test Root CA, O=Example Inc",
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: RSA_ALG,
    keys: caKeys,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)]
  });

  const leafKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  leafCert = await x509.X509CertificateGenerator.create({
    serialNumber: LEAF_SERIAL,
    subject: "CN=api.corp.internal",
    issuer: caCert.subject,
    notBefore: new Date(Date.now() - 3_600_000),
    notAfter: new Date(Date.now() + 3_600_000),
    signingKey: caKeys.privateKey,
    publicKey: leafKeys.publicKey,
    signingAlgorithm: RSA_ALG
  });

  signer = {
    caPublicKey: caKeys.publicKey,
    signingAlgorithm: RSA_ALG,
    createCertificate: () => {
      throw new Error("not used");
    },
    createCsr: () => {
      throw new Error("not used");
    },
    createCrl: () => {
      throw new Error("not used");
    },
    signTbs: (tbs: Buffer) => webcrypto.subtle.sign(RSA_ALG, caKeys.privateKey, tbs)
  } as unknown as TCaSigner;
});

describe("normalizeSerialNumber", () => {
  it("should lowercase and strip the DER sign-padding byte", () => {
    expect(normalizeSerialNumber("00FF2A")).toBe("ff2a");
  });

  it("should leave an already-normalized serial untouched", () => {
    expect(normalizeSerialNumber("4f2a9c1b33")).toBe("4f2a9c1b33");
  });

  it("should not collapse a zero serial to an empty string", () => {
    expect(normalizeSerialNumber("00")).toBe("0");
  });
});

describe("resolveOcspSignatureAlgorithm", () => {
  it.each([
    ["SHA-256", "1.2.840.113549.1.1.11"],
    ["SHA-384", "1.2.840.113549.1.1.12"],
    ["SHA-512", "1.2.840.113549.1.1.13"]
  ])("should map RSA with %s", (hash, oid) => {
    expect(resolveOcspSignatureAlgorithm({ name: "RSASSA-PKCS1-v1_5", hash } as Algorithm).algorithmId).toBe(oid);
  });

  it.each([
    ["SHA-256", "1.2.840.10045.4.3.2"],
    ["SHA-384", "1.2.840.10045.4.3.3"]
  ])("should map ECDSA with %s", (hash, oid) => {
    expect(resolveOcspSignatureAlgorithm({ name: "ECDSA", hash } as Algorithm).algorithmId).toBe(oid);
  });

  it.each([
    ["ML-DSA-44", "2.16.840.1.101.3.4.3.17"],
    ["ML-DSA-65", "2.16.840.1.101.3.4.3.18"],
    ["ML-DSA-87", "2.16.840.1.101.3.4.3.19"],
    ["SLH-DSA-SHA2-128s", "2.16.840.1.101.3.4.3.20"],
    ["SLH-DSA-SHAKE-256f", "2.16.840.1.101.3.4.3.31"]
  ])("should map the post-quantum algorithm %s", (name, oid) => {
    const resolved = resolveOcspSignatureAlgorithm({ name } as Algorithm);

    expect(resolved.algorithmId).toBe(oid);
    expect(resolved.algorithmParams).toBeUndefined();
  });

  it("should reject an algorithm the responder cannot sign with", () => {
    expect(() => resolveOcspSignatureAlgorithm({ name: "Ed25519" } as Algorithm)).toThrow(/not supported/i);
  });
});

describe("parseOcspRequest", () => {
  it("should extract the CertID and normalize the serial", async () => {
    const parsed = parseOcspRequest(await buildClientRequest());

    expect(parsed).not.toBeNull();
    expect(parsed?.entries).toHaveLength(1);
    expect(parsed?.entries[0].serialNumber).toBe(LEAF_SERIAL);
    expect(parsed?.entries[0].rawSerialNumber).toBe(LEAF_SERIAL);
    expect(parsed?.entries[0].hashAlgorithmOid).toBe("1.3.14.3.2.26");
    expect(parsed?.nonce).toBeUndefined();
  });

  it("should unwrap the nonce extension", async () => {
    const parsed = parseOcspRequest(await buildClientRequest(undefined, true));

    expect(parsed?.nonce?.toString("hex")).toBe("0102030405060708");
  });

  it("should return null for a body that is not an OCSP request", () => {
    expect(parseOcspRequest(Buffer.from("definitely not asn1"))).toBeNull();
  });

  it("should return null for an empty body", () => {
    expect(parseOcspRequest(Buffer.alloc(0))).toBeNull();
  });

  it("should keep the raw serial alongside the normalized one when it has a leading zero byte", async () => {
    const parsed = parseOcspRequest(await buildClientRequest("0a2c3d4e"));

    expect(parsed?.entries[0].rawSerialNumber).toBe("0a2c3d4e");
    expect(parsed?.entries[0].serialNumber).toBe("a2c3d4e");
  });

  it("should reject a serial longer than RFC 5280 allows", async () => {
    expect(parseOcspRequest(await buildClientRequest("00".repeat(64)))).toBeNull();
  });

  it("should reject a nonce longer than RFC 8954 allows", async () => {
    const request = new pkijs.OCSPRequest();
    await request.createForCertificate(pkijs.Certificate.fromBER(leafCert.rawData), {
      hashAlgorithm: "SHA-1",
      issuerCertificate: pkijs.Certificate.fromBER(caCert.rawData)
    });
    request.tbsRequest.requestExtensions = [
      new pkijs.Extension({
        extnID: OCSP_NONCE_OID,
        extnValue: new asn1js.OctetString({ valueHex: Buffer.alloc(33, 7) }).toBER()
      })
    ];

    expect(parseOcspRequest(Buffer.from(request.toSchema(true).toBER(false)))).toBeNull();
  });
});

describe("getCaOcspIdentifiers", () => {
  it("should derive hashes that match what a client computes", async () => {
    const parsed = parseOcspRequest(await buildClientRequest());
    const identifiers = getCaOcspIdentifiers(caCert, "1.3.14.3.2.26");

    expect(identifiers?.issuerNameHash.equals(parsed!.entries[0].issuerNameHash)).toBe(true);
    expect(identifiers?.issuerKeyHash.equals(parsed!.entries[0].issuerKeyHash)).toBe(true);
  });

  it("should return null for a hash algorithm we do not support", () => {
    expect(getCaOcspIdentifiers(caCert, "1.2.3.4.5")).toBeNull();
  });
});

describe("buildOcspErrorResponse", () => {
  it.each([
    [OcspResponseStatus.MalformedRequest, 1],
    [OcspResponseStatus.InternalError, 2],
    [OcspResponseStatus.Unauthorized, 6]
  ])("should encode %s with no responseBytes", (status, expected) => {
    const parsed = pkijs.OCSPResponse.fromBER(buildOcspErrorResponse(status));

    expect(parsed.responseStatus.valueBlock.valueDec).toBe(expected);
    expect(parsed.responseBytes).toBeUndefined();
  });
});

describe("buildSignedOcspResponse", () => {
  const thisUpdate = new Date("2026-09-21T13:00:00.000Z");
  const nextUpdate = new Date("2026-09-21T14:00:00.000Z");

  const build = async (
    status: Parameters<typeof buildSignedOcspResponse>[0]["statuses"][number]["status"],
    serialHex?: string
  ) => {
    const parsed = parseOcspRequest(await buildClientRequest(serialHex));
    return buildSignedOcspResponse({
      signer,
      caCertificate: caCert,
      statuses: [{ entry: parsed!.entries[0], status }],
      thisUpdate,
      nextUpdate
    });
  };

  const readBasic = (der: Buffer) => {
    const response = pkijs.OCSPResponse.fromBER(der);
    expect(response.responseStatus.valueBlock.valueDec).toBe(OcspResponseStatus.Successful);
    return new pkijs.BasicOCSPResponse({
      schema: asn1js.fromBER(response.responseBytes!.response.valueBlock.valueHexView).result
    });
  };

  it("should produce a good response whose signature verifies against the CA key", async () => {
    const basic = readBasic(await build({ kind: OcspCertStatus.Good }));

    expect(basic.tbsResponseData.responses).toHaveLength(1);
    expect((basic.tbsResponseData.responses[0].certStatus as asn1js.BaseBlock).idBlock.tagNumber).toBe(0);
    await expect(basic.verify({ trustedCerts: [pkijs.Certificate.fromBER(caCert.rawData)] })).resolves.toBe(true);
  });

  it("should encode revoked with its reason", async () => {
    const revokedAt = new Date("2026-09-20T10:00:00.000Z");
    const basic = readBasic(await build({ kind: OcspCertStatus.Revoked, revokedAt, reason: 1 }));

    const certStatus = basic.tbsResponseData.responses[0].certStatus as asn1js.Constructed;
    expect(certStatus.idBlock.tagNumber).toBe(1);
    expect((certStatus.valueBlock.value[0] as asn1js.GeneralizedTime).toDate().toISOString()).toBe(
      revokedAt.toISOString()
    );
  });

  it("should encode unknown", async () => {
    const basic = readBasic(await build({ kind: OcspCertStatus.Unknown }));

    expect((basic.tbsResponseData.responses[0].certStatus as asn1js.BaseBlock).idBlock.tagNumber).toBe(2);
  });

  it("should carry thisUpdate and nextUpdate through", async () => {
    const basic = readBasic(await build({ kind: OcspCertStatus.Good }));
    const single = basic.tbsResponseData.responses[0];

    expect(single.thisUpdate.toISOString()).toBe(thisUpdate.toISOString());
    expect(single.nextUpdate?.toISOString()).toBe(nextUpdate.toISOString());
  });

  it("should emit a canonical CertID rather than echoing a non-minimal serial", async () => {
    const padded = readBasic(await build({ kind: OcspCertStatus.Good }, `0000${LEAF_SERIAL}`));
    const honest = readBasic(await build({ kind: OcspCertStatus.Good }, LEAF_SERIAL));

    const serialOf = (basic: pkijs.BasicOCSPResponse) =>
      Buffer.from(basic.tbsResponseData.responses[0].certID.serialNumber.valueBlock.valueHexView).toString("hex");

    expect(serialOf(padded)).toBe(serialOf(honest));
    expect(serialOf(padded)).toBe(LEAF_SERIAL);
  });

  it("should echo the nonce when the request carried one", async () => {
    const parsed = parseOcspRequest(await buildClientRequest(undefined, true));
    const basic = readBasic(
      await buildSignedOcspResponse({
        signer,
        caCertificate: caCert,
        statuses: [{ entry: parsed!.entries[0], status: { kind: OcspCertStatus.Good } }],
        nonce: parsed!.nonce,
        thisUpdate,
        nextUpdate
      })
    );

    const echoed = basic.tbsResponseData.responseExtensions?.find((ext) => ext.extnID === OCSP_NONCE_OID);
    expect(echoed).toBeDefined();
    expect(Buffer.from((echoed!.parsedValue as asn1js.OctetString).valueBlock.valueHexView).toString("hex")).toBe(
      "0102030405060708"
    );
  });
});

describe("buildOcspRequestFingerprint", () => {
  const a = { hashAlgorithmOid: "1.3.14.3.2.26", serialNumber: "aa11" };
  const b = { hashAlgorithmOid: "1.3.14.3.2.26", serialNumber: "bb22" };

  it("should not depend on the order the certIDs arrived in", () => {
    expect(buildOcspRequestFingerprint([a, b])).toBe(buildOcspRequestFingerprint([b, a]));
  });

  it("should differ when a serial differs", () => {
    expect(buildOcspRequestFingerprint([a, b])).not.toBe(
      buildOcspRequestFingerprint([a, { ...b, serialNumber: "bb23" }])
    );
  });

  it("should differ when the hash algorithm differs", () => {
    expect(buildOcspRequestFingerprint([a])).not.toBe(
      buildOcspRequestFingerprint([{ ...a, hashAlgorithmOid: "2.16.840.1.101.3.4.2.1" }])
    );
  });

  it("should distinguish a subset from a superset", () => {
    expect(buildOcspRequestFingerprint([a])).not.toBe(buildOcspRequestFingerprint([a, b]));
  });
});

describe("nonce extension hardening", () => {
  it("should reject a nonce whose inner DER is not an OCTET STRING rather than throwing", async () => {
    const request = new pkijs.OCSPRequest();
    await request.createForCertificate(pkijs.Certificate.fromBER(leafCert.rawData), {
      hashAlgorithm: "SHA-1",
      issuerCertificate: pkijs.Certificate.fromBER(caCert.rawData)
    });
    request.tbsRequest.requestExtensions = [
      new pkijs.Extension({
        extnID: OCSP_NONCE_OID,
        extnValue: new asn1js.Sequence({ value: [new asn1js.Integer({ value: 1 })] }).toBER()
      })
    ];

    expect(() => parseOcspRequest(Buffer.from(request.toSchema(true).toBER(false)))).not.toThrow();
    expect(parseOcspRequest(Buffer.from(request.toSchema(true).toBER(false)))).toBeNull();
  });
});

describe("hash algorithm allowlist", () => {
  const buildRequestWithOid = (oid: string) => {
    const certId = new asn1js.Sequence({
      value: [
        new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: oid }), new asn1js.Null()] }),
        new asn1js.OctetString({ valueHex: new Uint8Array(20).fill(0xaa) }),
        new asn1js.OctetString({ valueHex: new Uint8Array(20).fill(0xbb) }),
        new asn1js.Integer({ value: 1 })
      ]
    });
    const tbs = new asn1js.Sequence({
      value: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [certId] })] })]
    });
    return Buffer.from(new asn1js.Sequence({ value: [tbs] }).toBER(false));
  };

  it.each(Object.keys(OCSP_HASH_NAME_BY_OID))("should accept the supported hash OID %s", (oid) => {
    expect(parseOcspRequest(buildRequestWithOid(oid))).not.toBeNull();
  });

  it("should reject an unsupported hash OID rather than carrying it downstream", () => {
    expect(parseOcspRequest(buildRequestWithOid("1.2.840.113549.2.5"))).toBeNull();
  });

  it("should reject an arbitrarily long attacker-chosen OID", () => {
    const longOid = `1.3.6.1.4.1.${Array.from({ length: 4000 }, (_, i) => (i % 9) + 1).join(".")}`;
    expect(longOid.length).toBeGreaterThan(7000);
    expect(parseOcspRequest(buildRequestWithOid(longOid))).toBeNull();
  });
});
