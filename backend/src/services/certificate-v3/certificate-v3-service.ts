import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { randomUUID } from "crypto";
import RE2 from "re2";

import { ActionProjectType, TCertificates } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TPkiAcmeAccountDALFactory } from "@app/ee/services/pki-acme/pki-acme-account-dal";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { APPROVAL_POLICY_FACTORY_MAP } from "@app/services/approval-policy/approval-policy-factory";
import { TApprovalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import {
  TCertRequestPolicy,
  TCertRequestRequestData
} from "@app/services/approval-policy/cert-request/cert-request-policy-types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { extractCertificateFields } from "@app/services/certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm,
  CertStatus
} from "@app/services/certificate/certificate-types";
import {
  TCertificateAuthorityDALFactory,
  TCertificateAuthorityWithAssociatedCa
} from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  createDistinguishedName,
  parseDistinguishedName
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType, IssuerType } from "@app/services/certificate-profile/certificate-profile-types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  mapExtendedKeyUsageToLegacy,
  mapKeyUsageToLegacy,
  mapLegacyExtendedKeyUsageToStandard,
  mapLegacyKeyUsageToStandard
} from "../certificate-common/certificate-constants";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "../certificate-common/certificate-csr-utils";
import {
  calculateFinalRenewBeforeDays,
  detectSanType,
  extractCertificateFromBuffer,
  generateSelfSignedCertificate,
  getEffectiveAlgorithms,
  isValidRenewalTiming,
  validateAlgorithmCompatibility,
  validateCaSupport
} from "../certificate-common/certificate-issuance-utils";
import {
  bufferToString,
  buildCertificateSubjectFromTemplate,
  buildSubjectAlternativeNamesFromTemplate,
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy,
  mapEnumsForValidation,
  normalizeDateForApi,
  removeRootCaFromChain
} from "../certificate-common/certificate-utils";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { TCertificateRequestServiceFactory } from "../certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { addRenewedCertificateToSyncs, triggerAutoSyncForCertificate } from "../pki-sync/pki-sync-utils";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import {
  copyMetadataFromCertificate,
  insertMetadataForCertificate,
  insertMetadataForCertificateRequest
} from "../resource-metadata/resource-metadata-fns";
import { applyProfileDefaults, resolveEffectiveTtl } from "./certificate-v3-fns";
import {
  TCertificateIssuanceResponse,
  TDisableRenewalConfigDTO,
  TDisableRenewalResponse,
  TIssueCertificateFromProfileDTO,
  TOrderCertificateFromProfileDTO,
  TRenewalConfigResponse,
  TRenewCertificateDTO,
  TSignCertificateFromProfileDTO,
  TUpdateCertificateMetadataDTO,
  TUpdateRenewalConfigDTO
} from "./certificate-v3-types";

type TCertificateV3ServiceFactoryDep = {
  certificateDAL: Pick<
    TCertificateDALFactory,
    "findOne" | "findById" | "updateById" | "transaction" | "create" | "find"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "findByIdWithAssociatedCa" | "create" | "transaction" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs" | "findById">;
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById">;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateCertificateRequest" | "getPolicyById">;
  internalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findPkiSyncIdsByCertificateId" | "addCertificates" | "findByPkiSyncAndCertificate" | "updateSyncMetadata"
  >;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  kmsService: Pick<
    TKmsServiceFactory,
    "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
  projectDAL: TProjectDALFactory;
  certificateIssuanceQueue: Pick<
    import("../certificate-authority/certificate-issuance-queue").TCertificateIssuanceQueueFactory,
    "queueCertificateIssuance"
  >;
  certificateRequestService: Pick<TCertificateRequestServiceFactory, "createCertificateRequest">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId" | "findStepsByPolicyId">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById" | "create" | "transaction">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "createRequestFromPolicy">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete" | "find">;
};

export type TCertificateV3ServiceFactory = ReturnType<typeof certificateV3ServiceFactory>;

const validateProfileAndPermissions = async ({
  profileId,
  actor,
  actorId,
  actorAuthMethod,
  actorOrgId,
  certificateProfileDAL,
  acmeAccountDAL,
  permissionService,
  requiredEnrollmentType,
  isInternal = false
}: {
  profileId: string;
  actor?: ActorType;
  actorId?: string;
  actorAuthMethod?: ActorAuthMethod;
  actorOrgId?: string;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  requiredEnrollmentType: EnrollmentType;
  isInternal?: boolean;
}) => {
  const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
  if (!profile) {
    throw new NotFoundError({ message: "Certificate profile not found" });
  }

  if (profile.enrollmentType !== requiredEnrollmentType) {
    throw new ForbiddenRequestError({
      message: `Profile is not configured for ${requiredEnrollmentType} enrollment`
    });
  }

  if (isInternal) {
    return profile;
  }

  if (!actor || !actorId || !actorOrgId) {
    throw new BadRequestError({ message: "Actor is required" });
  }

  if (
    (actor === ActorType.ACME_ACCOUNT && requiredEnrollmentType === EnrollmentType.ACME) ||
    (actor === ActorType.EST_ACCOUNT && requiredEnrollmentType === EnrollmentType.EST)
  ) {
    const account = await acmeAccountDAL.findById(actorId);
    if (!account) {
      throw new NotFoundError({ message: "ACME account not found" });
    }
    if (account.profileId !== profile.id) {
      throw new ForbiddenRequestError({
        message: "ACME account is not associated with this profile"
      });
    }
    return profile;
  }

  const { permission } = await permissionService.getProjectPermission({
    actor,
    actorId,
    projectId: profile.projectId,
    actorAuthMethod: actorAuthMethod || null,
    actorOrgId,
    actionProjectType: ActionProjectType.CertificateManager
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionCertificateProfileActions.IssueCert,
    subject(ProjectPermissionSub.CertificateProfiles, {
      slug: profile.slug
    })
  );

  return profile;
};

const validateRenewalEligibility = (
  certificate: {
    id: string;
    status: string;
    notBefore: Date;
    notAfter: Date;
    revokedAt?: Date | null;
    renewedByCertificateId?: string | null;
    profileId?: string | null;
    caId?: string | null;
    pkiSubscriberId?: string | null;
  },
  ca: TCertificateAuthorityWithAssociatedCa
) => {
  const errors: string[] = [];

  if (certificate.status !== CertStatus.ACTIVE) {
    errors.push(`Certificate status is ${certificate.status}, must be ${CertStatus.ACTIVE}`);
  }

  const now = new Date();
  if (certificate.notAfter <= now) {
    errors.push("Certificate is already expired");
  }

  if (certificate.revokedAt) {
    errors.push("Certificate is revoked and cannot be renewed");
  }

  const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
  const isInternalCa = caType === CaType.INTERNAL;
  const isConnectedExternalCa = caType === CaType.ACME || caType === CaType.AZURE_AD_CS || caType === CaType.AWS_PCA;
  const isImportedCertificate = certificate.pkiSubscriberId != null && !certificate.profileId;

  if (!isInternalCa && !isConnectedExternalCa) {
    errors.push(`CA type ${String(caType)} does not support renewal`);
  }

  if (isImportedCertificate) {
    errors.push("Externally imported certificates cannot be renewed");
  }

  if (ca.status !== CaStatus.ACTIVE) {
    errors.push(`Certificate Authority is ${ca.status}, must be ${CaStatus.ACTIVE}`);
  }

  if (certificate.renewedByCertificateId) {
    errors.push("Certificate has already been renewed");
  }

  const certificateTtlInDays = Math.ceil(
    (certificate.notAfter.getTime() - certificate.notBefore.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (ca.internalCa?.notAfter) {
    const caExpiryDate = new Date(ca.internalCa.notAfter);
    const proposedCertExpiryDate = new Date(now.getTime() + certificateTtlInDays * 24 * 60 * 60 * 1000);

    if (proposedCertExpiryDate > caExpiryDate) {
      errors.push(
        `New certificate would expire (${proposedCertExpiryDate.toISOString()}) after its issuing CA (${caExpiryDate.toISOString()})`
      );
    }
  }

  return {
    isEligible: errors.length === 0,
    errors
  };
};

const parseKeyUsages = (keyUsages: unknown): CertKeyUsageType[] => {
  if (!keyUsages) return [];

  const validKeyUsages = [...Object.values(CertKeyUsageType), ...Object.values(CertKeyUsage)] as string[];

  const normalize = (usage: string): CertKeyUsageType | null => {
    if (validKeyUsages.includes(usage)) {
      return mapLegacyKeyUsageToStandard(usage as CertKeyUsageType);
    }
    return null;
  };

  let raw: string[];

  if (Array.isArray(keyUsages)) {
    raw = keyUsages.filter((u): u is string => typeof u === "string");
  } else if (typeof keyUsages === "string") {
    raw = keyUsages.split(",").map((u) => u.trim());
  } else {
    return [];
  }

  return raw.map((u) => normalize(u)).filter((u): u is CertKeyUsageType => u !== null);
};

const parseExtendedKeyUsages = (extendedKeyUsages: unknown): CertExtendedKeyUsageType[] => {
  if (!extendedKeyUsages) return [];

  const validExtendedKeyUsages = [
    ...Object.values(CertExtendedKeyUsageType),
    ...Object.values(CertExtendedKeyUsage)
  ] as string[];

  const normalize = (usage: string): CertExtendedKeyUsageType | null => {
    if (validExtendedKeyUsages.includes(usage)) {
      return mapLegacyExtendedKeyUsageToStandard(usage as CertExtendedKeyUsageType);
    }
    return null;
  };

  let raw: string[];

  if (Array.isArray(extendedKeyUsages)) {
    raw = extendedKeyUsages.filter((u): u is string => typeof u === "string");
  } else if (typeof extendedKeyUsages === "string") {
    raw = extendedKeyUsages.split(",").map((u) => u.trim());
  } else {
    return [];
  }

  return raw.map((u) => normalize(u)).filter((u): u is CertExtendedKeyUsageType => u !== null);
};

const createSelfSignedCertificateRecord = async ({
  selfSignedResult,
  certificateRequest,
  profile,
  originalCert,
  certificateDAL,
  tx,
  isRenewal = false
}: {
  selfSignedResult: Awaited<ReturnType<typeof generateSelfSignedCertificate>>;
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

  // Extract certificate fields for storage
  const parsedFields = extractCertificateFields(selfSignedResult.certificate);

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

const parseTtlToMs = (ttl: string): number => {
  const regex = new RE2("^(\\d+)(s|m|h|d)$");
  const match = regex.exec(ttl);

  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown TTL unit: ${unit}`);
  }
};

const processSelfSignedCertificate = async ({
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
  isRenewal = false
}: {
  certificateRequest: {
    commonName?: string;
    keyUsages?: CertKeyUsageType[];
    extendedKeyUsages?: CertExtendedKeyUsageType[];
    validity: { ttl: string };
    notBefore?: Date;
    notAfter?: Date;
  };
  policy?: {
    subject?: Array<{
      type: string;
      allowed?: string[];
      required?: string[];
      denied?: string[];
    }>;
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
}) => {
  const projectId = originalCert?.projectId || profile?.projectId;
  if (!projectId) {
    throw new BadRequestError({ message: "Project ID is required for certificate creation" });
  }

  const selfSignedResult = await generateSelfSignedCertificate({
    certificateRequest,
    policy,
    effectiveSignatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
    effectiveKeyAlgorithm: effectiveAlgorithms.keyAlgorithm
  });

  const certificateData = await createSelfSignedCertificateRecord({
    selfSignedResult,
    certificateRequest,
    profile,
    originalCert,
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

export const certificateV3ServiceFactory = ({
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  acmeAccountDAL,
  certificatePolicyService,
  internalCaService,
  permissionService,
  certificateSyncDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  kmsService,
  projectDAL,
  certificateIssuanceQueue,
  certificateRequestService,
  approvalPolicyDAL,
  certificateRequestDAL,
  userDAL,
  identityDAL,
  approvalPolicyService,
  resourceMetadataDAL
}: TCertificateV3ServiceFactoryDep) => {
  /**
   * Resolves requester name and email based on actor type
   */
  const resolveRequesterInfo = async (
    actor: ActorType,
    actorId: string,
    enrollmentType: EnrollmentType
  ): Promise<{ requesterName: string; requesterEmail: string }> => {
    if (actor === ActorType.USER) {
      const user = await userDAL.findById(actorId);
      if (user) {
        return {
          requesterName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown User",
          requesterEmail: user.email || ""
        };
      }
    } else if (actor === ActorType.IDENTITY) {
      const identity = await identityDAL.findById(actorId);
      if (identity) {
        return {
          requesterName: identity.name || "Machine Identity",
          requesterEmail: ""
        };
      }
      return { requesterName: "Machine Identity", requesterEmail: "" };
    } else if (actor === ActorType.ACME_ACCOUNT || actor === ActorType.ACME_PROFILE) {
      return { requesterName: "ACME Client", requesterEmail: "" };
    } else if (enrollmentType === EnrollmentType.EST) {
      return { requesterName: "EST Client", requesterEmail: "" };
    }
    return { requesterName: "Unknown Client", requesterEmail: "" };
  };

  /**
   * Checks if actor should bypass approval based on machine identity flag
   */
  const shouldBypassApproval = (actor: ActorType, policy: TCertRequestPolicy | null): boolean => {
    return actor === ActorType.IDENTITY && policy?.bypassForMachineIdentities === true;
  };

  const issueCertificateFromProfile = async ({
    profileId,
    certificateRequest,
    metadata,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    removeRootsFromChain
  }: TIssueCertificateFromProfileDTO): Promise<TCertificateIssuanceResponse> => {
    const profile = await validateProfileAndPermissions({
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      requiredEnrollmentType: EnrollmentType.API,
      isInternal: actor === ActorType.EST_ACCOUNT
    });

    const approvalFactory = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.CertRequest](ApprovalPolicyType.CertRequest);
    const matchedApprovalPolicy = (await approvalFactory.matchPolicy(
      approvalPolicyDAL as TApprovalPolicyDALFactory,
      profile.projectId,
      {
        profileName: profile.slug
      }
    )) as TCertRequestPolicy | null;

    if (matchedApprovalPolicy && !shouldBypassApproval(actor, matchedApprovalPolicy)) {
      const approvalPolicy = matchedApprovalPolicy;

      const withDefaults = applyProfileDefaults(certificateRequest, profile.defaults);
      const mappedCertificateRequestForValidation = mapEnumsForValidation({
        ...withDefaults,
        subjectAlternativeNames: withDefaults.altNames
      });

      const policy = await certificatePolicyService.getPolicyById({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        policyId: profile.certificatePolicyId,
        internal: true
      });
      if (!policy) {
        throw new NotFoundError({ message: "Certificate policy not found for this profile" });
      }

      const validationResult = await certificatePolicyService.validateCertificateRequest(
        profile.certificatePolicyId,
        mappedCertificateRequestForValidation
      );

      if (!validationResult.isValid) {
        throw new BadRequestError({
          message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
        });
      }

      const policySteps = await approvalPolicyDAL.findStepsByPolicyId(approvalPolicy.id);
      const { requesterName, requesterEmail } = await resolveRequesterInfo(actor, actorId, EnrollmentType.API);

      const resolvedTtl = resolveEffectiveTtl({
        requestTtl: certificateRequest.validity.ttl || undefined,
        profileDefaultTtlDays: profile.defaults?.ttlDays,
        policyMaxValidity: policy?.validity?.max,
        flowDefaultTtl: ""
      });

      const { certRequestId, approvalRequestId } = await certificateRequestDAL.transaction(async (tx) => {
        // Explicitly set createdAt to ensure millisecond precision matches when used in composite FK references
        // (resource_metadata references the partitioned certificate_requests table via [id, createdAt]).
        const certRequestCreatedAt = new Date();
        const certRequest = await certificateRequestDAL.create(
          {
            projectId: profile.projectId,
            profileId: profile.id,
            commonName: certificateRequest.commonName || null,
            altNames: certificateRequest.altNames ? JSON.stringify(certificateRequest.altNames) : null,
            keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || null,
            extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || null,
            notBefore: certificateRequest.notBefore || null,
            notAfter: certificateRequest.notAfter || null,
            keyAlgorithm: certificateRequest.keyAlgorithm || null,
            signatureAlgorithm: certificateRequest.signatureAlgorithm || null,
            ttl: resolvedTtl,
            status: CertificateRequestStatus.PENDING_APPROVAL,
            organization: certificateRequest.organization || null,
            organizationalUnit: certificateRequest.organizationalUnit || null,
            country: certificateRequest.country || null,
            state: certificateRequest.state || null,
            locality: certificateRequest.locality || null,
            basicConstraints: certificateRequest.basicConstraints
              ? JSON.stringify(certificateRequest.basicConstraints)
              : null,
            createdAt: certRequestCreatedAt
          } as Parameters<typeof certificateRequestDAL.create>[0] & { createdAt: Date },
          tx
        );

        if (metadata && metadata.length > 0) {
          await insertMetadataForCertificateRequest(resourceMetadataDAL, {
            metadata,
            certificateRequestId: certRequest.id,
            certificateRequestCreatedAt: certRequest.createdAt,
            orgId: actorOrgId,
            tx
          });
        }

        const requestData: TCertRequestRequestData = {
          profileId,
          profileName: profile.slug,
          certificateRequest: {
            commonName: certificateRequest.commonName,
            organization: certificateRequest.organization,
            organizationalUnit: certificateRequest.organizationalUnit,
            country: certificateRequest.country,
            state: certificateRequest.state,
            locality: certificateRequest.locality,
            keyUsages: certificateRequest.keyUsages,
            extendedKeyUsages: certificateRequest.extendedKeyUsages,
            altNames: certificateRequest.altNames,
            validity: certificateRequest.validity,
            notBefore: certificateRequest.notBefore?.toISOString(),
            notAfter: certificateRequest.notAfter?.toISOString(),
            signatureAlgorithm: certificateRequest.signatureAlgorithm,
            keyAlgorithm: certificateRequest.keyAlgorithm,
            basicConstraints: certificateRequest.basicConstraints
          },
          certificateRequestId: certRequest.id
        };

        const expiresAt = approvalPolicy.maxRequestTtl ? new Date(Date.now() + ms(approvalPolicy.maxRequestTtl)) : null;

        const { request: approvalRequest } = await approvalPolicyService.createRequestFromPolicy({
          projectId: profile.projectId,
          organizationId: actorOrgId,
          policy: { ...approvalPolicy, steps: policySteps },
          requestData,
          justification: `Certificate issuance request for ${certificateRequest.commonName || profile.slug}`,
          expiresAt,
          requesterUserId: actor === ActorType.USER ? actorId : null,
          machineIdentityId: actor === ActorType.IDENTITY ? actorId : null,
          requesterName,
          requesterEmail,
          tx
        });

        await certificateRequestDAL.updateById(
          certRequest.id,
          {
            approvalRequestId: approvalRequest.id
          },
          tx
        );

        return { certRequestId: certRequest.id, approvalRequestId: approvalRequest.id };
      });

      logger.info(
        {
          certificateRequestId: certRequestId,
          approvalRequestId,
          profileId,
          profileName: profile.slug
        },
        "Certificate request requires approval"
      );

      return {
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: certRequestId,
        message: "Certificate request requires approval",
        projectId: profile.projectId,
        profileName: profile.slug,
        commonName: certificateRequest.commonName
      };
    }

    if (certificateRequest.commonName && Array.isArray(certificateRequest.commonName)) {
      throw new BadRequestError({
        message: "Common Name must be a single value, not an array"
      });
    }

    const certificateRequestWithDefaults = applyProfileDefaults(certificateRequest, profile.defaults);
    const mappedCertificateRequest = mapEnumsForValidation({
      ...certificateRequestWithDefaults,
      subjectAlternativeNames: certificateRequestWithDefaults.altNames
    });

    const policy = await certificatePolicyService.getPolicyById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      policyId: profile.certificatePolicyId,
      internal: true
    });
    if (!policy) {
      throw new NotFoundError({ message: "Certificate policy not found for this profile" });
    }

    const validationResult = await certificatePolicyService.validateCertificateRequest(
      profile.certificatePolicyId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const effectiveSignatureAlgorithm = certificateRequestWithDefaults.signatureAlgorithm as
      | CertSignatureAlgorithm
      | undefined;
    const effectiveKeyAlgorithm = certificateRequestWithDefaults.keyAlgorithm as CertKeyAlgorithm | undefined;

    if (policy.algorithms?.keyAlgorithm && !effectiveKeyAlgorithm) {
      throw new BadRequestError({
        message: "Key algorithm is required by template policy but not provided in request"
      });
    }

    if (policy.algorithms?.signature && !effectiveSignatureAlgorithm) {
      throw new BadRequestError({
        message: "Signature algorithm is required by template policy but not provided in request"
      });
    }

    const certificateSubject = buildCertificateSubjectFromTemplate(certificateRequestWithDefaults, policy?.subject);
    const subjectAlternativeNames = buildSubjectAlternativeNamesFromTemplate(
      { subjectAlternativeNames: certificateRequestWithDefaults.altNames },
      policy?.sans
    );

    const issuerType = profile?.issuerType || (profile?.caId ? IssuerType.CA : IssuerType.SELF_SIGNED);

    if (issuerType === IssuerType.SELF_SIGNED) {
      const resolvedTtl = resolveEffectiveTtl({
        requestTtl: certificateRequest.validity.ttl || undefined,
        profileDefaultTtlDays: profile.defaults?.ttlDays,
        policyMaxValidity: policy?.validity?.max,
        flowDefaultTtl: ""
      });

      const result = await certificateDAL.transaction(async (tx) => {
        const effectiveAlgorithms = getEffectiveAlgorithms(effectiveSignatureAlgorithm, effectiveKeyAlgorithm);

        const processResult = await processSelfSignedCertificate({
          certificateRequest: {
            ...certificateRequest,
            validity: { ttl: resolvedTtl }
          },
          policy,
          profile,
          effectiveAlgorithms,
          certificateDAL,
          certificateBodyDAL,
          certificateSecretDAL,
          kmsService,
          projectDAL,
          tx
        });

        const certRequestResult = await certificateRequestService.createCertificateRequest({
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          projectId: profile.projectId,
          tx,
          profileId: profile.id,
          commonName: certificateRequest.commonName,
          altNames: certificateRequest.altNames,
          keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages),
          extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages),
          notBefore: certificateRequest.notBefore,
          notAfter: certificateRequest.notAfter,
          keyAlgorithm: effectiveKeyAlgorithm,
          signatureAlgorithm: effectiveSignatureAlgorithm,
          status: CertificateRequestStatus.ISSUED,
          certificateId: processResult.certificateData.id,
          ttl: resolvedTtl,
          enrollmentType: EnrollmentType.API,
          organization: certificateRequest.organization,
          organizationalUnit: certificateRequest.organizationalUnit,
          country: certificateRequest.country,
          state: certificateRequest.state,
          locality: certificateRequest.locality
        });

        if (metadata && metadata.length > 0) {
          await insertMetadataForCertificate(resourceMetadataDAL, {
            metadata,
            certificateId: processResult.certificateData.id,
            orgId: actorOrgId,
            tx
          });
          await insertMetadataForCertificateRequest(resourceMetadataDAL, {
            metadata,
            certificateRequestId: certRequestResult.id,
            certificateRequestCreatedAt: certRequestResult.createdAt,
            orgId: actorOrgId,
            tx
          });
        }

        const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
          profile,
          resolvedTtl,
          processResult.selfSignedResult.notAfter
        );

        if (finalRenewBeforeDays !== undefined) {
          await certificateDAL.updateById(
            processResult.certificateData.id,
            {
              renewBeforeDays: finalRenewBeforeDays
            },
            tx
          );
        }

        return { ...processResult, certificateRequestId: certRequestResult.id };
      });

      const { selfSignedResult, certificateData, certificateRequestId } = result;

      const subjectCommonName =
        (selfSignedResult.certificateSubject.common_name as string) ||
        certificateRequest.commonName ||
        "Self-signed Certificate";

      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId: profile.projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      const canReadPrivateKey = permission.can(
        ProjectPermissionCertificateActions.ReadPrivateKey,
        ProjectPermissionSub.Certificates
      );

      const privateKeyForResponse = canReadPrivateKey ? selfSignedResult.privateKey.toString("utf8") : undefined;

      return {
        status: CertificateRequestStatus.ISSUED,
        certificate: selfSignedResult.certificate.toString("utf8"),
        issuingCaCertificate: "",
        certificateChain: selfSignedResult.certificate.toString("utf8"),
        privateKey: privateKeyForResponse,
        serialNumber: selfSignedResult.serialNumber,
        certificateId: certificateData.id,
        certificateRequestId,
        projectId: profile.projectId,
        profileName: profile.slug,
        commonName: subjectCommonName
      };
    }

    if (!profile.caId) {
      throw new NotFoundError({ message: "Certificate Authority ID not found" });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "direct certificate issuance");
    validateAlgorithmCompatibility(ca, policy);

    const shouldIssueAsCA = certificateRequest.basicConstraints?.isCA === true;
    const policyIsCAState: CertPolicyState =
      (policy.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;

    if (shouldIssueAsCA && policyIsCAState === CertPolicyState.DENIED) {
      throw new BadRequestError({
        message:
          "CA certificate issuance is not allowed by this policy. The policy's CA:true basicConstraints must be set to 'allowed' or 'required'."
      });
    }

    const caBasicConstraints = shouldIssueAsCA
      ? { isCA: true, pathLength: policy.basicConstraints?.maxPathLength }
      : undefined;

    const isInternalRequest = actor === ActorType.EST_ACCOUNT;

    const {
      certificate,
      certificateChain,
      issuingCaCertificate,
      privateKey,
      serialNumber,
      cert,
      certificateRequestId
    } = await certificateDAL.transaction(async (tx) => {
      const baseCertParams = {
        caId: ca.id,
        friendlyName: certificateSubject.common_name || "Certificate",
        commonName: certificateSubject.common_name || "",
        altNames: subjectAlternativeNames,
        basicConstraints: caBasicConstraints,
        pathLength: certificateRequestWithDefaults.basicConstraints?.pathLength,
        ttl: resolveEffectiveTtl({
          requestTtl: certificateRequest.validity.ttl,
          profileDefaultTtlDays: profile.defaults?.ttlDays,
          policyMaxValidity: policy?.validity?.max,
          flowDefaultTtl: ""
        }),
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequestWithDefaults.keyUsages) || [],
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequestWithDefaults.extendedKeyUsages) || [],
        notBefore: normalizeDateForApi(certificateRequest.notBefore),
        notAfter: normalizeDateForApi(certificateRequest.notAfter),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        isFromProfile: true,
        organization: certificateRequestWithDefaults.organization,
        organizationalUnit: certificateRequestWithDefaults.organizationalUnit,
        country: certificateRequestWithDefaults.country,
        state: certificateRequestWithDefaults.state,
        locality: certificateRequestWithDefaults.locality,
        tx
      };

      const certResult = await internalCaService.issueCertFromCa(
        isInternalRequest
          ? { ...baseCertParams, internal: true as const }
          : { ...baseCertParams, actor, actorId, actorAuthMethod, actorOrgId }
      );

      const certificateRecord = await certificateDAL.findById(certResult.certificateId, tx);
      if (!certificateRecord) {
        throw new NotFoundError({ message: "Certificate was issued but could not be found in database" });
      }
      const effectiveTtl = resolveEffectiveTtl({
        requestTtl: certificateRequest.validity.ttl,
        profileDefaultTtlDays: profile.defaults?.ttlDays,
        policyMaxValidity: policy?.validity?.max,
        flowDefaultTtl: ""
      });

      const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
        profile,
        effectiveTtl,
        new Date(certificateRecord.notAfter)
      );

      const updateData: { profileId: string; renewBeforeDays?: number } = { profileId };
      if (finalRenewBeforeDays !== undefined) {
        updateData.renewBeforeDays = finalRenewBeforeDays;
      }
      await certificateDAL.updateById(certificateRecord.id, updateData, tx);

      const certRequestResult = await certificateRequestService.createCertificateRequest({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        projectId: profile.projectId,
        tx,
        caId: ca.id,
        profileId: profile.id,
        commonName: certificateRequest.commonName,
        altNames: certificateRequest.altNames,
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages),
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages),
        notBefore: certificateRequest.notBefore,
        notAfter: certificateRequest.notAfter,
        keyAlgorithm: effectiveKeyAlgorithm,
        signatureAlgorithm: effectiveSignatureAlgorithm,
        status: CertificateRequestStatus.ISSUED,
        certificateId: certResult.certificateId,
        basicConstraints: certificateRequest.basicConstraints,
        ttl: certificateRequest.validity.ttl,
        enrollmentType: EnrollmentType.API,
        organization: certificateRequest.organization,
        organizationalUnit: certificateRequest.organizationalUnit,
        country: certificateRequest.country,
        state: certificateRequest.state,
        locality: certificateRequest.locality
      });

      if (metadata && metadata.length > 0) {
        await insertMetadataForCertificate(resourceMetadataDAL, {
          metadata,
          certificateId: certResult.certificateId,
          orgId: actorOrgId,
          tx
        });
        await insertMetadataForCertificateRequest(resourceMetadataDAL, {
          metadata,
          certificateRequestId: certRequestResult.id,
          certificateRequestCreatedAt: certRequestResult.createdAt,
          orgId: actorOrgId,
          tx
        });
      }

      return { ...certResult, cert: certificateRecord, certificateRequestId: certRequestResult.id };
    });

    let finalCertificateChain = bufferToString(certificateChain);
    if (removeRootsFromChain) {
      finalCertificateChain = removeRootCaFromChain(finalCertificateChain);
    }

    // Check if user has permission to read private key
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const canReadPrivateKey = permission.can(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

    const privateKeyForResponse = canReadPrivateKey ? bufferToString(privateKey) : undefined;

    return {
      status: CertificateRequestStatus.ISSUED,
      certificate: bufferToString(certificate),
      issuingCaCertificate: bufferToString(issuingCaCertificate),
      certificateChain: finalCertificateChain,
      privateKey: privateKeyForResponse,
      serialNumber,
      certificateId: cert.id,
      certificateRequestId,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: cert.commonName || ""
    };
  };

  const signCertificateFromProfile = async ({
    profileId,
    csr,
    validity,
    notBefore,
    notAfter,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    enrollmentType,
    metadata,
    removeRootsFromChain,
    basicConstraints
  }: TSignCertificateFromProfileDTO): Promise<TCertificateIssuanceResponse> => {
    const profile = await validateProfileAndPermissions({
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      requiredEnrollmentType: enrollmentType,
      isInternal: actor === ActorType.EST_ACCOUNT
    });

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for CSR signing"
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "CSR signing");

    const policy = await certificatePolicyService.getPolicyById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      policyId: profile.certificatePolicyId,
      internal: true
    });

    if (!policy) {
      throw new NotFoundError({ message: "Certificate policy not found for this profile" });
    }

    const csrCertificateRequest = extractCertificateRequestFromCSR(csr);
    const certificateRequest = applyProfileDefaults(csrCertificateRequest, profile.defaults);
    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);

    const { keyAlgorithm: extractedKeyAlgorithm, signatureAlgorithm: extractedSignatureAlgorithm } =
      extractAlgorithmsFromCSR(csr);

    mappedCertificateRequest.keyAlgorithm = extractedKeyAlgorithm;
    mappedCertificateRequest.signatureAlgorithm = extractedSignatureAlgorithm;

    // When notAfter is explicitly provided, validate using date range (notAfter overrides TTL in cert generation).
    // Otherwise, validate using TTL. These are mutually exclusive to avoid "Cannot specify both" validation error.
    if (notAfter) {
      mappedCertificateRequest.notBefore = notBefore;
      mappedCertificateRequest.notAfter = notAfter;
    } else {
      mappedCertificateRequest.validity = validity;
    }

    // Determine effective basicConstraints early (before approval flow)
    // so it's available for both the approval path and direct signing path.
    // Per RFC 5280, keyCertSign in key usage implies CA certificate. We add this because some clients will not send basicConstraints in the CSR.
    const csrHasKeyCertSign = certificateRequest.keyUsages?.includes(CertKeyUsageType.KEY_CERT_SIGN) ?? false;
    const effectiveBasicConstraints = basicConstraints ?? certificateRequest.basicConstraints;
    const shouldIssueAsCA = effectiveBasicConstraints?.isCA === true || csrHasKeyCertSign;

    // Compute the final basicConstraints to store/use
    const resolvedBasicConstraints = shouldIssueAsCA
      ? { isCA: true, pathLength: effectiveBasicConstraints?.pathLength }
      : effectiveBasicConstraints;

    const validationResult = await certificatePolicyService.validateCertificateRequest(
      profile.certificatePolicyId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const csrApprovalFactory = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.CertRequest](
      ApprovalPolicyType.CertRequest
    );
    const csrMatchedApprovalPolicy = (await csrApprovalFactory.matchPolicy(
      approvalPolicyDAL as TApprovalPolicyDALFactory,
      profile.projectId,
      {
        profileName: profile.slug
      }
    )) as TCertRequestPolicy | null;

    if (csrMatchedApprovalPolicy && !shouldBypassApproval(actor, csrMatchedApprovalPolicy)) {
      const approvalPolicy = csrMatchedApprovalPolicy;

      const policySteps = await approvalPolicyDAL.findStepsByPolicyId(approvalPolicy.id);
      const { requesterName, requesterEmail } = await resolveRequesterInfo(actor, actorId, enrollmentType);

      const { certRequestId, approvalRequestId } = await certificateRequestDAL.transaction(async (tx) => {
        // Explicitly set createdAt to ensure millisecond precision matches when used in composite FK references
        const certRequestCreatedAt = new Date();
        const certRequest = await certificateRequestDAL.create(
          {
            projectId: profile.projectId,
            profileId: profile.id,
            csr,
            commonName: mappedCertificateRequest.commonName || null,
            altNames: mappedCertificateRequest.subjectAlternativeNames
              ? JSON.stringify(mappedCertificateRequest.subjectAlternativeNames)
              : null,
            keyUsages: convertKeyUsageArrayToLegacy(mappedCertificateRequest.keyUsages) || null,
            extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(mappedCertificateRequest.extendedKeyUsages) || null,
            notBefore: notBefore || null,
            notAfter: notAfter || null,
            keyAlgorithm: extractedKeyAlgorithm || null,
            signatureAlgorithm: extractedSignatureAlgorithm || null,
            ttl: validity.ttl,
            enrollmentType,
            status: CertificateRequestStatus.PENDING_APPROVAL,
            basicConstraints: resolvedBasicConstraints ? JSON.stringify(resolvedBasicConstraints) : null,
            createdAt: certRequestCreatedAt
          } as Parameters<typeof certificateRequestDAL.create>[0] & { createdAt: Date },
          tx
        );

        if (metadata && metadata.length > 0) {
          await insertMetadataForCertificateRequest(resourceMetadataDAL, {
            metadata,
            certificateRequestId: certRequest.id,
            certificateRequestCreatedAt: certRequest.createdAt,
            orgId: actorOrgId,
            tx
          });
        }

        const requestData: TCertRequestRequestData = {
          profileId,
          profileName: profile.slug,
          certificateRequest: {
            commonName: mappedCertificateRequest.commonName,
            organization: mappedCertificateRequest.organization,
            organizationalUnit: mappedCertificateRequest.organizationalUnit,
            country: mappedCertificateRequest.country,
            state: mappedCertificateRequest.state,
            locality: mappedCertificateRequest.locality,
            keyUsages: mappedCertificateRequest.keyUsages,
            extendedKeyUsages: mappedCertificateRequest.extendedKeyUsages,
            altNames: mappedCertificateRequest.subjectAlternativeNames,
            validity,
            notBefore: notBefore?.toISOString(),
            notAfter: notAfter?.toISOString(),
            signatureAlgorithm: extractedSignatureAlgorithm,
            keyAlgorithm: extractedKeyAlgorithm,
            basicConstraints: resolvedBasicConstraints
          },
          certificateRequestId: certRequest.id
        };

        const expiresAt = approvalPolicy.maxRequestTtl ? new Date(Date.now() + ms(approvalPolicy.maxRequestTtl)) : null;

        const { request: approvalRequest } = await approvalPolicyService.createRequestFromPolicy({
          projectId: profile.projectId,
          organizationId: actorOrgId,
          policy: { ...approvalPolicy, steps: policySteps },
          requestData,
          justification: `Certificate signing request for ${mappedCertificateRequest.commonName || profile.slug}`,
          expiresAt,
          requesterUserId: actor === ActorType.USER ? actorId : null,
          machineIdentityId: actor === ActorType.IDENTITY ? actorId : null,
          requesterName,
          requesterEmail,
          tx
        });

        await certificateRequestDAL.updateById(
          certRequest.id,
          {
            approvalRequestId: approvalRequest.id
          },
          tx
        );

        return { certRequestId: certRequest.id, approvalRequestId: approvalRequest.id };
      });

      logger.info(
        {
          certificateRequestId: certRequestId,
          approvalRequestId,
          profileId,
          profileName: profile.slug
        },
        "CSR signing request requires approval"
      );

      return {
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: certRequestId,
        message: "Certificate signing request requires approval",
        projectId: profile.projectId,
        profileName: profile.slug,
        commonName: mappedCertificateRequest.commonName
      };
    }

    validateAlgorithmCompatibility(ca, policy);

    const effectiveSignatureAlgorithm = extractedSignatureAlgorithm;
    const effectiveKeyAlgorithm = extractedKeyAlgorithm;

    const policyIsCAState: CertPolicyState =
      (policy.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;

    if (shouldIssueAsCA && policyIsCAState === CertPolicyState.DENIED) {
      throw new BadRequestError({
        message:
          "CA certificate issuance is not allowed by this policy. The policy's CA:true basicConstraints must be set to 'allowed' or 'required'."
      });
    }

    // Transform policy basicConstraints to the format expected by the CA service
    const caBasicConstraints = shouldIssueAsCA
      ? { isCA: true, pathLength: policy.basicConstraints?.maxPathLength }
      : undefined;

    const effectiveTtl = resolveEffectiveTtl({
      requestTtl: validity.ttl,
      profileDefaultTtlDays: profile.defaults?.ttlDays,
      policyMaxValidity: policy?.validity?.max,
      flowDefaultTtl: ""
    });

    const csrSubjectParsed = parseDistinguishedName(new x509.Pkcs10CertificateRequest(csr).subject);
    const mergedSubject = {
      ...csrSubjectParsed,
      commonName: csrSubjectParsed.commonName ?? certificateRequest.commonName,
      organization: csrSubjectParsed.organization ?? certificateRequest.organization,
      ou: csrSubjectParsed.ou ?? certificateRequest.organizationalUnit,
      country: csrSubjectParsed.country ?? certificateRequest.country,
      province: csrSubjectParsed.province ?? certificateRequest.state,
      locality: csrSubjectParsed.locality ?? certificateRequest.locality
    };
    const subjectOverride = createDistinguishedName(mergedSubject);

    const { certificate, certificateChain, issuingCaCertificate, serialNumber, cert, certificateRequestId } =
      await certificateDAL.transaction(async (tx) => {
        const certResult = await internalCaService.signCertFromCa({
          isInternal: true,
          caId: ca.id,
          csr,
          subjectOverride,
          basicConstraints: caBasicConstraints,
          pathLength: effectiveBasicConstraints?.pathLength,
          ttl: effectiveTtl,
          altNames: undefined,
          notBefore: normalizeDateForApi(notBefore),
          notAfter: normalizeDateForApi(notAfter),
          keyUsages: certificateRequest.keyUsages
            ? convertKeyUsageArrayToLegacy(certificateRequest.keyUsages)
            : undefined,
          extendedKeyUsages: certificateRequest.extendedKeyUsages
            ? convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages)
            : undefined,
          signatureAlgorithm: effectiveSignatureAlgorithm,
          keyAlgorithm: effectiveKeyAlgorithm,
          isFromProfile: true,
          tx
        });

        const signedCertRecord = await certificateDAL.findById(certResult.certificateId, tx);
        if (!signedCertRecord) {
          throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
        }

        const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
          profile,
          effectiveTtl,
          new Date(signedCertRecord.notAfter)
        );

        const updateData: { profileId: string; renewBeforeDays?: number } = { profileId };
        if (finalRenewBeforeDays !== undefined) {
          updateData.renewBeforeDays = finalRenewBeforeDays;
        }
        await certificateDAL.updateById(signedCertRecord.id, updateData, tx);

        const certRequestResult = await certificateRequestService.createCertificateRequest({
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          projectId: profile.projectId,
          tx,
          caId: ca.id,
          profileId: profile.id,
          csr,
          commonName: mappedCertificateRequest.commonName,
          altNames: mappedCertificateRequest.subjectAlternativeNames,
          keyUsages: convertKeyUsageArrayToLegacy(mappedCertificateRequest.keyUsages),
          extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(mappedCertificateRequest.extendedKeyUsages),
          notBefore,
          notAfter,
          keyAlgorithm: effectiveKeyAlgorithm,
          signatureAlgorithm: effectiveSignatureAlgorithm,
          status: CertificateRequestStatus.ISSUED,
          certificateId: certResult.certificateId,
          basicConstraints,
          ttl: validity.ttl,
          enrollmentType: EnrollmentType.API
        });

        if (metadata && metadata.length > 0) {
          await insertMetadataForCertificate(resourceMetadataDAL, {
            metadata,
            certificateId: certResult.certificateId,
            orgId: actorOrgId,
            tx
          });
          await insertMetadataForCertificateRequest(resourceMetadataDAL, {
            metadata,
            certificateRequestId: certRequestResult.id,
            certificateRequestCreatedAt: certRequestResult.createdAt,
            orgId: actorOrgId,
            tx
          });
        }

        return { ...certResult, cert: signedCertRecord, certificateRequestId: certRequestResult.id };
      });

    const certificateString = extractCertificateFromBuffer(certificate as unknown as Buffer);
    let certificateChainString = extractCertificateFromBuffer(certificateChain as unknown as Buffer);
    if (removeRootsFromChain) {
      certificateChainString = removeRootCaFromChain(certificateChainString);
    }

    return {
      status: CertificateRequestStatus.ISSUED,
      certificate: certificateString,
      issuingCaCertificate: extractCertificateFromBuffer(issuingCaCertificate as unknown as Buffer),
      certificateChain: certificateChainString,
      serialNumber,
      certificateId: cert.id,
      certificateRequestId,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: cert.commonName || ""
    };
  };

  const orderCertificateFromProfile = async ({
    profileId,
    certificateOrder,
    metadata,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TOrderCertificateFromProfileDTO): Promise<TCertificateIssuanceResponse> => {
    const profile = await validateProfileAndPermissions({
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      requiredEnrollmentType: EnrollmentType.API,
      isInternal: actor === ActorType.EST_ACCOUNT
    });

    let certificateRequest: TCertificateRequest;
    let extractedKeyAlgorithm: string | undefined;
    let extractedSignatureAlgorithm: string | undefined;

    if (certificateOrder.csr) {
      const csrRequest = extractCertificateRequestFromCSR(certificateOrder.csr);
      certificateRequest = applyProfileDefaults(csrRequest, profile.defaults);
      const algorithms = extractAlgorithmsFromCSR(certificateOrder.csr);
      extractedKeyAlgorithm = algorithms.keyAlgorithm;
      extractedSignatureAlgorithm = algorithms.signatureAlgorithm;
      certificateRequest.validity = certificateOrder.validity;
      if (certificateOrder.notBefore && certificateOrder.notAfter) {
        certificateRequest.notBefore = certificateOrder.notBefore;
        certificateRequest.notAfter = certificateOrder.notAfter;
      }
    } else {
      const rawRequest: TCertificateRequest = {
        commonName: certificateOrder.commonName,
        keyUsages: certificateOrder.keyUsages,
        extendedKeyUsages: certificateOrder.extendedKeyUsages,
        subjectAlternativeNames: certificateOrder.altNames,
        validity: certificateOrder.validity,
        notBefore: certificateOrder.notBefore,
        notAfter: certificateOrder.notAfter,
        signatureAlgorithm: certificateOrder.signatureAlgorithm,
        keyAlgorithm: certificateOrder.keyAlgorithm,
        organization: certificateOrder.organization,
        organizationalUnit: certificateOrder.organizationalUnit,
        country: certificateOrder.country,
        state: certificateOrder.state,
        locality: certificateOrder.locality
      };
      certificateRequest = applyProfileDefaults(rawRequest, profile.defaults);
    }

    // Check if this is a CA certificate request (either explicit basicConstraints or keyCertSign in key usages)
    // Per RFC 5280, keyCertSign implies CA certificate. Some clients (like cert-manager) only send keyCertSign without basicConstraints.
    const orderCsrHasKeyCertSign = certificateRequest.keyUsages?.includes(CertKeyUsageType.KEY_CERT_SIGN) ?? false;
    if (certificateRequest.basicConstraints?.isCA || orderCsrHasKeyCertSign) {
      throw new BadRequestError({
        message: "CA certificate issuance is not supported for external certificate authorities."
      });
    }

    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);

    if (certificateOrder.csr) {
      mappedCertificateRequest.keyAlgorithm = extractedKeyAlgorithm;
      mappedCertificateRequest.signatureAlgorithm = extractedSignatureAlgorithm;
    }

    const validationResult = await certificatePolicyService.validateCertificateRequest(
      profile.certificatePolicyId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate order validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const orderApprovalFactory = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.CertRequest](
      ApprovalPolicyType.CertRequest
    );
    const orderMatchedApprovalPolicy = (await orderApprovalFactory.matchPolicy(
      approvalPolicyDAL as TApprovalPolicyDALFactory,
      profile.projectId,
      {
        profileName: profile.slug
      }
    )) as TCertRequestPolicy | null;

    if (orderMatchedApprovalPolicy && !shouldBypassApproval(actor, orderMatchedApprovalPolicy)) {
      const approvalPolicy = orderMatchedApprovalPolicy;

      const policySteps = await approvalPolicyDAL.findStepsByPolicyId(approvalPolicy.id);
      const { requesterName, requesterEmail } = await resolveRequesterInfo(actor, actorId, EnrollmentType.API);

      const { certRequestId, approvalRequestId } = await certificateRequestDAL.transaction(async (tx) => {
        // Explicitly set createdAt to ensure millisecond precision matches when used in composite FK references
        const certRequestCreatedAt = new Date();
        const certRequest = await certificateRequestDAL.create(
          {
            projectId: profile.projectId,
            profileId: profile.id,
            csr: certificateOrder.csr || null,
            commonName: certificateOrder.commonName || null,
            altNames: certificateOrder.altNames ? JSON.stringify(certificateOrder.altNames) : null,
            keyUsages: convertKeyUsageArrayToLegacy(certificateOrder.keyUsages) || null,
            extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateOrder.extendedKeyUsages) || null,
            notBefore: certificateOrder.notBefore || null,
            notAfter: certificateOrder.notAfter || null,
            keyAlgorithm: certificateOrder.keyAlgorithm || null,
            signatureAlgorithm: certificateOrder.signatureAlgorithm || null,
            ttl: certificateOrder.validity?.ttl || null,
            metadata: certificateOrder.template ? JSON.stringify({ template: certificateOrder.template }) : null,
            organization: certificateRequest.organization || null,
            organizationalUnit: certificateRequest.organizationalUnit || null,
            country: certificateRequest.country || null,
            state: certificateRequest.state || null,
            locality: certificateRequest.locality || null,
            status: CertificateRequestStatus.PENDING_APPROVAL,
            createdAt: certRequestCreatedAt
          } as Parameters<typeof certificateRequestDAL.create>[0] & { createdAt: Date },
          tx
        );

        if (metadata && metadata.length > 0) {
          await insertMetadataForCertificateRequest(resourceMetadataDAL, {
            metadata,
            certificateRequestId: certRequest.id,
            certificateRequestCreatedAt: certRequest.createdAt,
            orgId: actorOrgId,
            tx
          });
        }

        const requestData: TCertRequestRequestData = {
          profileId,
          profileName: profile.slug,
          certificateRequest: {
            commonName: certificateOrder.commonName,
            organization: certificateRequest.organization,
            organizationalUnit: certificateRequest.organizationalUnit,
            country: certificateRequest.country,
            state: certificateRequest.state,
            locality: certificateRequest.locality,
            keyUsages: certificateOrder.keyUsages as string[] | undefined,
            extendedKeyUsages: certificateOrder.extendedKeyUsages as string[] | undefined,
            altNames: certificateOrder.altNames,
            validity: certificateOrder.validity,
            notBefore: certificateOrder.notBefore?.toISOString(),
            notAfter: certificateOrder.notAfter?.toISOString(),
            signatureAlgorithm: certificateOrder.signatureAlgorithm,
            keyAlgorithm: certificateOrder.keyAlgorithm
          },
          certificateRequestId: certRequest.id
        };

        const expiresAt = approvalPolicy.maxRequestTtl ? new Date(Date.now() + ms(approvalPolicy.maxRequestTtl)) : null;

        const { request: approvalRequest } = await approvalPolicyService.createRequestFromPolicy({
          projectId: profile.projectId,
          organizationId: actorOrgId,
          policy: { ...approvalPolicy, steps: policySteps },
          requestData,
          justification: `Certificate order request for ${certificateOrder.commonName || profile.slug}`,
          expiresAt,
          requesterUserId: actor === ActorType.USER ? actorId : null,
          machineIdentityId: actor === ActorType.IDENTITY ? actorId : null,
          requesterName,
          requesterEmail,
          tx
        });

        await certificateRequestDAL.updateById(
          certRequest.id,
          {
            approvalRequestId: approvalRequest.id
          },
          tx
        );

        return { certRequestId: certRequest.id, approvalRequestId: approvalRequest.id };
      });

      logger.info(
        {
          certificateRequestId: certRequestId,
          approvalRequestId,
          profileId,
          profileName: profile.slug
        },
        "Certificate order request requires approval"
      );

      return {
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: certRequestId,
        message: "Certificate order request requires approval",
        projectId: profile.projectId,
        profileName: profile.slug,
        commonName: certificateOrder.commonName
      };
    }

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for certificate ordering"
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;

    if (caType === CaType.INTERNAL) {
      throw new BadRequestError({
        message: "Certificate ordering is not supported for the specified CA type"
      });
    }

    if (caType === CaType.ACME || caType === CaType.AZURE_AD_CS || caType === CaType.AWS_PCA) {
      const orderId = randomUUID();

      const certRequest = await certificateRequestService.createCertificateRequest({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        projectId: profile.projectId,
        caId: ca.id,
        profileId: profile.id,
        commonName: certificateOrder.commonName || "",
        keyUsages: convertKeyUsageArrayToLegacy(certificateOrder.keyUsages) || [],
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateOrder.extendedKeyUsages) || [],
        keyAlgorithm: certificateOrder.keyAlgorithm || "",
        signatureAlgorithm: certificateOrder.signatureAlgorithm || "",
        altNames: certificateOrder.altNames,
        notBefore: certificateOrder.notBefore,
        notAfter: certificateOrder.notAfter,
        status: CertificateRequestStatus.PENDING,
        ttl: certificateOrder.validity?.ttl,
        enrollmentType: EnrollmentType.API,
        organization: certificateRequest.organization,
        organizationalUnit: certificateRequest.organizationalUnit,
        country: certificateRequest.country,
        state: certificateRequest.state,
        locality: certificateRequest.locality
      });

      if (metadata && metadata.length > 0) {
        await insertMetadataForCertificateRequest(resourceMetadataDAL, {
          metadata,
          certificateRequestId: certRequest.id,
          certificateRequestCreatedAt: certRequest.createdAt,
          orgId: actorOrgId
        });
      }

      await certificateIssuanceQueue.queueCertificateIssuance({
        certificateId: orderId,
        profileId: profile.id,
        caId: profile.caId || "",
        ttl: certificateOrder.validity?.ttl || "1y",
        signatureAlgorithm: certificateOrder.signatureAlgorithm || "",
        keyAlgorithm: certificateRequest.keyAlgorithm || "",
        commonName: certificateRequest.commonName || "",
        altNames:
          certificateRequest.subjectAlternativeNames?.map((san) => ({ type: san.type, value: san.value })) || [],
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || [],
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || [],
        certificateRequestId: certRequest.id,
        csr: certificateOrder.csr,
        organization: certificateRequest.organization,
        organizationalUnit: certificateRequest.organizationalUnit,
        country: certificateRequest.country,
        state: certificateRequest.state,
        locality: certificateRequest.locality
      });

      return {
        status: CertificateRequestStatus.PENDING,
        certificateRequestId: certRequest.id,
        projectId: certRequest.projectId,
        profileName: profile.slug
      };
    }

    throw new BadRequestError({
      message: "Certificate ordering is not supported for the specified CA type"
    });
  };

  const renewCertificate = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    internal = false,
    removeRootsFromChain
  }: Omit<TRenewCertificateDTO, "certificateRequestId"> & {
    internal?: boolean;
  }): Promise<TCertificateIssuanceResponse> => {
    const renewalResult = await certificateDAL.transaction(async (tx) => {
      const originalCert = await certificateDAL.findById(certificateId, tx);
      if (!originalCert) {
        throw new NotFoundError({ message: "Certificate not found" });
      }

      if (!originalCert.profileId) {
        throw new ForbiddenRequestError({
          message: "Only certificates issued from a profile can be renewed"
        });
      }

      // Validate and cast algorithms with fallbacks
      let originalSignatureAlgorithm = Object.values(CertSignatureAlgorithm).includes(
        originalCert.signatureAlgorithm as CertSignatureAlgorithm
      )
        ? (originalCert.signatureAlgorithm as CertSignatureAlgorithm)
        : CertSignatureAlgorithm.RSA_SHA256;
      let originalKeyAlgorithm = Object.values(CertKeyAlgorithm).includes(originalCert.keyAlgorithm as CertKeyAlgorithm)
        ? (originalCert.keyAlgorithm as CertKeyAlgorithm)
        : CertKeyAlgorithm.RSA_2048;

      // For external CA certificates without stored algorithm info, extract from certificate
      if (!originalSignatureAlgorithm || !originalKeyAlgorithm) {
        const isExternalCA = originalCert.caId && !originalCert.caId.startsWith("internal");

        if (isExternalCA) {
          // For external CA certificates, we can extract algorithm info from the cert or use defaults
          originalSignatureAlgorithm = originalSignatureAlgorithm || CertSignatureAlgorithm.RSA_SHA256;
          originalKeyAlgorithm = originalKeyAlgorithm || CertKeyAlgorithm.RSA_2048;
        } else {
          throw new BadRequestError({
            message:
              "Original certificate does not have algorithm information stored. Cannot renew certificate issued before algorithm tracking was implemented."
          });
        }
      }

      let profile = null;
      if (originalCert.profileId) {
        profile = await certificateProfileDAL.findByIdWithConfigs(originalCert.profileId);
        if (!profile) {
          throw new NotFoundError({ message: "Certificate profile not found" });
        }

        if (profile.enrollmentType !== EnrollmentType.API) {
          throw new ForbiddenRequestError({
            message:
              "Certificate is not eligible for renewal: Only certificates issued from an API enrollment profile can be renewed through this endpoint"
          });
        }
      }

      const certificateSecret = await certificateSecretDAL.findOne({ certId: originalCert.id }, tx);
      if (!certificateSecret) {
        throw new ForbiddenRequestError({
          message:
            "Certificate is not eligible for renewal: certificates issued from CSR (external private key) cannot be renewed"
        });
      }

      if (!internal) {
        const projectId = profile?.projectId || originalCert.projectId;
        const { permission } = await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.CertificateManager
        });

        if (profile) {
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionCertificateProfileActions.IssueCert,
            subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
          );
        }
      }

      const issuerType = profile?.issuerType || (originalCert.caId ? IssuerType.CA : IssuerType.SELF_SIGNED);

      let ca;
      if (issuerType === IssuerType.CA) {
        const caId = profile?.caId || originalCert.caId;
        if (!caId) {
          throw new NotFoundError({ message: "Certificate Authority ID not found" });
        }

        ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
        if (!ca) {
          throw new NotFoundError({ message: "Certificate Authority not found" });
        }

        const eligibilityCheck = validateRenewalEligibility(originalCert, ca);
        if (!eligibilityCheck.isEligible) {
          await certificateDAL.updateById(
            originalCert.id,
            {
              renewalError: `Certificate is not eligible for renewal: ${eligibilityCheck.errors.join(", ")}`
            },
            tx
          );
          throw new BadRequestError({
            message: `Certificate is not eligible for renewal: ${eligibilityCheck.errors.join(", ")}`
          });
        }

        const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
        if (caType === CaType.INTERNAL) {
          validateCaSupport(ca, "direct certificate issuance");
        }
      }

      const policyId = profile?.certificatePolicyId || originalCert.certificateTemplateId;
      const policy = policyId
        ? await certificatePolicyService.getPolicyById({
            actor,
            actorId,
            actorAuthMethod,
            actorOrgId,
            policyId,
            internal
          })
        : null;

      if (!policy && profile) {
        throw new NotFoundError({ message: "Certificate policy not found for this profile" });
      }

      const getSimpleTtl = (startDate: Date, endDate: Date): string => {
        const diffMs = endDate.getTime() - startDate.getTime();

        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (days > 0) return `${days}d`;

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h`;

        const minutes = Math.floor(diffMs / (1000 * 60));
        if (minutes > 0) return `${minutes}m`;

        const seconds = Math.floor(diffMs / 1000);
        return `${seconds}s`;
      };

      const ttl = getSimpleTtl(originalCert.notBefore, originalCert.notAfter);

      const certificateRequest = {
        commonName: originalCert.commonName || undefined,
        keyUsages: parseKeyUsages(originalCert.keyUsages),
        extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages),
        subjectAlternativeNames: originalCert.altNames
          ? originalCert.altNames.split(",").map((san) => detectSanType(san.trim()))
          : [],
        validity: {
          ttl
        },
        signatureAlgorithm: originalCert.signatureAlgorithm || undefined,
        keyAlgorithm: originalCert.keyAlgorithm || undefined
      };

      let validationResult: { isValid: boolean; errors: string[] } = { isValid: true, errors: [] };
      if (profile?.certificatePolicyId) {
        validationResult = await certificatePolicyService.validateCertificateRequest(
          profile.certificatePolicyId,
          certificateRequest
        );
      }

      if (!validationResult.isValid) {
        await certificateDAL.updateById(
          originalCert.id,
          {
            renewalError: `Policy validation failed: ${validationResult.errors.join(", ")}`
          },
          tx
        );

        throw new BadRequestError({
          message: `Certificate renewal failed. Errors: ${validationResult.errors.join(", ")}`
        });
      }

      const notBefore = new Date();
      const notAfter = new Date(Date.now() + parseTtlToMs(ttl));

      const finalRenewBeforeDays = profile ? calculateFinalRenewBeforeDays(profile, ttl, notAfter) : undefined;

      let certificate: string;
      let certificateChain: string;
      let issuingCaCertificate: string;
      let serialNumber: string;
      let newCert: TCertificates;

      if (issuerType === IssuerType.CA) {
        // CA-signed certificate renewal
        if (!ca) {
          throw new NotFoundError({ message: "Certificate Authority not found for CA-signed certificate renewal" });
        }

        const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;

        // Only validate algorithm compatibility for internal CAs
        if (caType === CaType.INTERNAL) {
          validateAlgorithmCompatibility(ca, {
            algorithms: policy?.algorithms
          } as { algorithms?: { signature?: string[] } });
        }

        if (caType === CaType.INTERNAL) {
          // Internal CA renewal - existing logic
          const caResult = await internalCaService.issueCertFromCa({
            caId: ca.id,
            friendlyName: originalCert.friendlyName || originalCert.commonName || "Renewed Certificate",
            commonName: originalCert.commonName || "",
            altNames: originalCert.altNames || "",
            ttl,
            notBefore: normalizeDateForApi(notBefore),
            notAfter: normalizeDateForApi(notAfter),
            keyUsages: convertKeyUsageArrayToLegacy(parseKeyUsages(originalCert.keyUsages)),
            extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(
              parseExtendedKeyUsages(originalCert.extendedKeyUsages)
            ),
            signatureAlgorithm: originalSignatureAlgorithm,
            keyAlgorithm: originalKeyAlgorithm,
            isFromProfile: true,
            actor,
            actorId,
            actorAuthMethod,
            actorOrgId,
            internal: true,
            tx
          });

          certificate = caResult.certificate;
          certificateChain = caResult.certificateChain;
          issuingCaCertificate = caResult.issuingCaCertificate;
          serialNumber = caResult.serialNumber;

          const foundCert = await certificateDAL.findById(caResult.certificateId, tx);
          if (!foundCert) {
            throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
          }
          newCert = foundCert;
        } else if (caType === CaType.ACME || caType === CaType.AZURE_AD_CS || caType === CaType.AWS_PCA) {
          // External CA renewal - mark for async processing outside transaction
          return {
            isExternalCA: true,
            ca,
            profile,
            originalCert,
            originalSignatureAlgorithm,
            originalKeyAlgorithm,
            ttl
          };
        } else {
          throw new BadRequestError({
            message: `CA type ${String(caType)} does not support certificate renewal`
          });
        }
      } else {
        // Self-signed certificate renewal
        const effectiveAlgorithms = getEffectiveAlgorithms(
          undefined,
          undefined,
          originalSignatureAlgorithm,
          originalKeyAlgorithm
        );

        const selfSignedRenewalResult = await processSelfSignedCertificate({
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
          isRenewal: true
        });

        certificate = selfSignedRenewalResult.selfSignedResult.certificate.toString("utf8");
        certificateChain = selfSignedRenewalResult.selfSignedResult.certificate.toString("utf8"); // Self-signed has no chain
        issuingCaCertificate = ""; // No issuing CA for self-signed
        serialNumber = selfSignedRenewalResult.selfSignedResult.serialNumber;
        newCert = selfSignedRenewalResult.certificateData;
      }

      if (!newCert) {
        throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
      }

      // For self-signed certificates, we already set the renewal data during creation
      // For CA-signed certificates, we need to set it now
      if (issuerType === IssuerType.CA) {
        const renewalUpdateData: {
          profileId: string | null;
          renewedFromCertificateId: string;
          renewBeforeDays?: number;
        } = {
          profileId: originalCert.profileId || null,
          renewedFromCertificateId: originalCert.id
        };

        if (finalRenewBeforeDays !== undefined) {
          renewalUpdateData.renewBeforeDays = finalRenewBeforeDays;
        }

        await certificateDAL.updateById(newCert.id, renewalUpdateData, tx);
      } else if (finalRenewBeforeDays !== undefined) {
        // For self-signed certificates, just update the renewBeforeDays if needed
        await certificateDAL.updateById(newCert.id, { renewBeforeDays: finalRenewBeforeDays }, tx);
      }

      await certificateDAL.updateById(
        originalCert.id,
        {
          renewedByCertificateId: newCert.id,
          renewalError: null
        },
        tx
      );

      await addRenewedCertificateToSyncs(originalCert.id, newCert.id, { certificateSyncDAL }, tx);

      const renewalAltNames = originalCert.altNames
        ? originalCert.altNames.split(",").map((san) => detectSanType(san.trim()))
        : undefined;

      const certRequestResult = await certificateRequestService.createCertificateRequest({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        projectId: originalCert.projectId,
        tx,
        caId: ca?.id || originalCert.caId || undefined,
        profileId: originalCert.profileId || undefined,
        commonName: originalCert.commonName || undefined,
        altNames: renewalAltNames,
        keyUsages: parseKeyUsages(originalCert.keyUsages),
        extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages),
        notBefore: new Date(newCert.notBefore),
        notAfter: new Date(newCert.notAfter),
        keyAlgorithm: originalKeyAlgorithm,
        signatureAlgorithm: originalSignatureAlgorithm,
        metadata: `Renewed from certificate ID: ${originalCert.id}`,
        status: CertificateRequestStatus.ISSUED,
        certificateId: newCert.id,
        ttl,
        enrollmentType: EnrollmentType.API
      });

      // Copy metadata from original cert to new cert and cert request
      await copyMetadataFromCertificate(resourceMetadataDAL, {
        sourceCertificateId: originalCert.id,
        targetCertificateId: newCert.id,
        targetCertificateRequestId: certRequestResult.id,
        targetCertificateRequestCreatedAt: certRequestResult.createdAt,
        orgId: actorOrgId,
        tx
      });

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        serialNumber,
        newCert,
        originalCert,
        profile,
        certRequestResult
      };
    });

    let certificateRequestId: string = renewalResult.certRequestResult?.id || "";

    // Handle external CA renewals separately
    if ("isExternalCA" in renewalResult && renewalResult.isExternalCA) {
      const { ca, profile, originalCert, originalSignatureAlgorithm, originalKeyAlgorithm, ttl } = renewalResult;

      const renewalOrderId = randomUUID();
      const altNamesArray = originalCert.altNames
        ? originalCert.altNames.split(",").map((san: string) => san.trim())
        : [];
      const structuredAltNames = altNamesArray.map((san) => detectSanType(san));

      const certificateRequest = await certificateRequestService.createCertificateRequest({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        projectId: originalCert.projectId,
        profileId: profile?.id,
        caId: ca.id,
        commonName: originalCert.commonName || undefined,
        altNames: structuredAltNames.length > 0 ? structuredAltNames : undefined,
        keyUsages: parseKeyUsages(originalCert.keyUsages),
        extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages),
        keyAlgorithm: originalKeyAlgorithm,
        signatureAlgorithm: originalSignatureAlgorithm,
        metadata: `Renewed from certificate ID: ${originalCert.id}`,
        status: CertificateRequestStatus.PENDING,
        ttl,
        enrollmentType: EnrollmentType.API
      });

      certificateRequestId = certificateRequest.id;

      // Copy metadata from original cert to new cert request
      await copyMetadataFromCertificate(resourceMetadataDAL, {
        sourceCertificateId: originalCert.id,
        targetCertificateRequestId: certificateRequest.id,
        targetCertificateRequestCreatedAt: certificateRequest.createdAt,
        orgId: actorOrgId
      });

      await certificateIssuanceQueue.queueCertificateIssuance({
        certificateId: renewalOrderId,
        profileId: profile?.id || "",
        caId: ca.id,
        commonName: originalCert.commonName || "",
        altNames: structuredAltNames,
        ttl,
        signatureAlgorithm: originalSignatureAlgorithm,
        keyAlgorithm: originalKeyAlgorithm,
        keyUsages: parseKeyUsages(originalCert.keyUsages).map(mapKeyUsageToLegacy),
        extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages).map(mapExtendedKeyUsageToLegacy),
        organization: originalCert.subjectOrganization || undefined,
        organizationalUnit: originalCert.subjectOrganizationalUnit || undefined,
        country: originalCert.subjectCountry || undefined,
        state: originalCert.subjectState || undefined,
        locality: originalCert.subjectLocality || undefined,
        isRenewal: true,
        originalCertificateId: certificateId,
        certificateRequestId: certificateRequest.id
      });

      return {
        status: CertificateRequestStatus.PENDING,
        certificate: "", // External CA renewal is async
        certificateChain: "",
        issuingCaCertificate: "",
        serialNumber: "",
        certificateId: renewalOrderId,
        certificateRequestId: certificateRequest.id,
        projectId: originalCert.projectId,
        profileName: profile?.slug || "External CA Profile",
        commonName: originalCert.commonName || ""
      };
    }

    // Type check to ensure we have internal CA renewal result
    if ("isExternalCA" in renewalResult) {
      throw new BadRequestError({ message: "External CA renewals should be handled asynchronously" });
    }

    await triggerAutoSyncForCertificate(renewalResult.newCert.id, {
      certificateSyncDAL,
      pkiSyncDAL,
      pkiSyncQueue
    });

    let finalCertificateChain = renewalResult.certificateChain;
    if (removeRootsFromChain) {
      finalCertificateChain = removeRootCaFromChain(finalCertificateChain);
    }
    return {
      status: CertificateRequestStatus.ISSUED,
      certificate: renewalResult.certificate,
      issuingCaCertificate: renewalResult.issuingCaCertificate,
      certificateChain: finalCertificateChain,
      serialNumber: renewalResult.serialNumber,
      certificateId: renewalResult.newCert.id,
      certificateRequestId,
      projectId: renewalResult.originalCert.projectId,
      profileName: renewalResult.profile?.slug || "Self-signed Certificate",
      commonName: renewalResult.originalCert.commonName || ""
    };
  };

  const updateRenewalConfig = async ({
    certificateId,
    renewBeforeDays,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateRenewalConfigDTO): Promise<TRenewalConfigResponse> => {
    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Edit,
      subject(ProjectPermissionSub.Certificates, {
        commonName: certificate.commonName,
        altNames: certificate.altNames ?? undefined,
        serialNumber: certificate.serialNumber
      })
    );

    if (!certificate.profileId) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate was not issued from a profile"
      });
    }

    const profile = await certificateProfileDAL.findByIdWithConfigs(certificate.profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.API) {
      throw new ForbiddenRequestError({
        message: "Certificate is not eligible for auto-renewal: EST certificates cannot be auto-renewed"
      });
    }

    const certificateSecret = await certificateSecretDAL.findOne({ certId: certificate.id });
    if (!certificateSecret) {
      throw new ForbiddenRequestError({
        message:
          "Certificate is not eligible for auto-renewal: certificates issued from CSR (external private key) cannot be auto-renewed"
      });
    }

    if (certificate.status !== CertStatus.ACTIVE) {
      throw new BadRequestError({
        message: `Certificate is not eligible for auto-renewal: certificate status is ${certificate.status}, must be active`
      });
    }

    const now = new Date();
    if (certificate.notAfter <= now) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has expired"
      });
    }

    if (certificate.revokedAt) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has been revoked"
      });
    }

    if (certificate.renewedByCertificateId) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has already been renewed"
      });
    }

    const certificateTtlInDays = Math.ceil(
      (new Date(certificate.notAfter).getTime() - new Date(certificate.notBefore).getTime()) / (24 * 60 * 60 * 1000)
    );

    if (renewBeforeDays >= certificateTtlInDays) {
      throw new BadRequestError({
        message: "Invalid renewal configuration: renewal threshold exceeds certificate validity period"
      });
    }

    if (!isValidRenewalTiming(renewBeforeDays, new Date(certificate.notAfter))) {
      throw new BadRequestError({
        message: "Invalid renewal configuration: renewal would be triggered immediately or in the past"
      });
    }

    await certificateDAL.transaction(async (tx) => {
      await certificateDAL.updateById(
        certificateId,
        {
          renewBeforeDays
        },
        tx
      );
    });

    return {
      projectId: certificate.projectId,
      renewBeforeDays,
      commonName: certificate.commonName || ""
    };
  };

  const disableRenewalConfig = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDisableRenewalConfigDTO): Promise<TDisableRenewalResponse> => {
    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Edit,
      subject(ProjectPermissionSub.Certificates, {
        commonName: certificate.commonName,
        altNames: certificate.altNames ?? undefined,
        serialNumber: certificate.serialNumber
      })
    );

    if (!certificate.profileId) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate was not issued from a profile"
      });
    }

    const profile = await certificateProfileDAL.findByIdWithConfigs(certificate.profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.API) {
      throw new ForbiddenRequestError({
        message: "Certificate is not eligible for auto-renewal: EST certificates cannot be auto-renewed"
      });
    }

    await certificateDAL.transaction(async (tx) => {
      await certificateDAL.updateById(
        certificateId,
        {
          renewBeforeDays: null
        },
        tx
      );
    });

    return {
      projectId: certificate.projectId,
      commonName: certificate.commonName || ""
    };
  };

  const updateCertificateMetadata = async ({
    certificateId,
    metadata,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateCertificateMetadataDTO) => {
    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Edit,
      subject(ProjectPermissionSub.Certificates, {
        commonName: certificate.commonName,
        altNames: certificate.altNames ?? undefined,
        serialNumber: certificate.serialNumber
      })
    );

    const updatedMetadata = await certificateDAL.transaction(async (tx) => {
      await resourceMetadataDAL.delete({ certificateId }, tx);
      await insertMetadataForCertificate(resourceMetadataDAL, {
        metadata,
        certificateId,
        orgId: actorOrgId,
        tx
      });
      return metadata;
    });

    return { metadata: updatedMetadata, projectId: certificate.projectId, commonName: certificate.commonName };
  };

  return {
    issueCertificateFromProfile,
    signCertificateFromProfile,
    orderCertificateFromProfile,
    renewCertificate,
    updateRenewalConfig,
    disableRenewalConfig,
    updateCertificateMetadata
  };
};
