import { CertificationRequest } from "@peculiar/asn1-csr";
import { AsnConvert } from "@peculiar/asn1-schema";
import { Certificate, CertificateList } from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto/cryptography";
import { ecdsaRawRsToDer } from "@app/lib/csr/pkcs11-algorithm-map";
import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

// @peculiar/x509's generators require a local CryptoKey, so for HSM-backed CAs we build the
// structure with a throwaway key of the matching algorithm, then swap in a signature the HSM
// produces over the TBS bytes (same pattern as build-csr-with-external-signer).

type TCertCreateParams = Parameters<typeof x509.X509CertificateGenerator.create>[0];
type TCsrCreateParams = Parameters<typeof x509.Pkcs10CertificateRequestGenerator.create>[0];
type TCrlCreateParams = Parameters<typeof x509.X509CrlGenerator.create>[0];

export type TCaCertificateParams = Omit<TCertCreateParams, "signingKey" | "signingAlgorithm">;
export type TCaCsrParams = Omit<TCsrCreateParams, "keys" | "signingAlgorithm">;
export type TCaCrlParams = Omit<TCrlCreateParams, "signingKey" | "signingAlgorithm">;

export type TCaSigner = {
  caPublicKey: CryptoKey;
  signingAlgorithm: Algorithm;
  createCertificate: (params: TCaCertificateParams) => Promise<x509.X509Certificate>;
  createCsr: (params: TCaCsrParams) => Promise<x509.Pkcs10CertificateRequest>;
  createCrl: (params: TCaCrlParams) => Promise<x509.X509Crl>;
};

export type TCaExternalSignFn = (tbs: Buffer, mechanism: string, isDigest: boolean) => Promise<Buffer>;

type TCaHsmShape = {
  hsmKeyAlgorithm: HsmKeyAlgorithm;
  mechanism: string;
  isEcdsa: boolean;
  signingAlgorithm: Algorithm;
  keyGenParams: RsaHashedKeyGenParams | EcKeyGenParams;
  importParams: RsaHashedImportParams | EcKeyImportParams;
};

const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);

export const caKeyAlgorithmToHsmShape = (keyAlgorithm: CertKeyAlgorithm | string): TCaHsmShape => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.RSA_2048:
      return {
        hsmKeyAlgorithm: HsmKeyAlgorithm.RSA_2048,
        mechanism: "CKM_SHA256_RSA_PKCS",
        isEcdsa: false,
        signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as Algorithm,
        keyGenParams: {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
          publicExponent: RSA_PUBLIC_EXPONENT,
          modulusLength: 2048
        },
        importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      };
    case CertKeyAlgorithm.RSA_4096:
      // SHA-256 (not SHA-384) to match keyAlgorithmToAlgCfg, so RSA_4096 signs identically to local CAs.
      return {
        hsmKeyAlgorithm: HsmKeyAlgorithm.RSA_4096,
        mechanism: "CKM_SHA256_RSA_PKCS",
        isEcdsa: false,
        signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as Algorithm,
        keyGenParams: {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
          publicExponent: RSA_PUBLIC_EXPONENT,
          modulusLength: 4096
        },
        importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      };
    case CertKeyAlgorithm.ECDSA_P256:
      return {
        hsmKeyAlgorithm: HsmKeyAlgorithm.ECC_P256,
        mechanism: "CKM_ECDSA_SHA256",
        isEcdsa: true,
        signingAlgorithm: { name: "ECDSA", hash: "SHA-256" } as Algorithm,
        keyGenParams: { name: "ECDSA", namedCurve: "P-256" },
        importParams: { name: "ECDSA", namedCurve: "P-256" }
      };
    case CertKeyAlgorithm.ECDSA_P384:
      return {
        hsmKeyAlgorithm: HsmKeyAlgorithm.ECC_P384,
        mechanism: "CKM_ECDSA_SHA384",
        isEcdsa: true,
        signingAlgorithm: { name: "ECDSA", hash: "SHA-384" } as Algorithm,
        keyGenParams: { name: "ECDSA", namedCurve: "P-384" },
        importParams: { name: "ECDSA", namedCurve: "P-384" }
      };
    default:
      throw new BadRequestError({
        message: `Key algorithm "${keyAlgorithm}" is not supported for HSM-backed certificate authorities.`
      });
  }
};

export const caKeyAlgorithmToHsmKeyAlgorithm = (keyAlgorithm: CertKeyAlgorithm | string): HsmKeyAlgorithm =>
  caKeyAlgorithmToHsmShape(keyAlgorithm).hsmKeyAlgorithm;

const bufferToArrayBuffer = (buf: Buffer): ArrayBuffer => {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
};

export const buildLocalCaSigner = ({
  privateKey,
  publicKey,
  signingAlgorithm
}: {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  signingAlgorithm: Algorithm;
}): TCaSigner => ({
  caPublicKey: publicKey,
  signingAlgorithm,
  createCertificate: (params) =>
    x509.X509CertificateGenerator.create({ ...params, signingKey: privateKey, signingAlgorithm }),
  createCsr: (params) =>
    x509.Pkcs10CertificateRequestGenerator.create({
      ...params,
      keys: { privateKey, publicKey },
      signingAlgorithm
    }),
  createCrl: (params) => x509.X509CrlGenerator.create({ ...params, signingKey: privateKey, signingAlgorithm })
});

export const buildHsmCaSigner = ({
  caPublicKey,
  keyAlgorithm,
  sign
}: {
  caPublicKey: CryptoKey;
  keyAlgorithm: CertKeyAlgorithm | string;
  sign: TCaExternalSignFn;
}): TCaSigner => {
  const shape = caKeyAlgorithmToHsmShape(keyAlgorithm);

  const signTbs = async (tbs: Buffer): Promise<ArrayBuffer> => {
    // isDigest=false: the HSM hashes via its *_SHA<NN>_* mechanism, so we hand it the raw TBS.
    let signature = await sign(tbs, shape.mechanism, false);
    if (shape.isEcdsa) signature = ecdsaRawRsToDer(signature);
    return bufferToArrayBuffer(signature);
  };

  const generateEphemeralKey = () =>
    crypto.nativeCrypto.subtle.generateKey(shape.keyGenParams as RsaHashedKeyGenParams, true, ["sign", "verify"]);

  return {
    caPublicKey,
    signingAlgorithm: shape.signingAlgorithm,
    createCertificate: async (params) => {
      const ephemeral = await generateEphemeralKey();
      const built = await x509.X509CertificateGenerator.create({
        ...params,
        signingKey: ephemeral.privateKey,
        signingAlgorithm: shape.signingAlgorithm
      });
      const cert = AsnConvert.parse(built.rawData, Certificate);
      cert.signatureValue = await signTbs(Buffer.from(AsnConvert.serialize(cert.tbsCertificate)));
      return new x509.X509Certificate(AsnConvert.serialize(cert));
    },
    createCsr: async (params) => {
      const ephemeral = await generateEphemeralKey();
      const built = await x509.Pkcs10CertificateRequestGenerator.create({
        ...params,
        keys: { privateKey: ephemeral.privateKey, publicKey: caPublicKey },
        signingAlgorithm: shape.signingAlgorithm
      });
      const csr = AsnConvert.parse(built.rawData, CertificationRequest);
      csr.signature = await signTbs(Buffer.from(AsnConvert.serialize(csr.certificationRequestInfo)));
      return new x509.Pkcs10CertificateRequest(AsnConvert.serialize(csr));
    },
    createCrl: async (params) => {
      const ephemeral = await generateEphemeralKey();
      const built = await x509.X509CrlGenerator.create({
        ...params,
        signingKey: ephemeral.privateKey,
        signingAlgorithm: shape.signingAlgorithm
      });
      const crl = AsnConvert.parse(built.rawData, CertificateList);
      crl.signature = await signTbs(Buffer.from(AsnConvert.serialize(crl.tbsCertList)));
      return new x509.X509Crl(AsnConvert.serialize(crl));
    }
  };
};
