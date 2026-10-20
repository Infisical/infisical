import { BadRequestError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractCertificateFields } from "@app/services/certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { CertKeyAlgorithm, CertSignatureAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

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

const createSelfSignedCertificateRecord = async ({
  selfSignedResult,
  certificateRequest,
  profile,
  originalCert,
  customExtensions,
  certificateDAL,
  tx,
  isRenewal = false
}: {
  selfSignedResult: Awaited<ReturnType<typeof generateSelfSignedCertificate>>;
  customExtensions?: TResolvedCustomExtension[];
  certificateRequest: {
    commonName?: string;
    keyUsages?: CertKeyUsageType[];
    extendedKeyUsages?: CertExtendedKeyUsageType[];
  };
  profile?: { id: string; projectId: string } | null;
  originalCert?: {
    id: string;
    friendlyName?: string | null;
    commonName?: string | null;
    projectId: string;
  };
  certificateDAL: Pick<TCertificateDALFactory, "create" | "updateById">;
  tx: Parameters<TCertificateDALFactory["create"]>[1];
  isRenewal?: boolean;
}) => {
  const subjectCommonName =
    (selfSignedResult.certificateSubject.common_name as string) ||
    certificateRequest.commonName ||
    originalCert?.commonName ||
    "";

  const altNamesList = selfSignedResult.subjectAlternativeNames.map((san) => san.value).join(",");

  const projectId = originalCert?.projectId || profile?.projectId;
  if (!projectId) {
    throw new BadRequestError({ message: "Project ID is required for certificate creation" });
  }

  const baseRecord = {
    serialNumber: selfSignedResult.serialNumber,
    friendlyName: originalCert?.friendlyName || subjectCommonName,
    commonName: subjectCommonName,
    altNames: altNamesList,
    status: CertStatus.ACTIVE,
    notBefore: selfSignedResult.notBefore,
    notAfter: selfSignedResult.notAfter,
    projectId,
    keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || [],
    extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || [],
    profileId: profile?.id || null
  };

  const renewalRecord =
    isRenewal && originalCert
      ? {
          renewedFromCertificateId: originalCert.id
        }
      : {};

  const parsedFields = extractCertificateFields(selfSignedResult.certificate, customExtensions);

  return certificateDAL.create(
    {
      ...baseRecord,
      ...renewalRecord,
      ...parsedFields
    },
    tx
  );
};

const createEncryptedCertificateData = async ({
  certificateId,
  certificate,
  privateKey,
  projectId,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  tx
}: {
  certificateId: string;
  certificate: Buffer;
  privateKey: Buffer;
  projectId: string;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  projectDAL: TProjectDALFactory;
  tx: Parameters<TCertificateBodyDALFactory["create"]>[1];
}) => {
  const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
    projectId,
    projectDAL,
    kmsService
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKeyId });

  const encryptedCertificate = await kmsEncryptor({
    plainText: certificate
  });

  await certificateBodyDAL.create(
    {
      certId: certificateId,
      encryptedCertificate: encryptedCertificate.cipherTextBlob
    },
    tx
  );

  const encryptedPrivateKey = await kmsEncryptor({
    plainText: privateKey
  });

  await certificateSecretDAL.create(
    {
      certId: certificateId,
      encryptedPrivateKey: encryptedPrivateKey.cipherTextBlob
    },
    tx
  );
};

export const processSelfSignedCertificate = async ({
  certificateRequest,
  policy,
  profile,
  originalCert,
  effectiveAlgorithms,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  tx,
  isRenewal = false,
  existingKeyPair,
  customExtensions
}: {
  certificateRequest: {
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
  policy?: {
    subject?: TSubjectRule[];
    sans?: Array<{
      type: string;
      allowed?: string[];
      required?: string[];
      denied?: string[];
    }>;
  } | null;
  profile?: { id: string; projectId: string } | null;
  originalCert?: {
    id: string;
    friendlyName?: string | null;
    commonName?: string | null;
    projectId: string;
  };
  effectiveAlgorithms: {
    signatureAlgorithm: CertSignatureAlgorithm;
    keyAlgorithm: CertKeyAlgorithm;
  };
  certificateDAL: Pick<TCertificateDALFactory, "create" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  projectDAL: TProjectDALFactory;
  tx: Parameters<TCertificateDALFactory["create"]>[1];
  isRenewal?: boolean;
  existingKeyPair?: CryptoKeyPair;
  customExtensions?: TResolvedCustomExtension[];
}) => {
  const projectId = originalCert?.projectId || profile?.projectId;
  if (!projectId) {
    throw new BadRequestError({ message: "Project ID is required for certificate creation" });
  }

  const selfSignedResult = await generateSelfSignedCertificate({
    certificateRequest,
    policy,
    effectiveSignatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
    effectiveKeyAlgorithm: effectiveAlgorithms.keyAlgorithm,
    existingKeyPair,
    customExtensions
  });

  const certificateData = await createSelfSignedCertificateRecord({
    selfSignedResult,
    certificateRequest,
    profile,
    originalCert,
    customExtensions,
    certificateDAL,
    tx,
    isRenewal
  });

  await certificateDAL.updateById(
    certificateData.id,
    {
      signatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
      keyAlgorithm: effectiveAlgorithms.keyAlgorithm
    },
    tx
  );

  await createEncryptedCertificateData({
    certificateId: certificateData.id,
    certificate: selfSignedResult.certificate,
    privateKey: selfSignedResult.privateKey,
    projectId,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    tx
  });

  return {
    selfSignedResult,
    certificateData
  };
};
