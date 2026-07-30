import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError } from "@app/lib/errors";

// The string values are the contract; keep them in sync with the gateway's switch.
export enum Pkcs11Mechanism {
  RsaPkcs = "CKM_RSA_PKCS",
  Sha256RsaPkcs = "CKM_SHA256_RSA_PKCS",
  Sha384RsaPkcs = "CKM_SHA384_RSA_PKCS",
  Sha512RsaPkcs = "CKM_SHA512_RSA_PKCS",
  Ecdsa = "CKM_ECDSA",
  EcdsaSha256 = "CKM_ECDSA_SHA256",
  EcdsaSha384 = "CKM_ECDSA_SHA384"
}

export type Pkcs11SigningMechanism = {
  mechanism: Pkcs11Mechanism;
  // ECDSA mechanisms return raw r||s; caller must convert to DER before X.509 use.
  isEcdsa: boolean;
};

export const mapSigningAlgorithmToPkcs11Mechanism = (
  algorithm: SigningAlgorithm,
  isDigest: boolean
): Pkcs11SigningMechanism => {
  if (isDigest) {
    if (algorithm.startsWith("RSASSA_PKCS1")) return { mechanism: Pkcs11Mechanism.RsaPkcs, isEcdsa: false };
    if (algorithm.startsWith("ECDSA_SHA_")) return { mechanism: Pkcs11Mechanism.Ecdsa, isEcdsa: true };
  } else {
    switch (algorithm) {
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256:
        return { mechanism: Pkcs11Mechanism.Sha256RsaPkcs, isEcdsa: false };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384:
        return { mechanism: Pkcs11Mechanism.Sha384RsaPkcs, isEcdsa: false };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512:
        return { mechanism: Pkcs11Mechanism.Sha512RsaPkcs, isEcdsa: false };
      case SigningAlgorithm.ECDSA_SHA_256:
        return { mechanism: Pkcs11Mechanism.EcdsaSha256, isEcdsa: true };
      case SigningAlgorithm.ECDSA_SHA_384:
        return { mechanism: Pkcs11Mechanism.EcdsaSha384, isEcdsa: true };
      default:
        break;
    }
  }
  throw new BadRequestError({
    message: `Signing algorithm ${algorithm} is not supported on HSM-backed certificates`
  });
};

const SHA256_DIGEST_LENGTH = 32;
const SHA384_DIGEST_LENGTH = 48;
const SHA512_DIGEST_LENGTH = 64;

const SHA256_DIGEST_INFO_PREFIX = Buffer.from("3031300d060960864801650304020105000420", "hex");
const SHA384_DIGEST_INFO_PREFIX = Buffer.from("3041300d060960864801650304020205000430", "hex");
const SHA512_DIGEST_INFO_PREFIX = Buffer.from("3051300d060960864801650304020305000440", "hex");

const RSA_PKCS1_DIGEST_INFO: Partial<Record<SigningAlgorithm, { prefix: Buffer; digestLength: number }>> = {
  [SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256]: {
    prefix: SHA256_DIGEST_INFO_PREFIX,
    digestLength: SHA256_DIGEST_LENGTH
  },
  [SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384]: {
    prefix: SHA384_DIGEST_INFO_PREFIX,
    digestLength: SHA384_DIGEST_LENGTH
  },
  [SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512]: {
    prefix: SHA512_DIGEST_INFO_PREFIX,
    digestLength: SHA512_DIGEST_LENGTH
  }
};

export const wrapRsaPkcs1DigestInfo = (algorithm: SigningAlgorithm, digest: Buffer): Buffer => {
  const info = RSA_PKCS1_DIGEST_INFO[algorithm];
  if (!info) {
    throw new BadRequestError({ message: `Pre-hashed signing is not supported for algorithm ${algorithm}` });
  }
  if (digest.length !== info.digestLength) {
    throw new BadRequestError({
      message: `Digest length ${digest.length} does not match ${algorithm} (expected ${info.digestLength} bytes). Ensure the data was hashed with the matching algorithm.`
    });
  }
  return Buffer.concat([info.prefix, digest]);
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
