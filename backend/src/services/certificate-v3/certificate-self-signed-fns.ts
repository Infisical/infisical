import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractCertificateFields } from "@app/services/certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { CertKeyAlgorithm, CertSignatureAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { TResolvedCustomExtension } from "../certificate-common/certificate-extension-fns";
import { generateSelfSignedCertificate } from "../certificate-common/certificate-issuance-utils";
import {
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy
} from "../certificate-common/certificate-utils";
import { TSubjectRule } from "../certificate-policy/certificate-policy-types";

type TSelfSignedCertificateRequest = {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  domainComponents?: string[];
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
  altNames?: Array<{ type: CertSubjectAlternativeNameType; value: string }>;
  validity: { ttl: string };
  notBefore?: Date;
  notAfter?: Date;
};

type TEffectiveAlgorithms = {
  signatureAlgorithm: CertSignatureAlgorithm;
  keyAlgorithm: CertKeyAlgorithm;
};

export type TPreparedSelfSignedCertificate = {
  selfSignedResult: Awaited<ReturnType<typeof generateSelfSignedCertificate>>;
  encryptedCertificate: Buffer;
  encryptedPrivateKey: Buffer;
};

// Generates and encrypts the certificate before the caller opens its transaction: KMS Core is never called inside one.
export const prepareSelfSignedCertificate = async ({
  certificateRequest,
  policy,
  projectId,
  effectiveAlgorithms,
  kmsCoreDomain,
  existingKeyPair,
  customExtensions
}: {
  certificateRequest: TSelfSignedCertificateRequest;
  policy?: {
    subject?: TSubjectRule[];
    sans?: Array<{
      type: string;
      allowed?: string[];
      required?: string[];
      denied?: string[];
    }>;
  } | null;
  projectId: string;
  effectiveAlgorithms: TEffectiveAlgorithms;
  kmsCoreDomain: TKmsCoreDomain;
  existingKeyPair?: CryptoKeyPair;
  customExtensions?: TResolvedCustomExtension[];
}): Promise<TPreparedSelfSignedCertificate> => {
  const selfSignedResult = await generateSelfSignedCertificate({
    certificateRequest,
    policy,
    effectiveSignatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
    effectiveKeyAlgorithm: effectiveAlgorithms.keyAlgorithm,
    existingKeyPair,
    customExtensions
  });

  const certificateManagerKeyId = await kmsCoreDomain.getProjectCertificateKmsKeyId(projectId);
  const kmsEncryptor = await kmsCoreDomain.encryptWithKmsKey({ kmsId: certificateManagerKeyId });
  const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({ plainText: selfSignedResult.certificate });
  const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({ plainText: selfSignedResult.privateKey });

  return { selfSignedResult, encryptedCertificate, encryptedPrivateKey };
};

export const persistSelfSignedCertificate = async ({
  prepared,
  certificateRequest,
  profile,
  originalCert,
  effectiveAlgorithms,
  customExtensions,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  tx,
  isRenewal = false
}: {
  prepared: TPreparedSelfSignedCertificate;
  certificateRequest: Pick<TSelfSignedCertificateRequest, "commonName" | "keyUsages" | "extendedKeyUsages">;
  profile?: { id: string; projectId: string } | null;
  originalCert?: {
    id: string;
    friendlyName?: string | null;
    commonName?: string | null;
    projectId: string;
  };
  effectiveAlgorithms: TEffectiveAlgorithms;
  customExtensions?: TResolvedCustomExtension[];
  certificateDAL: Pick<TCertificateDALFactory, "create">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  tx: Parameters<TCertificateDALFactory["create"]>[1];
  isRenewal?: boolean;
}) => {
  const { selfSignedResult } = prepared;
  const projectId = originalCert?.projectId || profile?.projectId;
  if (!projectId) {
    throw new BadRequestError({ message: "Project ID is required for certificate creation" });
  }

  const subjectCommonName =
    (selfSignedResult.certificateSubject.common_name as string) ||
    certificateRequest.commonName ||
    originalCert?.commonName ||
    "";

  const certificateData = await certificateDAL.create(
    {
      serialNumber: selfSignedResult.serialNumber,
      friendlyName: originalCert?.friendlyName || subjectCommonName,
      commonName: subjectCommonName,
      altNames: selfSignedResult.subjectAlternativeNames.map((san) => san.value).join(","),
      status: CertStatus.ACTIVE,
      notBefore: selfSignedResult.notBefore,
      notAfter: selfSignedResult.notAfter,
      projectId,
      keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || [],
      extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || [],
      profileId: profile?.id || null,
      ...(isRenewal && originalCert ? { renewedFromCertificateId: originalCert.id } : {}),
      ...extractCertificateFields(selfSignedResult.certificate, customExtensions),
      signatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
      keyAlgorithm: effectiveAlgorithms.keyAlgorithm
    },
    tx
  );

  await certificateBodyDAL.create(
    { certId: certificateData.id, encryptedCertificate: prepared.encryptedCertificate },
    tx
  );
  await certificateSecretDAL.create(
    { certId: certificateData.id, encryptedPrivateKey: prepared.encryptedPrivateKey },
    tx
  );

  return { selfSignedResult, certificateData };
};
