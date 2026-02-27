import { ForbiddenError, subject } from "@casl/ability";
import { randomUUID } from "crypto";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TPkiAcmeAccountDALFactory } from "@app/ee/services/pki-acme/pki-acme-account-dal";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { CertKeyAlgorithm, CertSignatureAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { TCertificateIssuanceQueueFactory } from "@app/services/certificate-authority/certificate-issuance-queue";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType, IssuerType } from "@app/services/certificate-profile/certificate-profile-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";

import { CertExtendedKeyUsageType, CertKeyUsageType } from "../certificate-common/certificate-constants";
import {
  calculateFinalRenewBeforeDays,
  extractCertificateFromBuffer,
  generateSelfSignedCertificate,
  getEffectiveAlgorithms,
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
  normalizeDateForApi
} from "../certificate-common/certificate-utils";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TAltNameEntry, TCertificateIssuanceResponse } from "./certificate-v3-types";

export type TIssueCertificateFromApprovedRequestDeps = {
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  internalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa">;
  certificateDAL: Pick<TCertificateDALFactory, "findById" | "updateById" | "transaction" | "create">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  projectDAL: TProjectDALFactory;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateCertificateRequest" | "getPolicyById">;
  certificateIssuanceQueue: Pick<TCertificateIssuanceQueueFactory, "queueCertificateIssuance">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
};

export type TCertificateApprovalService = {
  issueCertificate: (certificateRequestId: string) => Promise<TCertificateIssuanceResponse>;
};

export const certificateApprovalServiceFactory = (
  deps: TIssueCertificateFromApprovedRequestDeps
): TCertificateApprovalService => {
  const {
    certificateRequestDAL,
    certificateProfileDAL,
    acmeAccountDAL,
    permissionService,
    certificateAuthorityDAL,
    internalCaService,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificatePolicyService,
    certificateIssuanceQueue,
    resourceMetadataDAL
  } = deps;

  const $validateProfileAndPermissions = async ({
    profileId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    requiredEnrollmentType,
    isInternal = false
  }: {
    profileId: string;
    actor?: ActorType;
    actorId?: string;
    actorAuthMethod?: ActorAuthMethod;
    actorOrgId?: string;
    requiredEnrollmentType: EnrollmentType;
    isInternal?: boolean;
  }) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (isInternal) {
      return profile;
    }

    if (profile.enrollmentType !== requiredEnrollmentType) {
      throw new ForbiddenRequestError({
        message: `Profile is not configured for ${requiredEnrollmentType} enrollment`
      });
    }

    if (
      (actor === ActorType.ACME_ACCOUNT && requiredEnrollmentType === EnrollmentType.ACME) ||
      (actor === ActorType.EST_ACCOUNT && requiredEnrollmentType === EnrollmentType.EST)
    ) {
      const account = await acmeAccountDAL.findById(actorId!);
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
      actor: actor!,
      actorId: actorId!,
      projectId: profile.projectId,
      actorAuthMethod: actorAuthMethod!,
      actorOrgId: actorOrgId!,
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

  const $createSelfSignedCertificateRecord = async ({
    selfSignedResult,
    certificateRequest,
    profile,
    tx
  }: {
    selfSignedResult: Awaited<ReturnType<typeof generateSelfSignedCertificate>>;
    certificateRequest: {
      commonName?: string;
      keyUsages?: CertKeyUsageType[];
      extendedKeyUsages?: CertExtendedKeyUsageType[];
    };
    profile?: { id: string; projectId: string } | null;
    tx: Parameters<TCertificateDALFactory["create"]>[1];
  }) => {
    const subjectCommonName =
      (selfSignedResult.certificateSubject.common_name as string) || certificateRequest.commonName || "";

    const altNamesList = selfSignedResult.subjectAlternativeNames.map((san) => san.value).join(",");

    const projectId = profile?.projectId;
    if (!projectId) {
      throw new BadRequestError({ message: "Project ID is required for certificate creation" });
    }

    return certificateDAL.create(
      {
        serialNumber: selfSignedResult.serialNumber,
        friendlyName: subjectCommonName,
        commonName: subjectCommonName,
        altNames: altNamesList,
        status: CertStatus.ACTIVE,
        notBefore: selfSignedResult.notBefore,
        notAfter: selfSignedResult.notAfter,
        projectId,
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages) || [],
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages) || [],
        profileId: profile?.id || null
      },
      tx
    );
  };

  const $createEncryptedCertificateData = async ({
    certificateId,
    certificate,
    privateKey,
    projectId,
    tx
  }: {
    certificateId: string;
    certificate: Buffer;
    privateKey: Buffer;
    projectId: string;
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

  const $processSelfSignedCertificate = async ({
    certificateRequest,
    policy,
    profile,
    effectiveAlgorithms,
    tx
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
    effectiveAlgorithms: {
      signatureAlgorithm: CertSignatureAlgorithm;
      keyAlgorithm: CertKeyAlgorithm;
    };
    tx: Parameters<TCertificateDALFactory["create"]>[1];
  }) => {
    const projectId = profile?.projectId;
    if (!projectId) {
      throw new BadRequestError({ message: "Project ID is required for certificate creation" });
    }

    const selfSignedResult = await generateSelfSignedCertificate({
      certificateRequest,
      policy,
      effectiveSignatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
      effectiveKeyAlgorithm: effectiveAlgorithms.keyAlgorithm
    });

    const certificateData = await $createSelfSignedCertificateRecord({
      selfSignedResult,
      certificateRequest,
      profile,
      tx
    });

    await certificateDAL.updateById(
      certificateData.id,
      {
        signatureAlgorithm: effectiveAlgorithms.signatureAlgorithm,
        keyAlgorithm: effectiveAlgorithms.keyAlgorithm
      },
      tx
    );

    await $createEncryptedCertificateData({
      certificateId: certificateData.id,
      certificate: selfSignedResult.certificate,
      privateKey: selfSignedResult.privateKey,
      projectId,
      tx
    });

    return {
      selfSignedResult,
      certificateData
    };
  };

  const $processCSRSigningRequest = async (
    certRequest: NonNullable<Awaited<ReturnType<TCertificateRequestDALFactory["findById"]>>>,
    certificateRequestId: string,
    profileId: string,
    ttl: string
  ): Promise<TCertificateIssuanceResponse> => {
    const { csr } = certRequest;

    const profile = await $validateProfileAndPermissions({
      profileId,
      requiredEnrollmentType: (certRequest.enrollmentType as EnrollmentType) || EnrollmentType.API,
      isInternal: true
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

    const { certificate, certificateChain, issuingCaCertificate, serialNumber, cert } =
      await certificateDAL.transaction(async (tx) => {
        const csrBasicConstraints = certRequest.basicConstraints as { isCA: boolean; pathLength?: number } | undefined;

        const certResult = await internalCaService.signCertFromCa({
          isInternal: true,
          caId: ca.id,
          csr: csr || "",
          ttl,
          altNames: undefined,
          notBefore: normalizeDateForApi(certRequest.notBefore || undefined),
          notAfter: normalizeDateForApi(certRequest.notAfter || undefined),
          signatureAlgorithm: certRequest.signatureAlgorithm || undefined,
          keyAlgorithm: certRequest.keyAlgorithm || undefined,
          isFromProfile: true,
          basicConstraints: csrBasicConstraints,
          pathLength: csrBasicConstraints?.pathLength,
          tx
        });

        const signedCertRecord = await certificateDAL.findById(certResult.certificateId, tx);
        if (!signedCertRecord) {
          throw new NotFoundError({ message: "Certificate was signed but could not be found in database" });
        }

        const finalRenewBeforeDays = calculateFinalRenewBeforeDays(profile, ttl, new Date(signedCertRecord.notAfter));

        const updateData: { profileId: string; renewBeforeDays?: number } = { profileId };
        if (finalRenewBeforeDays !== undefined) {
          updateData.renewBeforeDays = finalRenewBeforeDays;
        }
        await certificateDAL.updateById(signedCertRecord.id, updateData, tx);

        await certificateRequestDAL.updateById(
          certificateRequestId,
          {
            status: CertificateRequestStatus.ISSUED,
            certificateId: certResult.certificateId
          },
          tx
        );

        // Copy metadata from cert request to newly issued cert
        const certReqMetadata = await resourceMetadataDAL.find({ certificateRequestId });
        if (certReqMetadata.length > 0) {
          await resourceMetadataDAL.insertMany(
            certReqMetadata.map(({ key, value, orgId }) => ({
              key,
              value: value || "",
              certificateId: certResult.certificateId,
              orgId
            })),
            tx
          );
        }

        return { ...certResult, cert: signedCertRecord };
      });

    const certificateString = extractCertificateFromBuffer(certificate as unknown as Buffer);
    const certificateChainString = extractCertificateFromBuffer(certificateChain as unknown as Buffer);

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

  const $processExternalCARequest = async (
    certRequest: NonNullable<Awaited<ReturnType<TCertificateRequestDALFactory["findById"]>>>,
    certificateRequestId: string,
    profile: NonNullable<Awaited<ReturnType<TCertificateProfileDALFactory["findByIdWithConfigs"]>>>,
    altNames: TAltNameEntry[] | null,
    ttl: string
  ): Promise<TCertificateIssuanceResponse | null> => {
    if (!profile.caId) {
      return null;
    }

    const targetCa = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!targetCa) {
      return null;
    }

    const caType = (targetCa.externalCa?.type as CaType) ?? CaType.INTERNAL;

    if (caType !== CaType.ACME && caType !== CaType.AZURE_AD_CS && caType !== CaType.AWS_PCA) {
      return null;
    }

    const orderId = randomUUID();

    await certificateIssuanceQueue.queueCertificateIssuance({
      certificateId: orderId,
      profileId: profile.id,
      caId: profile.caId || "",
      ttl: ttl || "1y",
      signatureAlgorithm: certRequest.signatureAlgorithm || "",
      keyAlgorithm: certRequest.keyAlgorithm || "",
      commonName: certRequest.commonName || "",
      altNames: altNames?.map((san) => ({ type: san.type, value: san.value })) || [],
      keyUsages: certRequest.keyUsages || [],
      extendedKeyUsages: certRequest.extendedKeyUsages || [],
      certificateRequestId,
      csr: certRequest.csr || undefined,
      organization: certRequest.organization || undefined,
      organizationalUnit: certRequest.organizationalUnit || undefined,
      country: certRequest.country || undefined,
      state: certRequest.state || undefined,
      locality: certRequest.locality || undefined
    });

    return {
      status: CertificateRequestStatus.PENDING,
      certificate: "",
      issuingCaCertificate: "",
      certificateChain: "",
      serialNumber: "",
      certificateId: "",
      certificateRequestId,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: certRequest.commonName || ""
    };
  };

  const $processSelfSignedRequest = async (
    certificateRequestInput: {
      commonName?: string;
      keyUsages?: CertKeyUsageType[];
      extendedKeyUsages?: CertExtendedKeyUsageType[];
      altNames?: TAltNameEntry[];
      validity: { ttl: string };
      notBefore?: Date;
      notAfter?: Date;
      signatureAlgorithm?: string;
      keyAlgorithm?: string;
      organization?: string;
      organizationalUnit?: string;
      country?: string;
      state?: string;
      locality?: string;
      basicConstraints?: { isCA: boolean; pathLength?: number };
    },
    certificateRequestId: string,
    profile: NonNullable<Awaited<ReturnType<TCertificateProfileDALFactory["findByIdWithConfigs"]>>>,
    certPolicy: NonNullable<Awaited<ReturnType<TCertificatePolicyServiceFactory["getPolicyById"]>>>
  ): Promise<TCertificateIssuanceResponse> => {
    const effectiveSignatureAlgorithm = certificateRequestInput.signatureAlgorithm as
      | CertSignatureAlgorithm
      | undefined;
    const effectiveKeyAlgorithm = certificateRequestInput.keyAlgorithm as CertKeyAlgorithm | undefined;

    const result = await certificateDAL.transaction(async (tx) => {
      const effectiveAlgorithms = getEffectiveAlgorithms(effectiveSignatureAlgorithm, effectiveKeyAlgorithm);

      const processResult = await $processSelfSignedCertificate({
        certificateRequest: certificateRequestInput,
        policy: certPolicy,
        profile,
        effectiveAlgorithms,
        tx
      });

      await certificateRequestDAL.updateById(
        certificateRequestId,
        {
          status: CertificateRequestStatus.ISSUED,
          certificateId: processResult.certificateData.id
        },
        tx
      );

      // Copy metadata from cert request to newly issued cert
      const selfSignedReqMetadata = await resourceMetadataDAL.find({ certificateRequestId });
      if (selfSignedReqMetadata.length > 0) {
        await resourceMetadataDAL.insertMany(
          selfSignedReqMetadata.map(({ key, value, orgId }) => ({
            key,
            value: value || "",
            certificateId: processResult.certificateData.id,
            orgId
          })),
          tx
        );
      }

      const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
        profile,
        certificateRequestInput.validity.ttl,
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

      return processResult;
    });

    const { selfSignedResult, certificateData } = result;

    const subjectCommonName =
      (selfSignedResult.certificateSubject.common_name as string) ||
      certificateRequestInput.commonName ||
      "Self-signed Certificate";

    return {
      status: CertificateRequestStatus.ISSUED,
      certificate: selfSignedResult.certificate.toString("utf8"),
      issuingCaCertificate: "",
      certificateChain: selfSignedResult.certificate.toString("utf8"),
      privateKey: selfSignedResult.privateKey.toString("utf8"),
      serialNumber: selfSignedResult.serialNumber,
      certificateId: certificateData.id,
      certificateRequestId,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: subjectCommonName
    };
  };

  const $processCASignedRequest = async (
    certificateRequestInput: {
      commonName?: string;
      keyUsages?: CertKeyUsageType[];
      extendedKeyUsages?: CertExtendedKeyUsageType[];
      altNames?: TAltNameEntry[];
      validity: { ttl: string };
      notBefore?: Date;
      notAfter?: Date;
      signatureAlgorithm?: string;
      keyAlgorithm?: string;
      organization?: string;
      organizationalUnit?: string;
      country?: string;
      state?: string;
      locality?: string;
      basicConstraints?: { isCA: boolean; pathLength?: number };
    },
    certificateRequestId: string,
    profile: NonNullable<Awaited<ReturnType<TCertificateProfileDALFactory["findByIdWithConfigs"]>>>,
    certPolicy: NonNullable<Awaited<ReturnType<TCertificatePolicyServiceFactory["getPolicyById"]>>>
  ): Promise<TCertificateIssuanceResponse> => {
    if (!profile.caId) {
      throw new NotFoundError({ message: "Certificate Authority ID not found" });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    validateCaSupport(ca, "direct certificate issuance");
    validateAlgorithmCompatibility(ca, certPolicy);

    const effectiveSignatureAlgorithm = certificateRequestInput.signatureAlgorithm as
      | CertSignatureAlgorithm
      | undefined;
    const effectiveKeyAlgorithm = certificateRequestInput.keyAlgorithm as CertKeyAlgorithm | undefined;

    const certificateSubject = buildCertificateSubjectFromTemplate(certificateRequestInput, certPolicy?.subject);
    const subjectAlternativeNames = buildSubjectAlternativeNamesFromTemplate(
      { subjectAlternativeNames: certificateRequestInput.altNames },
      certPolicy?.sans
    );

    const { certificate, certificateChain, issuingCaCertificate, privateKey, serialNumber, cert } =
      await certificateDAL.transaction(async (tx) => {
        const certResult = await internalCaService.issueCertFromCa({
          caId: ca.id,
          friendlyName: certificateSubject.common_name || "Certificate",
          commonName: certificateSubject.common_name || "",
          altNames: subjectAlternativeNames,
          ttl: certificateRequestInput.validity.ttl,
          keyUsages: convertKeyUsageArrayToLegacy(certificateRequestInput.keyUsages) || [],
          extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequestInput.extendedKeyUsages) || [],
          notBefore: normalizeDateForApi(certificateRequestInput.notBefore),
          notAfter: normalizeDateForApi(certificateRequestInput.notAfter),
          signatureAlgorithm: effectiveSignatureAlgorithm,
          keyAlgorithm: effectiveKeyAlgorithm,
          actor: undefined,
          actorId: undefined,
          actorAuthMethod: undefined,
          actorOrgId: undefined,
          isFromProfile: true,
          internal: true,
          organization: certificateRequestInput.organization,
          country: certificateRequestInput.country,
          state: certificateRequestInput.state,
          locality: certificateRequestInput.locality,
          ou: certificateRequestInput.organizationalUnit,
          basicConstraints: certificateRequestInput.basicConstraints,
          pathLength: certificateRequestInput.basicConstraints?.pathLength,
          tx
        });

        const certificateRecord = await certificateDAL.findById(certResult.certificateId, tx);
        if (!certificateRecord) {
          throw new NotFoundError({ message: "Certificate was issued but could not be found in database" });
        }

        const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
          profile,
          certificateRequestInput.validity.ttl,
          new Date(certificateRecord.notAfter)
        );

        const updateData: { profileId: string; renewBeforeDays?: number } = { profileId: profile.id };
        if (finalRenewBeforeDays !== undefined) {
          updateData.renewBeforeDays = finalRenewBeforeDays;
        }
        await certificateDAL.updateById(certificateRecord.id, updateData, tx);

        await certificateRequestDAL.updateById(
          certificateRequestId,
          {
            status: CertificateRequestStatus.ISSUED,
            certificateId: certResult.certificateId
          },
          tx
        );

        // Copy metadata from cert request to newly issued cert
        const caSignedReqMetadata = await resourceMetadataDAL.find({ certificateRequestId });
        if (caSignedReqMetadata.length > 0) {
          await resourceMetadataDAL.insertMany(
            caSignedReqMetadata.map(({ key, value, orgId }) => ({
              key,
              value: value || "",
              certificateId: certResult.certificateId,
              orgId
            })),
            tx
          );
        }

        return { ...certResult, cert: certificateRecord };
      });

    const finalCertificateChain = bufferToString(certificateChain);

    return {
      status: CertificateRequestStatus.ISSUED,
      certificate: bufferToString(certificate),
      issuingCaCertificate: bufferToString(issuingCaCertificate),
      certificateChain: finalCertificateChain,
      privateKey: bufferToString(privateKey),
      serialNumber,
      certificateId: cert.id,
      certificateRequestId,
      projectId: profile.projectId,
      profileName: profile.slug,
      commonName: cert.commonName || ""
    };
  };

  const issueCertificate = async (certificateRequestId: string): Promise<TCertificateIssuanceResponse> => {
    const certRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    if (certRequest.status !== CertificateRequestStatus.PENDING) {
      throw new BadRequestError({
        message: `Certificate request is not in pending issuance state. Current status: ${certRequest.status}`
      });
    }

    const { profileId } = certRequest;
    if (!profileId) {
      throw new BadRequestError({ message: "Certificate request is missing profile ID" });
    }
    const { ttl } = certRequest;
    if (!ttl) {
      throw new BadRequestError({ message: "Certificate request is missing TTL" });
    }
    const altNames = certRequest.altNames as TAltNameEntry[] | null;

    await certificateRequestDAL.updateById(certificateRequestId, {
      status: CertificateRequestStatus.PENDING
    });

    try {
      const targetProfile = await $validateProfileAndPermissions({
        profileId,
        requiredEnrollmentType: (certRequest.enrollmentType as EnrollmentType) || EnrollmentType.API,
        isInternal: true
      });

      const externalCaResult = await $processExternalCARequest(
        certRequest,
        certificateRequestId,
        targetProfile,
        altNames,
        ttl
      );
      if (externalCaResult) {
        return externalCaResult;
      }

      if (certRequest.csr) {
        return await $processCSRSigningRequest(certRequest, certificateRequestId, profileId, ttl);
      }

      const basicConstraints = certRequest.basicConstraints as { isCA: boolean; pathLength?: number } | null;
      const certificateRequestInput = {
        commonName: certRequest.commonName || undefined,
        keyUsages: certRequest.keyUsages as CertKeyUsageType[] | undefined,
        extendedKeyUsages: certRequest.extendedKeyUsages as CertExtendedKeyUsageType[] | undefined,
        altNames: altNames || undefined,
        validity: { ttl },
        notBefore: certRequest.notBefore || undefined,
        notAfter: certRequest.notAfter || undefined,
        signatureAlgorithm: certRequest.signatureAlgorithm || undefined,
        keyAlgorithm: certRequest.keyAlgorithm || undefined,
        organization: certRequest.organization || undefined,
        organizationalUnit: certRequest.organizationalUnit || undefined,
        country: certRequest.country || undefined,
        state: certRequest.state || undefined,
        locality: certRequest.locality || undefined,
        basicConstraints: basicConstraints || undefined
      };

      // Validate against certificate policy
      const mappedCertificateRequest = mapEnumsForValidation({
        ...certificateRequestInput,
        subjectAlternativeNames: certificateRequestInput.altNames
      });

      const certPolicy = await certificatePolicyService.getPolicyById({
        actor: undefined,
        actorId: undefined,
        actorAuthMethod: undefined,
        actorOrgId: undefined,
        policyId: targetProfile.certificatePolicyId,
        internal: true
      });

      if (!certPolicy) {
        throw new NotFoundError({ message: "Certificate policy not found for this profile" });
      }

      const validationResult = await certificatePolicyService.validateCertificateRequest(
        targetProfile.certificatePolicyId,
        mappedCertificateRequest
      );

      if (!validationResult.isValid) {
        throw new BadRequestError({
          message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
        });
      }

      const issuerType = targetProfile?.issuerType || (targetProfile?.caId ? IssuerType.CA : IssuerType.SELF_SIGNED);

      if (issuerType === IssuerType.SELF_SIGNED) {
        return await $processSelfSignedRequest(
          certificateRequestInput,
          certificateRequestId,
          targetProfile,
          certPolicy
        );
      }

      return await $processCASignedRequest(certificateRequestInput, certificateRequestId, targetProfile, certPolicy);
    } catch (error) {
      await certificateRequestDAL.updateById(certificateRequestId, {
        status: CertificateRequestStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  return {
    issueCertificate
  };
};
