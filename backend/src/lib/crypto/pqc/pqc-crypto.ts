import { ml_dsa44, ml_dsa65, ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import {
  slh_dsa_sha2_128f,
  slh_dsa_sha2_128s,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_192s,
  slh_dsa_sha2_256f,
  slh_dsa_sha2_256s,
  slh_dsa_shake_128f,
  slh_dsa_shake_128s,
  slh_dsa_shake_192f,
  slh_dsa_shake_192s,
  slh_dsa_shake_256f,
  slh_dsa_shake_256s
} from "@noble/post-quantum/slh-dsa.js";
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive deps of @peculiar/x509
import { PrivateKeyInfo } from "@peculiar/asn1-pkcs8";
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive dep of @peculiar/x509
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive dep of @peculiar/x509
import { AlgorithmIdentifier, SubjectPublicKeyInfo } from "@peculiar/asn1-x509";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { isPqcAlgorithm, pqcNameToOid, pqcOidToName } from "./pqc-utils";

type PqcSignImpl = {
  keygen: () => { publicKey: Uint8Array; secretKey: Uint8Array };
  sign: (msg: Uint8Array, sk: Uint8Array) => Uint8Array;
  verify: (sig: Uint8Array, msg: Uint8Array, pk: Uint8Array) => boolean;
  getPublicKey: (sk: Uint8Array) => Uint8Array;
};

const PQC_IMPLS: Record<string, PqcSignImpl> = {
  [CertKeyAlgorithm.ML_DSA_44]: ml_dsa44,
  [CertKeyAlgorithm.ML_DSA_65]: ml_dsa65,
  [CertKeyAlgorithm.ML_DSA_87]: ml_dsa87,
  [CertKeyAlgorithm.SLH_DSA_SHA2_128F]: slh_dsa_sha2_128f,
  [CertKeyAlgorithm.SLH_DSA_SHA2_128S]: slh_dsa_sha2_128s,
  [CertKeyAlgorithm.SLH_DSA_SHA2_192F]: slh_dsa_sha2_192f,
  [CertKeyAlgorithm.SLH_DSA_SHA2_192S]: slh_dsa_sha2_192s,
  [CertKeyAlgorithm.SLH_DSA_SHA2_256F]: slh_dsa_sha2_256f,
  [CertKeyAlgorithm.SLH_DSA_SHA2_256S]: slh_dsa_sha2_256s,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_128F]: slh_dsa_shake_128f,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_128S]: slh_dsa_shake_128s,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_192F]: slh_dsa_shake_192f,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_192S]: slh_dsa_shake_192s,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_256F]: slh_dsa_shake_256f,
  [CertKeyAlgorithm.SLH_DSA_SHAKE_256S]: slh_dsa_shake_256s
};

const getImpl = (name: string): PqcSignImpl => {
  const impl = PQC_IMPLS[name];
  if (!impl) throw new Error(`Unknown PQC algorithm variant: ${name}`);
  return impl;
};

const encodePkcs8 = (oid: string, rawPrivateKey: Uint8Array): Buffer => {
  const pkcs8 = new PrivateKeyInfo({
    version: 0,
    privateKeyAlgorithm: new AlgorithmIdentifier({ algorithm: oid }),
    privateKey: new OctetString(rawPrivateKey)
  });
  return Buffer.from(AsnConvert.serialize(pkcs8));
};

const encodeSpki = (oid: string, rawPublicKey: Uint8Array): Buffer => {
  const spki = new SubjectPublicKeyInfo({
    algorithm: new AlgorithmIdentifier({ algorithm: oid }),
    subjectPublicKey: rawPublicKey
  });
  return Buffer.from(AsnConvert.serialize(spki));
};

const extractRawKeyFromPkcs8 = (der: Buffer): Buffer => {
  const parsed = AsnConvert.parse(der, PrivateKeyInfo);
  const raw = Buffer.from(parsed.privateKey.buffer);
  // Handle keys stored with double OCTET STRING wrapping (legacy encoding)
  if (raw[0] === 0x04) {
    try {
      return Buffer.from(AsnConvert.parse(raw, OctetString).buffer);
    } catch {
      // Not actually double-wrapped — use raw bytes directly
    }
  }
  return raw;
};

const extractRawKeyFromSpki = (der: Buffer): Buffer => {
  const parsed = AsnConvert.parse(der, SubjectPublicKeyInfo);
  return Buffer.from(parsed.subjectPublicKey);
};

const getOidFromSpki = (der: Buffer): string => {
  try {
    return AsnConvert.parse(der, SubjectPublicKeyInfo).algorithm.algorithm;
  } catch {
    return "";
  }
};

const checkSpkiForPqcOid = (der: Buffer): boolean => {
  return pqcOidToName(getOidFromSpki(der)) !== null;
};

const OID_TO_WEBCRYPTO: Record<string, Algorithm | RsaHashedImportParams | EcKeyImportParams> = {
  "1.2.840.113549.1.1.1": { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as RsaHashedImportParams,
  "1.2.840.10045.3.1.7": { name: "ECDSA", namedCurve: "P-256" } as EcKeyImportParams,
  "1.3.132.0.34": { name: "ECDSA", namedCurve: "P-384" } as EcKeyImportParams,
  "1.3.132.0.35": { name: "ECDSA", namedCurve: "P-521" } as EcKeyImportParams
};

const detectAlgorithmFromSpki = (der: Buffer): Algorithm | RsaHashedImportParams | EcKeyImportParams => {
  return (
    OID_TO_WEBCRYPTO[getOidFromSpki(der)] || ({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as RsaHashedImportParams)
  );
};

class PqcCryptoKey implements CryptoKey {
  public readonly algorithm: KeyAlgorithm;

  public readonly extractable: boolean;

  public readonly type: KeyType;

  public readonly usages: KeyUsage[];

  constructor(
    public readonly rawKey: Uint8Array,
    algorithmName: string,
    keyType: KeyType,
    usages: KeyUsage[]
  ) {
    this.algorithm = { name: algorithmName };
    this.extractable = true;
    this.type = keyType;
    this.usages = usages;
  }
}

const isPqcCryptoKey = (key: CryptoKey): key is PqcCryptoKey => {
  return key instanceof PqcCryptoKey;
};

const detectPqcVariantFromDer = (der: Buffer): string | null => {
  try {
    let oid: string;
    try {
      oid = AsnConvert.parse(der, SubjectPublicKeyInfo).algorithm.algorithm;
    } catch {
      oid = AsnConvert.parse(der, PrivateKeyInfo).privateKeyAlgorithm.algorithm;
    }
    return pqcOidToName(oid);
  } catch {
    return null;
  }
};

const ML_DSA_PUBLIC_KEY_SIZES: Record<number, string> = {
  1312: CertKeyAlgorithm.ML_DSA_44,
  1952: CertKeyAlgorithm.ML_DSA_65,
  2592: CertKeyAlgorithm.ML_DSA_87
};

const ML_DSA_PRIVATE_KEY_SIZES: Record<number, string> = {
  2560: CertKeyAlgorithm.ML_DSA_44,
  4032: CertKeyAlgorithm.ML_DSA_65,
  4896: CertKeyAlgorithm.ML_DSA_87
};

// ML-DSA only fallback; SLH-DSA SHA2/SHAKE share key sizes so OID detection is preferred
const detectPqcVariantFromKeySize = (byteLength: number, keyType: "public" | "private"): string | null => {
  return (keyType === "public" ? ML_DSA_PUBLIC_KEY_SIZES : ML_DSA_PRIVATE_KEY_SIZES)[byteLength] || null;
};

const toUint8Array = (data: BufferSource): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveAlgName = (algorithm: any): string =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  typeof algorithm === "string" ? algorithm : (algorithm.name as string);

const pqcGenerateKey = (algName: string): CryptoKeyPair => {
  const kp = getImpl(algName).keygen();
  return {
    publicKey: new PqcCryptoKey(kp.publicKey, algName, "public", ["verify"]),
    privateKey: new PqcCryptoKey(kp.secretKey, algName, "private", ["sign"])
  } as CryptoKeyPair;
};

const pqcSign = (key: PqcCryptoKey, data: BufferSource): ArrayBuffer => {
  const sig = getImpl(key.algorithm.name).sign(toUint8Array(data), key.rawKey);
  return sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength);
};

const pqcVerify = (key: PqcCryptoKey, signature: BufferSource, data: BufferSource): boolean => {
  return getImpl(key.algorithm.name).verify(toUint8Array(signature), toUint8Array(data), key.rawKey);
};

const pqcImportKey = (
  format: KeyFormat,
  keyData: BufferSource,
  algName: string,
  keyUsages: KeyUsage[]
): PqcCryptoKey => {
  const derBuf = Buffer.from(keyData as ArrayBuffer);
  const isPrivate = keyUsages.includes("sign");

  if (format === "pkcs8" && isPrivate) {
    const rawKey = extractRawKeyFromPkcs8(derBuf);
    const actualAlg =
      detectPqcVariantFromDer(derBuf) || detectPqcVariantFromKeySize(rawKey.length, "private") || algName;
    return new PqcCryptoKey(rawKey, actualAlg, "private", keyUsages);
  }

  if (format === "spki" && !isPrivate) {
    const rawKey = extractRawKeyFromSpki(derBuf);
    const actualAlg =
      detectPqcVariantFromDer(derBuf) || detectPqcVariantFromKeySize(rawKey.length, "public") || algName;
    return new PqcCryptoKey(rawKey, actualAlg, "public", keyUsages);
  }

  throw new Error(`Unsupported PQC import format: ${format}`);
};

// Proxy that intercepts PQC operations and delegates classical ones to native WebCrypto.
// Parameters typed as `unknown` because @peculiar/asn1-x509 AlgorithmIdentifier !== DOM AlgorithmIdentifier.
export const createPqcCrypto = (): Crypto => {
  const defaultSubtle = globalThis.crypto.subtle;

  const subtle = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async generateKey(algorithm: unknown, extractable: boolean, keyUsages: KeyUsage[]): Promise<any> {
      const algName = resolveAlgName(algorithm);
      if (isPqcAlgorithm(algName)) return pqcGenerateKey(algName);
      return defaultSubtle.generateKey(algorithm as RsaHashedKeyGenParams, extractable, keyUsages);
    },

    async sign(algorithm: unknown, key: CryptoKey, data: BufferSource) {
      if (isPqcCryptoKey(key)) return pqcSign(key, data);
      const algName = resolveAlgName(algorithm);
      const effectiveAlg = isPqcAlgorithm(algName) ? key.algorithm : (algorithm as Algorithm);
      return defaultSubtle.sign(effectiveAlg, key, data);
    },

    async verify(algorithm: unknown, key: CryptoKey, signature: BufferSource, data: BufferSource) {
      if (isPqcCryptoKey(key)) return pqcVerify(key, signature, data);
      const algName = resolveAlgName(algorithm);
      const effectiveAlg = isPqcAlgorithm(algName) ? key.algorithm : (algorithm as Algorithm);
      return defaultSubtle.verify(effectiveAlg, key, signature, data);
    },

    async importKey(
      format: "pkcs8" | "spki" | "raw" | "jwk",
      keyData: BufferSource | JsonWebKey,
      algorithm: unknown,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) {
      const algName = resolveAlgName(algorithm);

      if (isPqcAlgorithm(algName)) {
        if (format === "spki" && !checkSpkiForPqcOid(Buffer.from(keyData as ArrayBuffer))) {
          const realAlg = detectAlgorithmFromSpki(Buffer.from(keyData as ArrayBuffer));
          return defaultSubtle.importKey(format, keyData as ArrayBuffer, realAlg, extractable, keyUsages);
        }
        return pqcImportKey(format, keyData as BufferSource, algName, keyUsages);
      }

      return defaultSubtle.importKey(
        format as "pkcs8",
        keyData as ArrayBuffer,
        algorithm as RsaHashedImportParams,
        extractable,
        keyUsages
      );
    },

    async exportKey(format: "pkcs8" | "spki" | "raw" | "jwk", key: CryptoKey) {
      if (isPqcCryptoKey(key)) {
        const oid = pqcNameToOid(key.algorithm.name);
        if (!oid) throw new Error(`Unknown PQC OID for ${key.algorithm.name}`);

        if (format === "pkcs8" && key.type === "private") {
          const der = encodePkcs8(oid, key.rawKey);
          return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
        }
        if (format === "spki" && key.type === "public") {
          const der = encodeSpki(oid, key.rawKey);
          return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
        }
        throw new Error(`Unsupported PQC export: format=${format}, keyType=${key.type}`);
      }

      return defaultSubtle.exportKey(format, key);
    },

    async digest(algorithm: unknown, data: BufferSource) {
      return defaultSubtle.digest(algorithm as Algorithm, data);
    },

    async encrypt(algorithm: unknown, key: CryptoKey, data: BufferSource) {
      return defaultSubtle.encrypt(algorithm as AesGcmParams, key, data);
    },

    async decrypt(algorithm: unknown, key: CryptoKey, data: BufferSource) {
      return defaultSubtle.decrypt(algorithm as AesGcmParams, key, data);
    },

    async deriveBits(algorithm: unknown, baseKey: CryptoKey, length: number) {
      return defaultSubtle.deriveBits(algorithm as EcdhKeyDeriveParams, baseKey, length);
    },

    async deriveKey(
      algorithm: unknown,
      baseKey: CryptoKey,
      derivedKeyType: unknown,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) {
      return defaultSubtle.deriveKey(
        algorithm as EcdhKeyDeriveParams,
        baseKey,
        derivedKeyType as AesDerivedKeyParams,
        extractable,
        keyUsages
      );
    },

    async wrapKey(format: KeyFormat, key: CryptoKey, wrappingKey: CryptoKey, wrapAlgorithm: unknown) {
      return defaultSubtle.wrapKey(format, key, wrappingKey, wrapAlgorithm as RsaOaepParams);
    },

    async unwrapKey(
      format: KeyFormat,
      wrappedKey: BufferSource,
      unwrappingKey: CryptoKey,
      unwrapAlgorithm: unknown,
      unwrappedKeyAlgorithm: unknown,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) {
      return defaultSubtle.unwrapKey(
        format,
        wrappedKey,
        unwrappingKey,
        unwrapAlgorithm as RsaOaepParams,
        unwrappedKeyAlgorithm as RsaHashedImportParams,
        extractable,
        keyUsages
      );
    }
  };

  return {
    subtle: subtle as unknown as SubtleCrypto,
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    randomUUID: globalThis.crypto.randomUUID.bind(globalThis.crypto)
  } as Crypto;
};

const derivePublicKeyFromSecret = (algName: string, secretKey: Uint8Array): Uint8Array => {
  return getImpl(algName).getPublicKey(secretKey);
};

export { derivePublicKeyFromSecret, isPqcCryptoKey, PqcCryptoKey };
