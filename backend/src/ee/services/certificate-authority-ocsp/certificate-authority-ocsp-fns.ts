import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

import { crypto } from "@app/lib/crypto/cryptography";
import { pqcNameToOid } from "@app/lib/crypto/pqc/pqc-utils";
import { BadRequestError } from "@app/lib/errors";
import { TCaSigner } from "@app/services/certificate-authority/ca-signer";

import {
  OCSP_BASIC_RESPONSE_OID,
  OCSP_HASH_NAME_BY_OID,
  OCSP_MAX_CERT_IDS_PER_REQUEST,
  OCSP_MAX_NONCE_BYTES,
  OCSP_MAX_SERIAL_HEX_LENGTH,
  OCSP_NONCE_OID,
  OcspCertStatus,
  OcspResponseStatus
} from "./certificate-authority-ocsp-enums";
import { TOcspCertStatus, TParsedOcspRequest, TParsedOcspRequestEntry } from "./certificate-authority-ocsp-types";

const RSA_SIGNATURE_OID_BY_HASH: Record<string, string> = {
  "SHA-256": "1.2.840.113549.1.1.11",
  "SHA-384": "1.2.840.113549.1.1.12",
  "SHA-512": "1.2.840.113549.1.1.13"
};

const ECDSA_SIGNATURE_OID_BY_HASH: Record<string, string> = {
  "SHA-256": "1.2.840.10045.4.3.2",
  "SHA-384": "1.2.840.10045.4.3.3",
  "SHA-512": "1.2.840.10045.4.3.4"
};

const toArrayBuffer = (view: Uint8Array): ArrayBuffer =>
  view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);

export const normalizeSerialNumber = (hex: string): string => {
  let out = hex.toLowerCase();
  while (out.length > 1 && out.startsWith("0")) out = out.slice(1);
  return out;
};

const toMinimalSerialBytes = (hex: string): Buffer => {
  let bytes = Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, "hex");
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  bytes = bytes.subarray(start);
  // eslint-disable-next-line no-bitwise
  return bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : Buffer.from(bytes);
};

const algorithmHashName = (alg: Algorithm): string | undefined => {
  const { hash } = alg as { hash?: string | { name?: string } };
  return typeof hash === "string" ? hash : hash?.name;
};

export const resolveOcspSignatureAlgorithm = (
  signingAlgorithm: Algorithm
): { algorithmId: string; algorithmParams?: asn1js.Null } => {
  const hash = algorithmHashName(signingAlgorithm);
  const name = signingAlgorithm.name.toUpperCase();

  const pqcAlgorithmId = pqcNameToOid(signingAlgorithm.name);
  if (pqcAlgorithmId) return { algorithmId: pqcAlgorithmId };

  if (name === "RSASSA-PKCS1-V1_5") {
    const algorithmId = hash ? RSA_SIGNATURE_OID_BY_HASH[hash] : undefined;
    if (algorithmId) return { algorithmId, algorithmParams: new asn1js.Null() };
  }

  if (name === "ECDSA") {
    const algorithmId = hash ? ECDSA_SIGNATURE_OID_BY_HASH[hash] : undefined;
    if (algorithmId) return { algorithmId };
  }

  throw new BadRequestError({
    message: `OCSP responses cannot be signed with ${signingAlgorithm.name}${
      hash ? ` and ${hash}` : ""
    }. This certificate authority's key algorithm is not supported by the OCSP responder.`
  });
};

const digestForOcsp = (hashAlgorithmOid: string, data: Buffer): Buffer | null => {
  const hashName = OCSP_HASH_NAME_BY_OID[hashAlgorithmOid];
  if (!hashName) return null;
  return crypto.nativeCrypto.createHash(hashName).update(data).digest();
};

export const parseOcspRequest = (der: Buffer): TParsedOcspRequest | null => {
  let request: pkijs.OCSPRequest;
  try {
    request = pkijs.OCSPRequest.fromBER(toArrayBuffer(new Uint8Array(der)));
  } catch {
    return null;
  }

  const requestList = request.tbsRequest.requestList ?? [];
  if (requestList.length === 0 || requestList.length > OCSP_MAX_CERT_IDS_PER_REQUEST) return null;

  const entries: TParsedOcspRequestEntry[] = [];
  for (const item of requestList) {
    const { reqCert } = item;
    if (!reqCert) return null;

    const { algorithmId: hashAlgorithmOid } = reqCert.hashAlgorithm;
    if (!OCSP_HASH_NAME_BY_OID[hashAlgorithmOid]) return null;

    const rawSerialNumber = Buffer.from(reqCert.serialNumber.valueBlock.valueHexView).toString("hex").toLowerCase();
    if (rawSerialNumber.length === 0 || rawSerialNumber.length > OCSP_MAX_SERIAL_HEX_LENGTH) return null;

    entries.push({
      hashAlgorithmOid,
      issuerNameHash: Buffer.from(reqCert.issuerNameHash.valueBlock.valueHexView),
      issuerKeyHash: Buffer.from(reqCert.issuerKeyHash.valueBlock.valueHexView),
      rawSerialNumber,
      serialNumber: normalizeSerialNumber(rawSerialNumber)
    });
  }

  let nonce: Buffer | undefined;
  const nonceExtension = request.tbsRequest.requestExtensions?.find((ext) => ext.extnID === OCSP_NONCE_OID);
  if (nonceExtension) {
    const rawExtnValue = new Uint8Array(nonceExtension.extnValue.valueBlock.valueHexView);
    const decoded = asn1js.fromBER(toArrayBuffer(rawExtnValue));
    if (decoded.offset !== -1 && !(decoded.result instanceof asn1js.OctetString)) return null;
    const candidate =
      decoded.offset === -1
        ? Buffer.from(rawExtnValue)
        : Buffer.from((decoded.result as asn1js.OctetString).valueBlock.valueHexView);

    if (candidate.length === 0 || candidate.length > OCSP_MAX_NONCE_BYTES) return null;
    nonce = candidate;
  }

  return { entries, nonce };
};

export const buildOcspErrorResponse = (status: OcspResponseStatus): Buffer => {
  const response = new pkijs.OCSPResponse({ responseStatus: new asn1js.Enumerated({ value: status }) });
  return Buffer.from(response.toSchema().toBER(false));
};

const buildCertStatus = (status: TOcspCertStatus): asn1js.BaseBlock => {
  if (status.kind === OcspCertStatus.Good) {
    return new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 0 } });
  }

  if (status.kind === OcspCertStatus.Revoked) {
    // RFC 5280 4.1.2.5.2 forbids fractional seconds in GeneralizedTime, and Go's encoding/asn1
    // rejects the whole response rather than just this field. revokedAt comes from the database
    // with milliseconds, unlike thisUpdate/nextUpdate which the caller already truncates.
    const revokedAt = new Date(status.revokedAt);
    revokedAt.setMilliseconds(0);

    const revokedInfo: asn1js.BaseBlock[] = [new asn1js.GeneralizedTime({ valueDate: revokedAt })];
    if (typeof status.reason === "number") {
      revokedInfo.push(
        new asn1js.Constructed({
          idBlock: { tagClass: 3, tagNumber: 0 },
          value: [new asn1js.Enumerated({ value: status.reason })]
        })
      );
    }
    return new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 1 }, value: revokedInfo });
  }

  return new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 2 } });
};

export const buildSignedOcspResponse = async ({
  signer,
  caCertificate,
  statuses,
  nonce,
  thisUpdate,
  nextUpdate
}: {
  signer: TCaSigner;
  caCertificate: x509.X509Certificate;
  statuses: { entry: TParsedOcspRequestEntry; status: TOcspCertStatus }[];
  nonce?: Buffer;
  thisUpdate: Date;
  nextUpdate: Date;
}): Promise<Buffer> => {
  const caCert = pkijs.Certificate.fromBER(caCertificate.rawData);
  const signatureAlgorithm = resolveOcspSignatureAlgorithm(signer.signingAlgorithm);

  const basicResponse = new pkijs.BasicOCSPResponse();
  basicResponse.tbsResponseData.responderID = caCert.subject;
  basicResponse.tbsResponseData.producedAt = thisUpdate;
  basicResponse.tbsResponseData.responses = statuses.map(({ entry, status }) => {
    const single = new pkijs.SingleResponse();
    single.certID = new pkijs.CertID({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({
        algorithmId: entry.hashAlgorithmOid,
        algorithmParams: new asn1js.Null()
      }),
      issuerNameHash: new asn1js.OctetString({ valueHex: toArrayBuffer(new Uint8Array(entry.issuerNameHash)) }),
      issuerKeyHash: new asn1js.OctetString({ valueHex: toArrayBuffer(new Uint8Array(entry.issuerKeyHash)) }),
      serialNumber: new asn1js.Integer({
        valueHex: toArrayBuffer(new Uint8Array(toMinimalSerialBytes(entry.serialNumber)))
      })
    });
    single.certStatus = buildCertStatus(status);
    single.thisUpdate = thisUpdate;
    single.nextUpdate = nextUpdate;
    return single;
  });

  if (nonce) {
    basicResponse.tbsResponseData.responseExtensions = [
      new pkijs.Extension({
        extnID: OCSP_NONCE_OID,
        extnValue: new asn1js.OctetString({ valueHex: toArrayBuffer(new Uint8Array(nonce)) }).toBER()
      })
    ];
  }

  basicResponse.signatureAlgorithm = new pkijs.AlgorithmIdentifier(signatureAlgorithm);

  const tbsSchema = basicResponse.tbsResponseData.toSchema(true) as asn1js.Sequence;
  const tbs = Buffer.from(tbsSchema.toBER(false));
  const signature = await signer.signTbs(tbs);

  basicResponse.tbsResponseData.tbsView = new Uint8Array(tbs);
  basicResponse.signature = new asn1js.BitString({ valueHex: signature });
  basicResponse.certs = [caCert];

  const response = new pkijs.OCSPResponse({
    responseStatus: new asn1js.Enumerated({ value: OcspResponseStatus.Successful }),
    responseBytes: new pkijs.ResponseBytes({
      responseType: OCSP_BASIC_RESPONSE_OID,
      response: new asn1js.OctetString({ valueHex: basicResponse.toSchema().toBER(false) })
    })
  });

  return Buffer.from(response.toSchema().toBER(false));
};

export const getCaOcspIdentifiers = (
  caCertificate: x509.X509Certificate,
  hashAlgorithmOid: string
): { issuerNameHash: Buffer; issuerKeyHash: Buffer } | null => {
  const caCert = pkijs.Certificate.fromBER(caCertificate.rawData);

  const subjectDer = Buffer.from(caCert.subject.toSchema().toBER(false));
  const publicKeyBits = Buffer.from(caCert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);

  const issuerNameHash = digestForOcsp(hashAlgorithmOid, subjectDer);
  const issuerKeyHash = digestForOcsp(hashAlgorithmOid, publicKeyBits);
  if (!issuerNameHash || !issuerKeyHash) return null;

  return { issuerNameHash, issuerKeyHash };
};
