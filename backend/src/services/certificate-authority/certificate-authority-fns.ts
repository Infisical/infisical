import * as x509 from "@peculiar/x509";
import crypto from "crypto";

import { BadRequestError } from "@app/lib/errors";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import { TDNParts, TRebuildCaCrlDTO } from "./certificate-authority-types";

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

  const privateKey = await kmsService.decrypt({
    kmsId: keyId,
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

  const { cipherTextBlob: encryptedCrl } = await kmsService.encrypt({
    kmsId: keyId,
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
