import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError } from "@app/lib/errors";

export type Pkcs11SigningMechanism = {
  mechanism: string;
  // ECDSA mechanisms return raw r||s; caller must convert to DER before X.509 use.
  isEcdsa: boolean;
};

export const mapSigningAlgorithmToPkcs11Mechanism = (
  algorithm: SigningAlgorithm,
  isDigest: boolean
): Pkcs11SigningMechanism => {
  if (isDigest) {
    if (algorithm.startsWith("RSASSA_PKCS1")) {
      throw new BadRequestError({
        message:
          `Pre-hashed RSA signing (isDigest=true) is not supported with HSM-backed keys. ` +
          `Send the raw message with isDigest=false so the HSM can apply DigestInfo + PKCS#1 v1.5 padding.`
      });
    }
    if (algorithm.startsWith("ECDSA_SHA_")) return { mechanism: "CKM_ECDSA", isEcdsa: true };
  } else {
    switch (algorithm) {
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256:
        return { mechanism: "CKM_SHA256_RSA_PKCS", isEcdsa: false };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384:
        return { mechanism: "CKM_SHA384_RSA_PKCS", isEcdsa: false };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512:
        return { mechanism: "CKM_SHA512_RSA_PKCS", isEcdsa: false };
      case SigningAlgorithm.ECDSA_SHA_256:
        return { mechanism: "CKM_ECDSA_SHA256", isEcdsa: true };
      case SigningAlgorithm.ECDSA_SHA_384:
        return { mechanism: "CKM_ECDSA_SHA384", isEcdsa: true };
      default:
        break;
    }
  }
  throw new BadRequestError({
    message: `Signing algorithm ${algorithm} is not supported on HSM-backed certificates`
  });
};

const trimLeadingZeros = (b: Buffer): Buffer => {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0x00) i += 1;
  return b.subarray(i);
};

// ASN.1 INTEGER requires a leading 0x00 byte when the high bit is set; otherwise the value
// reads as negative. The bitwise check inspects the sign bit on a Buffer byte.
// eslint-disable-next-line no-bitwise
const needsAsnSignPad = (b: Buffer): boolean => b.length > 0 && (b[0] & 0x80) !== 0;

export const ecdsaRawRsToDer = (raw: Buffer): Buffer => {
  if (raw.length % 2 !== 0) {
    throw new BadRequestError({ message: `Unexpected ECDSA signature length: ${raw.length}` });
  }
  const half = raw.length / 2;
  const r = trimLeadingZeros(raw.subarray(0, half));
  const s = trimLeadingZeros(raw.subarray(half));
  const rPadded = needsAsnSignPad(r) ? Buffer.concat([Buffer.from([0x00]), r]) : r;
  const sPadded = needsAsnSignPad(s) ? Buffer.concat([Buffer.from([0x00]), s]) : s;
  const rTlv = Buffer.concat([Buffer.from([0x02, rPadded.length]), rPadded]);
  const sTlv = Buffer.concat([Buffer.from([0x02, sPadded.length]), sPadded]);
  const seqBody = Buffer.concat([rTlv, sTlv]);
  return Buffer.concat([Buffer.from([0x30, seqBody.length]), seqBody]);
};

export const bufferToArrayBuffer = (buf: Buffer): ArrayBuffer => {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
};
