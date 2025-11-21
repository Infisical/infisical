import { ForbiddenError } from "@casl/ability";
import { randomUUID } from "crypto";
import RE2 from "re2";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TPkiAcmeAccountDALFactory } from "@app/ee/services/pki-acme/pki-acme-account-dal";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertificateOrderStatus,
  CertKeyAlgorithm,
  CertKeyType,
  CertKeyUsage,
  CertSignatureAlgorithm,
  CertStatus
} from "@app/services/certificate/certificate-types";
import {
  TCertificateAuthorityDALFactory,
  TCertificateAuthorityWithAssociatedCa
} from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateTemplateV2ServiceFactory } from "@app/services/certificate-template-v2/certificate-template-v2-service";

import { CertSubjectAlternativeNameType } from "../certificate-common/certificate-constants";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "../certificate-common/certificate-csr-utils";
import {
  bufferToString,
  buildCertificateSubjectFromTemplate,
  buildSubjectAlternativeNamesFromTemplate,
  convertExtendedKeyUsageArrayFromLegacy,
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayFromLegacy,
  convertKeyUsageArrayToLegacy,
  mapEnumsForValidation,
  normalizeDateForApi,
  removeRootCaFromChain
} from "../certificate-common/certificate-utils";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { addRenewedCertificateToSyncs, triggerAutoSyncForCertificate } from "../pki-sync/pki-sync-utils";
import {
  TCertificateFromProfileResponse,
  TCertificateOrderResponse,
  TDisableRenewalConfigDTO,
  TDisableRenewalResponse,
  TIssueCertificateFromProfileDTO,
  TOrderCertificateFromProfileDTO,
  TRenewalConfigResponse,
  TRenewCertificateDTO,
  TSignCertificateFromProfileDTO,
  TUpdateRenewalConfigDTO
} from "./certificate-v3-types";

type TCertificateV3ServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "findById" | "updateById" | "transaction">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById">;
  certificateTemplateV2Service: Pick<
    TCertificateTemplateV2ServiceFactory,
    "validateCertificateRequest" | "getTemplateV2ById"
  >;
  internalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findPkiSyncIdsByCertificateId" | "addCertificates" | "findByPkiSyncAndCertificate"
  >;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
};

export type TCertificateV3ServiceFactory = ReturnType<typeof certificateV3ServiceFactory>;

const validateProfileAndPermissions = async (
  profileId: string,
  actor: ActorType,
  actorId: string,
  actorAuthMethod: ActorAuthMethod,
  actorOrgId: string,
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">,
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById">,
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">,
  requiredEnrollmentType: EnrollmentType
) => {
  const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
  if (!profile) {
    throw new NotFoundError({ message: "Certificate profile not found" });
  }

  if (profile.enrollmentType !== requiredEnrollmentType) {
    throw new ForbiddenRequestError({
      message: `Profile is not configured for ${requiredEnrollmentType} enrollment`
    });
  }

  if (actor === ActorType.ACME_ACCOUNT && requiredEnrollmentType === EnrollmentType.ACME) {
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
    actorAuthMethod,
    actorOrgId,
    actionProjectType: ActionProjectType.CertificateManager
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionCertificateProfileActions.IssueCert,
    ProjectPermissionSub.CertificateProfiles
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
  const isConnectedExternalCa = caType === CaType.ACME || caType === CaType.AZURE_AD_CS;
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

const validateCaSupport = (ca: TCertificateAuthorityWithAssociatedCa, operation: string) => {
  const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
  if (caType !== CaType.INTERNAL) {
    throw new BadRequestError({ message: `Only internal CAs support ${operation}` });
  }
  return caType;
};

const validateAlgorithmCompatibility = (
  ca: TCertificateAuthorityWithAssociatedCa,
  template: {
    algorithms?: {
      signature?: string[];
    };
  }
) => {
  if (!template.algorithms?.signature || template.algorithms.signature.length === 0) {
    return;
  }

  const caKeyAlgorithm = ca.internalCa?.keyAlgorithm;
  if (!caKeyAlgorithm) {
    throw new BadRequestError({ message: "CA key algorithm not found" });
  }

  const compatibleAlgorithms =
    template.algorithms?.signature?.filter((sigAlg: string) => {
      const parts = sigAlg.split("-");
      if (parts.length === 0) {
        return false;
      }
      const keyType = parts[parts.length - 1];

      if (caKeyAlgorithm.startsWith("RSA")) {
        return keyType === CertKeyType.RSA;
      }

      if (caKeyAlgorithm.startsWith("EC")) {
        return keyType === CertKeyType.ECDSA;
      }

      return false;
    }) || [];

  if (compatibleAlgorithms.length === 0) {
    throw new BadRequestError({
      message: `Template signature algorithms (${template.algorithms?.signature?.join(", ") || "none"}) are not compatible with CA key algorithm (${caKeyAlgorithm})`
    });
  }
};

const extractCertificateFromBuffer = (certData: Buffer | { rawData: Buffer } | string): string => {
  if (typeof certData === "string") return certData;
  if (Buffer.isBuffer(certData)) return bufferToString(certData);
  if (certData && typeof certData === "object" && "rawData" in certData && Buffer.isBuffer(certData.rawData)) {
    return bufferToString(certData.rawData);
  }
  return bufferToString(certData as unknown as Buffer);
};

const parseKeyUsages = (keyUsages: unknown): CertKeyUsage[] => {
  if (!keyUsages) return [];
  if (Array.isArray(keyUsages)) return keyUsages as CertKeyUsage[];
  return (keyUsages as string).split(",").map((usage) => usage.trim() as CertKeyUsage);
};

const parseExtendedKeyUsages = (extendedKeyUsages: unknown): CertExtendedKeyUsage[] => {
  if (!extendedKeyUsages) return [];
  if (Array.isArray(extendedKeyUsages)) return extendedKeyUsages as CertExtendedKeyUsage[];
  return (extendedKeyUsages as string).split(",").map((usage) => usage.trim() as CertExtendedKeyUsage);
};

const isValidRenewalTiming = (renewBeforeDays: number, certificateExpiryDate: Date): boolean => {
  const renewalDate = new Date(certificateExpiryDate.getTime() - renewBeforeDays * 24 * 60 * 60 * 1000);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return renewalDate >= tomorrow;
};

const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (!profileRenewBeforeDays) {
    return undefined;
  }

  if (certificateTtlInDays > profileRenewBeforeDays) {
    return profileRenewBeforeDays;
  }

  return Math.max(1, certificateTtlInDays - 1);
};

const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const numValue = parseInt(value, 10);

  switch (unit) {
    case "d":
      return numValue;
    case "h":
      return Math.ceil(numValue / 24);
    case "m":
      return Math.ceil(numValue / (24 * 60));
    default:
      throw new BadRequestError({ message: `Unsupported TTL unit: ${unit}` });
  }
};

const calculateFinalRenewBeforeDays = (
  profile: { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } },
  ttl: string,
  certificateExpiryDate: Date
): number | undefined => {
  if (!profile.apiConfig?.autoRenew || !profile.apiConfig.renewBeforeDays) {
    return undefined;
  }

  const certificateTtlInDays = parseTtlToDays(ttl);
  const renewBeforeDays = calculateRenewalThreshold(profile.apiConfig.renewBeforeDays, certificateTtlInDays);

  if (!renewBeforeDays) {
    return undefined;
  }

  return isValidRenewalTiming(renewBeforeDays, certificateExpiryDate) ? renewBeforeDays : undefined;
};

export const certificateV3ServiceFactory = ({
  certificateDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  acmeAccountDAL,
  certificateTemplateV2Service,
  internalCaService,
  permissionService,
  certificateSyncDAL,
  pkiSyncDAL,
  pkiSyncQueue
}: TCertificateV3ServiceFactoryDep) => {
  const issueCertificateFromProfile = async ({
    profileId,
    certificateRequest,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    removeRootsFromChain
  }: TIssueCertificateFromProfileDTO): Promise<TCertificateFromProfileResponse> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      EnrollmentType.API
    );

    if (certificateRequest.commonName && Array.isArray(certificateRequest.commonName)) {
      throw new BadRequestError({
        message: "Common Name must be a single value, not an array"
      });
    }

    const mappedCertificateRequest = mapEnumsForValidation({
      ...certificateRequest,
      subjectAlternativeNames: certificateRequest.altNames
    });

    const template = await certificateTemplateV2Service.getTemplateV2ById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      templateId: profile.certificateTemplateId,
      internal: true
    });
    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found for this profile" });
    }

    const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
      profile.certificateTemplateId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "direct certificate issuance");

    validateAlgorithmCompatibility(ca, template);

    const effectiveSignatureAlgorithm = certificateRequest.signatureAlgorithm as CertSignatureAlgorithm | undefined;
    const effectiveKeyAlgorithm = certificateRequest.keyAlgorithm as CertKeyAlgorithm | undefined;

    if (template.algorithms?.keyAlgorithm && !effectiveKeyAlgorithm) {
      throw new BadRequestError({
        message: "Key algorithm is required by template policy but not provided in request"
      });
    }

    if (template.algorithms?.signature && !effectiveSignatureAlgorithm) {
      throw new BadRequestError({
        message: "Signature algorithm is required by template policy but not provided in request"
      });
    }

    const certificateSubject = buildCertificateSubjectFromTemplate(certificateRequest, template.subject);
    const subjectAlternativeNames = buildSubjectAlternativeNamesFromTemplate(
      { subjectAlternativeNames: certificateRequest.altNames },
      template.sans
    );

    const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber } =
      await internalCaService.issueCertFromCa({
        caId: ca.id,
        friendlyName: certificateSubject.common_name || "Certificate",
        commonName: certificateSubject.common_name || "",
        altNames: subjectAlternativeNames,
        ttl: certificateRequest.validity.ttl,
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || [],
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || [],
        notBefore: normalizeDateForApi(certificateRequest.notBefore),
        notAfter: normalizeDateForApi(certificateRequest.notAfter),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        isFromProfile: true
      });

    const cert = await certificateDAL.findOne({ serialNumber, caId: ca.id });
    if (!cert) {
      throw new NotFoundError({ message: "Certificate was issued but could not be found in database" });
    }

    const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
      profile,
      certificateRequest.validity.ttl,
      new Date(cert.notAfter)
    );

    await certificateDAL.updateById(cert.id, {
      profileId,
      renewBeforeDays: finalRenewBeforeDays
    });

    let finalCertificateChain = bufferToString(certificateChain);
    if (removeRootsFromChain) {
      finalCertificateChain = removeRootCaFromChain(finalCertificateChain);
    }

    return {
      certificate: bufferToString(certificate),
      issuingCaCertificate: bufferToString(issuingCaCertificate),
      certificateChain: finalCertificateChain,
      privateKey: bufferToString(privateKey),
      serialNumber,
      certificateId: cert.id,
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
    removeRootsFromChain,
    allowEmptyCommonName
  }: TSignCertificateFromProfileDTO): Promise<Omit<TCertificateFromProfileResponse, "privateKey">> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      enrollmentType
    );

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "CSR signing");

    const template = await certificateTemplateV2Service.getTemplateV2ById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      templateId: profile.certificateTemplateId,
      internal: true
    });

    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found for this profile" });
    }

    const certificateRequest = extractCertificateRequestFromCSR(csr);
    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);

    const { keyAlgorithm: extractedKeyAlgorithm, signatureAlgorithm: extractedSignatureAlgorithm } =
      extractAlgorithmsFromCSR(csr);

    mappedCertificateRequest.keyAlgorithm = extractedKeyAlgorithm;
    mappedCertificateRequest.signatureAlgorithm = extractedSignatureAlgorithm;
    mappedCertificateRequest.validity = validity;

    const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
      profile.certificateTemplateId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    validateAlgorithmCompatibility(ca, template);

    const effectiveSignatureAlgorithm = extractedSignatureAlgorithm;
    const effectiveKeyAlgorithm = extractedKeyAlgorithm;

    const { certificate, certificateChain, issuingCaCertificate, serialNumber } =
      await internalCaService.signCertFromCa({
        isInternal: true,
        caId: ca.id,
        csr,
        ttl: validity.ttl,
        altNames: undefined,
        notBefore: normalizeDateForApi(notBefore),
        notAfter: normalizeDateForApi(notAfter),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        isFromProfile: true,
        allowEmptyCommonName
      });

    const cert = await certificateDAL.findOne({ serialNumber, caId: ca.id });
    if (!cert) {
      throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
    }

    const finalRenewBeforeDays = calculateFinalRenewBeforeDays(profile, validity.ttl, new Date(cert.notAfter));

    await certificateDAL.updateById(cert.id, {
      profileId,
      renewBeforeDays: finalRenewBeforeDays
    });

    const certificateString = extractCertificateFromBuffer(certificate as unknown as Buffer);
    let certificateChainString = extractCertificateFromBuffer(certificateChain as unknown as Buffer);
    if (removeRootsFromChain) {
      certificateChainString = removeRootCaFromChain(certificateChainString);
    }

    return {
      certificate: certificateString,
      issuingCaCertificate: extractCertificateFromBuffer(issuingCaCertificate as unknown as Buffer),
      certificateChain: certificateChainString,
      serialNumber,
      certificateId: cert.id,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: cert.commonName || ""
    };
  };

  const orderCertificateFromProfile = async ({
    profileId,
    certificateOrder,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    removeRootsFromChain
  }: TOrderCertificateFromProfileDTO): Promise<TCertificateOrderResponse> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      acmeAccountDAL,
      permissionService,
      EnrollmentType.API
    );

    const certificateRequest = {
      commonName: certificateOrder.commonName,
      keyUsages: certificateOrder.keyUsages,
      extendedKeyUsages: certificateOrder.extendedKeyUsages,
      subjectAlternativeNames: certificateOrder.altNames.map((san) => ({
        type: san.type === "dns" ? CertSubjectAlternativeNameType.DNS_NAME : CertSubjectAlternativeNameType.IP_ADDRESS,
        value: san.value
      })),
      validity: certificateOrder.validity,
      notBefore: certificateOrder.notBefore,
      notAfter: certificateOrder.notAfter,
      signatureAlgorithm: certificateOrder.signatureAlgorithm,
      keyAlgorithm: certificateOrder.keyAlgorithm
    };

    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);
    const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
      profile.certificateTemplateId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate order validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;

    if (caType === CaType.INTERNAL) {
      const certificateResult = await issueCertificateFromProfile({
        profileId,
        certificateRequest,
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        removeRootsFromChain
      });

      const orderId = randomUUID();

      return {
        orderId,
        status: CertificateOrderStatus.VALID,
        subjectAlternativeNames: certificateOrder.altNames.map((san) => ({
          type: san.type,
          value: san.value,
          status: CertificateOrderStatus.VALID
        })),
        authorizations: [],
        finalize: `/api/v3/pki/certificates/orders/${orderId}/completed`,
        certificate: certificateResult.certificate,
        projectId: certificateResult.projectId,
        profileName: certificateResult.profileName
      };
    }

    if (caType === CaType.ACME) {
      throw new BadRequestError({
        message: "ACME certificate ordering via profiles is not yet implemented."
      });
    }

    throw new BadRequestError({
      message: `Certificate ordering is not supported for CA type: ${caType}`
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
  }: TRenewCertificateDTO & { internal?: boolean }): Promise<TCertificateFromProfileResponse> => {
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

      const originalSignatureAlgorithm = originalCert.signatureAlgorithm as CertSignatureAlgorithm;
      const originalKeyAlgorithm = originalCert.keyAlgorithm as CertKeyAlgorithm;

      if (!originalSignatureAlgorithm || !originalKeyAlgorithm) {
        throw new BadRequestError({
          message:
            "Original certificate does not have algorithm information stored. Cannot renew certificate issued before algorithm tracking was implemented."
        });
      }

      const profile = await certificateProfileDAL.findByIdWithConfigs(originalCert.profileId);
      if (!profile) {
        throw new NotFoundError({ message: "Certificate profile not found" });
      }

      if (profile.enrollmentType !== EnrollmentType.API) {
        throw new ForbiddenRequestError({
          message: "Certificate is not eligible for renewal: EST certificates cannot be renewed through this endpoint"
        });
      }

      const certificateSecret = await certificateSecretDAL.findOne({ certId: originalCert.id }, tx);
      if (!certificateSecret) {
        throw new ForbiddenRequestError({
          message:
            "Certificate is not eligible for renewal: certificates issued from CSR (external private key) cannot be renewed"
        });
      }

      if (!internal) {
        const { permission } = await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId: profile.projectId,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.CertificateManager
        });

        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateProfileActions.IssueCert,
          ProjectPermissionSub.CertificateProfiles
        );
      }

      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
      if (!ca) {
        throw new NotFoundError({ message: "Certificate Authority not found" });
      }

      const eligibilityCheck = validateRenewalEligibility(originalCert, ca);
      if (!eligibilityCheck.isEligible) {
        await certificateDAL.updateById(originalCert.id, {
          renewalError: `Certificate is not eligible for renewal: ${eligibilityCheck.errors.join(", ")}`
        });
        throw new BadRequestError({
          message: `Certificate is not eligible for renewal: ${eligibilityCheck.errors.join(", ")}`
        });
      }

      validateCaSupport(ca, "direct certificate issuance");

      const template = await certificateTemplateV2Service.getTemplateV2ById({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        templateId: profile.certificateTemplateId,
        internal
      });

      if (!template) {
        throw new NotFoundError({ message: "Certificate template not found for this profile" });
      }

      const originalTtlInDays = Math.ceil(
        (new Date(originalCert.notAfter).getTime() - new Date(originalCert.notBefore).getTime()) / (1000 * 60 * 60 * 24)
      );
      const ttl = `${originalTtlInDays}d`;

      const certificateRequest = {
        commonName: originalCert.commonName || undefined,
        keyUsages: convertKeyUsageArrayFromLegacy(parseKeyUsages(originalCert.keyUsages)),
        extendedKeyUsages: convertExtendedKeyUsageArrayFromLegacy(
          parseExtendedKeyUsages(originalCert.extendedKeyUsages)
        ),
        subjectAlternativeNames: originalCert.altNames
          ? originalCert.altNames.split(",").map((san) => {
              const trimmed = san.trim();

              const isIpv4 = new RE2("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$").test(trimmed);
              const isIpv6 = new RE2("^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$").test(trimmed);
              if (isIpv4 || isIpv6) {
                return {
                  type: CertSubjectAlternativeNameType.IP_ADDRESS,
                  value: trimmed
                };
              }

              if (new RE2("^[^@]+@[^@]+\\.[^@]+$").test(trimmed)) {
                return {
                  type: CertSubjectAlternativeNameType.EMAIL,
                  value: trimmed
                };
              }

              if (new RE2("^[a-zA-Z][a-zA-Z0-9+.-]*:").test(trimmed)) {
                return {
                  type: CertSubjectAlternativeNameType.URI,
                  value: trimmed
                };
              }

              return {
                type: CertSubjectAlternativeNameType.DNS_NAME,
                value: trimmed
              };
            })
          : [],
        validity: {
          ttl
        },
        signatureAlgorithm: originalCert.signatureAlgorithm || undefined,
        keyAlgorithm: originalCert.keyAlgorithm || undefined
      };

      const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
        profile.certificateTemplateId,
        certificateRequest
      );

      if (!validationResult.isValid) {
        await certificateDAL.updateById(originalCert.id, {
          renewalError: `Template validation failed: ${validationResult.errors.join(", ")}`
        });

        throw new BadRequestError({
          message: `Certificate renewal failed. Errors: ${validationResult.errors.join(", ")}`
        });
      }

      validateAlgorithmCompatibility(ca, template);
      const notBefore = new Date();
      const notAfter = new Date(Date.now() + parseTtlToDays(ttl) * 24 * 60 * 60 * 1000);

      const finalRenewBeforeDays = calculateFinalRenewBeforeDays(profile, ttl, notAfter);

      const { certificate, certificateChain, issuingCaCertificate, serialNumber } =
        await internalCaService.issueCertFromCa({
          caId: ca.id,
          friendlyName: originalCert.friendlyName || originalCert.commonName || "Renewed Certificate",
          commonName: originalCert.commonName || "",
          altNames: originalCert.altNames || "",
          ttl,
          notBefore: normalizeDateForApi(notBefore),
          notAfter: normalizeDateForApi(notAfter),
          keyUsages: parseKeyUsages(originalCert.keyUsages),
          extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages),
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

      const newCert = await certificateDAL.findOne({ serialNumber, caId: ca.id }, tx);
      if (!newCert) {
        throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
      }

      await certificateDAL.updateById(
        newCert.id,
        {
          profileId: originalCert.profileId,
          renewBeforeDays: finalRenewBeforeDays,
          renewedFromCertificateId: originalCert.id
        },
        tx
      );

      await certificateDAL.updateById(
        originalCert.id,
        {
          renewedByCertificateId: newCert.id,
          renewalError: null
        },
        tx
      );

      await addRenewedCertificateToSyncs(originalCert.id, newCert.id, { certificateSyncDAL }, tx);

      return {
        certificate,
        certificateChain,
        issuingCaCertificate,
        serialNumber,
        newCert,
        originalCert,
        profile
      };
    });

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
      certificate: renewalResult.certificate,
      issuingCaCertificate: renewalResult.issuingCaCertificate,
      certificateChain: finalCertificateChain,
      serialNumber: renewalResult.serialNumber,
      certificateId: renewalResult.newCert.id,
      projectId: renewalResult.profile.projectId,
      profileName: renewalResult.profile.slug,
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
      ProjectPermissionSub.Certificates
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

    await certificateDAL.updateById(certificateId, {
      renewBeforeDays
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
      ProjectPermissionSub.Certificates
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

    await certificateDAL.updateById(certificateId, {
      renewBeforeDays: null
    });

    return {
      projectId: certificate.projectId,
      commonName: certificate.commonName || ""
    };
  };

  return {
    issueCertificateFromProfile,
    signCertificateFromProfile,
    orderCertificateFromProfile,
    renewCertificate,
    updateRenewalConfig,
    disableRenewalConfig
  };
};
