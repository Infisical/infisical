/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";

import { crypto } from "@app/lib/crypto/cryptography";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm
} from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

type TIssueSignerCertificateDeps = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey">;
};

type TVerifyCodeSigningEkuDeps = {
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export const verifyCodeSigningEku = async (
  { certificateBodyDAL, projectDAL, kmsService }: TVerifyCodeSigningEkuDeps,
  { certificateId, projectId }: { certificateId: string; projectId: string }
): Promise<void> => {
  const certBody = await certificateBodyDAL.findOne({ certId: certificateId });
  if (!certBody?.encryptedCertificate) {
    throw new BadRequestError({
      message: "Cannot verify code-signing usage: certificate body is missing."
    });
  }

  const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
  const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId });
  const decrypted = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });
  const cert = new x509.X509Certificate(decrypted);

  const ekuExtension = cert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension | undefined;
  const hasCodeSigningEku =
    ekuExtension?.usages?.some(
      (oid) => CertExtendedKeyUsageOIDToName[oid as string] === CertExtendedKeyUsage.CODE_SIGNING
    ) ?? false;

  if (!hasCodeSigningEku) {
    throw new BadRequestError({
      message: "The issued certificate does not have the codeSigning extended key usage set."
    });
  }
};

type TIssueSignerCertificateInput = {
  caId: string;
  projectId: string;
  commonName: string;
  certificateTtlDays: number;
  keyAlgorithm?: CertKeyAlgorithm;
  tx?: Knex;
};

export const issueSignerCertificate = async (
  {
    certificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService
  }: TIssueSignerCertificateDeps,
  { caId, projectId, commonName, certificateTtlDays, keyAlgorithm, tx }: TIssueSignerCertificateInput
): Promise<{ certificateId: string }> => {
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
  if (!ca || ca.projectId !== projectId) {
    throw new BadRequestError({
      message: `Certificate authority '${caId}' is not in this project.`
    });
  }
  if (ca.status !== CaStatus.ACTIVE) {
    throw new BadRequestError({ message: "The selected certificate authority is not active." });
  }
  if (!ca.internalCa?.id) {
    throw new BadRequestError({
      message:
        "Issuing a signer certificate directly from an external Certificate Authority is not yet supported. " +
        "Issue a code-signing certificate through Certificate Manager first and attach it to the signer by ID."
    });
  }

  const caKeyAlgorithm = ca.internalCa.keyAlgorithm as CertKeyAlgorithm;
  if (isPqcAlgorithm(caKeyAlgorithm)) {
    throw new BadRequestError({
      message: "PQC certificate authorities cannot back code signers in this version."
    });
  }

  const leafKeyAlgorithm = keyAlgorithm ?? CertKeyAlgorithm.RSA_2048;
  if (isPqcAlgorithm(leafKeyAlgorithm)) {
    throw new BadRequestError({
      message: "PQC leaf key algorithms are not supported for code signers in this version."
    });
  }
  const alg = keyAlgorithmToAlgCfg(leafKeyAlgorithm);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg as any, true, ["sign", "verify"]);

  const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${commonName}`,
    keys: leafKeys,
    signingAlgorithm: alg,
    // eslint-disable-next-line no-bitwise
    extensions: [
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment
      )
    ]
  });
  const csrPem = csrObj.toString("pem");

  const signResult = await internalCertificateAuthorityService.signCertFromCa({
    isInternal: true,
    isFromProfile: true,
    caId: ca.id,
    csr: csrPem,
    commonName,
    ttl: `${certificateTtlDays}d`,
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
    tx
  });

  if (!signResult.certificateId) {
    throw new BadRequestError({ message: "Certificate authority did not return a certificate id." });
  }

  await verifyCodeSigningEku(
    { certificateBodyDAL, projectDAL, kmsService },
    { certificateId: signResult.certificateId, projectId: ca.projectId }
  );

  const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });

  const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
  const skLeafPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;
  const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
    plainText: Buffer.from(skLeafPem)
  });

  await certificateSecretDAL.create(
    {
      certId: signResult.certificateId,
      encryptedPrivateKey
    },
    tx
  );

  return { certificateId: signResult.certificateId };
};
