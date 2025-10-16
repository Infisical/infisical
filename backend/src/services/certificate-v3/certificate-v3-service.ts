import { ForbiddenError } from "@casl/ability";
import { randomUUID } from "crypto";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertificateOrderStatus } from "@app/services/certificate/certificate-types";
import {
  TCertificateAuthorityDALFactory,
  TCertificateAuthorityWithAssociatedCa
} from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateTemplateV2ServiceFactory } from "@app/services/certificate-template-v2/certificate-template-v2-service";

import { CertSubjectAlternativeNameType } from "../certificate-common/certificate-constants";
import {
  bufferToString,
  buildCertificateSubjectFromTemplate,
  buildSubjectAlternativeNamesFromTemplate,
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy,
  mapEnumsForValidation,
  normalizeDateForApi
} from "../certificate-common/certificate-utils";
import {
  TCertificateFromProfileResponse,
  TCertificateOrderResponse,
  TIssueCertificateFromProfileDTO,
  TOrderCertificateFromProfileDTO,
  TSignCertificateFromProfileDTO
} from "./certificate-v3-types";

type TCertificateV3ServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "updateById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  certificateTemplateV2Service: Pick<
    TCertificateTemplateV2ServiceFactory,
    "validateCertificateRequest" | "getTemplateV2ById"
  >;
  internalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateV3ServiceFactory = ReturnType<typeof certificateV3ServiceFactory>;

const validateProfileAndPermissions = async (
  profileId: string,
  actor: ActorType,
  actorId: string,
  actorAuthMethod: ActorAuthMethod,
  actorOrgId: string,
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">,
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

  const compatibleAlgorithms = template.algorithms.signature.filter((sigAlg: string) => {
    const parts = sigAlg.split("-");
    const keyType = parts[parts.length - 1];

    if (caKeyAlgorithm.startsWith("RSA")) {
      return keyType === "RSA";
    }

    if (caKeyAlgorithm.startsWith("EC")) {
      return keyType === "ECDSA";
    }

    return false;
  });

  if (compatibleAlgorithms.length === 0) {
    throw new BadRequestError({
      message: `Template signature algorithms (${template.algorithms.signature.join(", ")}) are not compatible with CA key algorithm (${caKeyAlgorithm})`
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

export const certificateV3ServiceFactory = ({
  certificateDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  certificateTemplateV2Service,
  internalCaService,
  permissionService
}: TCertificateV3ServiceFactoryDep) => {
  const issueCertificateFromProfile = async ({
    profileId,
    certificateRequest,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIssueCertificateFromProfileDTO): Promise<TCertificateFromProfileResponse> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
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

    if (!actorAuthMethod) {
      throw new BadRequestError({ message: "Authentication method is required for certificate issuance" });
    }

    const template = await certificateTemplateV2Service.getTemplateV2ById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      templateId: profile.certificateTemplateId
    });

    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found for this profile" });
    }

    validateAlgorithmCompatibility(ca, template);

    const effectiveSignatureAlgorithm = certificateRequest.signatureAlgorithm;
    const effectiveKeyAlgorithm = certificateRequest.keyAlgorithm;

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
        actorOrgId
      });

    const cert = await certificateDAL.findOne({ serialNumber, caId: ca.id });
    if (!cert) {
      throw new NotFoundError({ message: "Certificate was issued but could not be found in database" });
    }

    await certificateDAL.updateById(cert.id, { profileId });

    return {
      certificate: bufferToString(certificate),
      issuingCaCertificate: bufferToString(issuingCaCertificate),
      certificateChain: bufferToString(certificateChain),
      privateKey: bufferToString(privateKey),
      serialNumber,
      certificateId: cert.id,
      projectId: profile.projectId,
      profileName: profile.slug
    };
  };

  const signCertificateFromProfile = async ({
    profileId,
    csr,
    validity,
    notBefore,
    notAfter,
    signatureAlgorithm,
    keyAlgorithm,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSignCertificateFromProfileDTO): Promise<Omit<TCertificateFromProfileResponse, "privateKey">> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
      permissionService,
      EnrollmentType.API
    );

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "CSR signing");

    if (!actorAuthMethod) {
      throw new BadRequestError({ message: "Authentication method is required for certificate signing" });
    }

    const template = await certificateTemplateV2Service.getTemplateV2ById({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      templateId: profile.certificateTemplateId
    });

    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found for this profile" });
    }

    validateAlgorithmCompatibility(ca, template);

    const effectiveSignatureAlgorithm = signatureAlgorithm;
    const effectiveKeyAlgorithm = keyAlgorithm;

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

    const { certificate, certificateChain, issuingCaCertificate, serialNumber } =
      await internalCaService.signCertFromCa({
        isInternal: true,
        caId: ca.id,
        csr,
        ttl: validity.ttl,
        altNames: "",
        notBefore: normalizeDateForApi(notBefore),
        notAfter: normalizeDateForApi(notAfter),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm
      });

    const cert = await certificateDAL.findOne({ serialNumber, caId: ca.id });
    if (!cert) {
      throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
    }

    await certificateDAL.updateById(cert.id, { profileId });

    const certificateString = extractCertificateFromBuffer(certificate as unknown as Buffer);
    const certificateChainString = extractCertificateFromBuffer(certificateChain as unknown as Buffer);

    return {
      certificate: certificateString,
      issuingCaCertificate: extractCertificateFromBuffer(issuingCaCertificate as unknown as Buffer),
      certificateChain: certificateChainString,
      serialNumber,
      certificateId: cert.id,
      projectId: profile.projectId,
      profileName: profile.slug
    };
  };

  const orderCertificateFromProfile = async ({
    profileId,
    certificateOrder,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TOrderCertificateFromProfileDTO): Promise<TCertificateOrderResponse> => {
    const profile = await validateProfileAndPermissions(
      profileId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      certificateProfileDAL,
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
        actorOrgId
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
        finalize: `/api/v3/certificates/orders/${orderId}/completed`,
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

  return {
    issueCertificateFromProfile,
    signCertificateFromProfile,
    orderCertificateFromProfile
  };
};
