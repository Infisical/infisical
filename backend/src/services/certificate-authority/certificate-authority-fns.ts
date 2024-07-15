import * as x509 from "@peculiar/x509";
import crypto from "crypto";

import { BadRequestError } from "@app/lib/errors";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import { TDNParts, TGetCaCertChainDTO, TGetCaCredentialsDTO, TRebuildCaCrlDTO } from "./certificate-authority-types";

export const createDistinguishedName = (parts: TDNParts) => {
  const dnParts = [];
  if (parts.country) dnParts.push(`C=${parts.country}`);
  if (parts.organization) dnParts.push(`O=${parts.organization}`);
  if (parts.ou) dnParts.push(`OU=${parts.ou}`);
  if (parts.province) dnParts.push(`ST=${parts.province}`);
  if (parts.commonName) dnParts.push(`CN=${parts.commonName}`);
  if (parts.locality) dnParts.push(`L=${parts.locality}`);
  return dnParts.join(", ");
};

export const keyAlgorithmToAlgCfg = (keyAlgorithm: CertKeyAlgorithm) => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.RSA_4096:
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 4096
      };
    case CertKeyAlgorithm.ECDSA_P256:
      return {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: "SHA-256"
      };
    case CertKeyAlgorithm.ECDSA_P384:
      return {
        name: "ECDSA",
        namedCurve: "P-384",
        hash: "SHA-384"
      };
    default: {
      // RSA_2048
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048
      };
    }
  }
};

/**
 * Return the public and private key of CA with id [caId]
 * Note: credentials are returned as crypto.webcrypto.CryptoKey
 * suitable for use with @peculiar/x509 module
 */
export const getCaCredentials = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  projectDAL,
  kmsService
}: TGetCaCredentialsDTO) => {
  const ca = await certificateAuthorityDAL.findById(caId);
  if (!ca) throw new BadRequestError({ message: "CA not found" });

  const caSecret = await certificateAuthoritySecretDAL.findOne({ caId });
  if (!caSecret) throw new BadRequestError({ message: "CA secret not found" });

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });
  const decryptedPrivateKey = kmsDecryptor({
    cipherTextBlob: caSecret.encryptedPrivateKey
  });

  const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);
  const skObj = crypto.createPrivateKey({ key: decryptedPrivateKey, format: "der", type: "pkcs8" });
  const caPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    skObj.export({ format: "der", type: "pkcs8" }),
    alg,
    true,
    ["sign"]
  );

  const pkObj = crypto.createPublicKey(skObj);
  const caPublicKey = await crypto.subtle.importKey("spki", pkObj.export({ format: "der", type: "spki" }), alg, true, [
    "verify"
  ]);

  return {
    caPrivateKey,
    caPublicKey
  };
};

/**
 * Return the decrypted pem-encoded certificate and certificate chain
 * for CA with id [caId].
 */
export const getCaCertChain = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  projectDAL,
  kmsService
}: TGetCaCertChainDTO) => {
  const ca = await certificateAuthorityDAL.findById(caId);
  if (!ca) throw new BadRequestError({ message: "CA not found" });

  const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });

  const decryptedCaCert = kmsDecryptor({
    cipherTextBlob: caCert.encryptedCertificate
  });

  const caCertObj = new x509.X509Certificate(decryptedCaCert);

  const decryptedChain = kmsDecryptor({
    cipherTextBlob: caCert.encryptedCertificateChain
  });

  return {
    caCert: caCertObj.toString("pem"),
    caCertChain: decryptedChain.toString("utf-8"),
    serialNumber: caCertObj.serialNumber
  };
};

/**
 * Rebuilds the certificate revocation list (CRL)
 * for CA with id [caId]
 */
export const rebuildCaCrl = async ({
  caId,
  certificateAuthorityDAL,
  certificateAuthorityCrlDAL,
  certificateAuthoritySecretDAL,
  projectDAL,
  certificateDAL,
  kmsService
}: TRebuildCaCrlDTO) => {
  const ca = await certificateAuthorityDAL.findById(caId);
  if (!ca) throw new BadRequestError({ message: "CA not found" });

  const caSecret = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

  const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

  const keyId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: keyId
  });

  const privateKey = kmsDecryptor({
    cipherTextBlob: caSecret.encryptedPrivateKey
  });

  const skObj = crypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
  const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
    "sign"
  ]);

  const revokedCerts = await certificateDAL.find({
    caId: ca.id,
    status: CertStatus.REVOKED
  });

  const crl = await x509.X509CrlGenerator.create({
    issuer: ca.dn,
    thisUpdate: new Date(),
    nextUpdate: new Date("2025/12/12"),
    entries: revokedCerts.map((revokedCert) => {
      return {
        serialNumber: revokedCert.serialNumber,
        revocationDate: new Date(revokedCert.revokedAt as Date),
        reason: revokedCert.revocationReason as number,
        invalidity: new Date("2022/01/01"),
        issuer: ca.dn
      };
    }),
    signingAlgorithm: alg,
    signingKey: sk
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({
    kmsId: keyId
  });
  const { cipherTextBlob: encryptedCrl } = kmsEncryptor({
    plainText: Buffer.from(new Uint8Array(crl.rawData))
  });

  await certificateAuthorityCrlDAL.update(
    {
      caId: ca.id
    },
    {
      encryptedCrl
    }
  );
};
