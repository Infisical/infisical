import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { randomBytes } from "crypto";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { getCaCertChain } from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateIssuanceQueueFactory } from "@app/services/certificate-authority/certificate-issuance-queue";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "@app/services/certificate-common/certificate-csr-utils";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateRequestServiceFactory } from "@app/services/certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { resolveEffectiveTtl } from "@app/services/certificate-v3/certificate-v3-fns";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { convertRawCertsToPkcs7 } from "../certificate-est/certificate-est-fns";
import { TLicenseServiceFactory } from "../license/license-service";
import { getScepChallengeValidator, ScepChallengeType } from "./challenge";
import { TScepDynamicChallengeDALFactory } from "./pki-scep-dynamic-challenge-dal";
import { getScepCapabilities, isSignerCertIssuedByCa } from "./pki-scep-fns";
import { buildCertRepFailure, buildCertRepPending, buildCertRepSuccess } from "./pki-scep-message-builder";
import { parseScepMessage } from "./pki-scep-message-parser";
import { TScepTransactionDALFactory } from "./pki-scep-transaction-dal";
import {
  ScepFailInfo,
  ScepMessageType,
  TGenerateDynamicChallengeDTO,
  TGetCaCapsDTO,
  TGetCaCertDTO,
  THandlePkiOperationDTO,
  TParsedScepMessage
} from "./pki-scep-types";

type TPkiScepServiceFactoryDep = {
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "findById">;
  scepDynamicChallengeDAL: TScepDynamicChallengeDALFactory;
  scepTransactionDAL: TScepTransactionDALFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "findById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateCertificateRequest">;
  certificateRequestService: Pick<TCertificateRequestServiceFactory, "createCertificateRequest">;
  certificateIssuanceQueue: Pick<TCertificateIssuanceQueueFactory, "queueCertificateIssuance">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiScepServiceFactory = ReturnType<typeof pkiScepServiceFactory>;

const SCEP_TRANSACTION_EXPIRY_HOURS = 24;

export const pkiScepServiceFactory = ({
  certificateV3Service,
  certificateProfileDAL,
  scepEnrollmentConfigDAL,
  scepDynamicChallengeDAL,
  scepTransactionDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateRequestDAL,
  certificateBodyDAL,
  projectDAL,
  kmsService,
  licenseService,
  certificatePolicyDAL,
  certificatePolicyService,
  certificateRequestService,
  certificateIssuanceQueue,
  auditLogService,
  permissionService
}: TPkiScepServiceFactoryDep) => {
  const loadScepContext = async (profileId: string) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.SCEP) {
      throw new BadRequestError({ message: "Profile is not configured for SCEP enrollment" });
    }

    if (!profile.scepConfigId) {
      throw new BadRequestError({ message: "SCEP enrollment not configured for this profile" });
    }

    if (!profile.caId) {
      throw new BadRequestError({ message: "SCEP enrollment requires a Certificate Authority" });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }
    const caType: CaType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;

    const scepConfig = await scepEnrollmentConfigDAL.findById(profile.scepConfigId);
    if (!scepConfig) {
      throw new NotFoundError({ message: "SCEP configuration not found" });
    }

    const project = await projectDAL.findOne({ id: profile.projectId });
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.pkiScep) {
      throw new BadRequestError({
        message: "Failed to perform SCEP operation due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: profile.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
    const raPrivateKeyDer = await kmsDecryptor({ cipherTextBlob: scepConfig.encryptedRaPrivateKey });

    const raCert = new x509.X509Certificate(scepConfig.raCertificate);
    const raCertDer = Buffer.from(raCert.rawData);

    return { profile, scepConfig, project, ca, caType, raPrivateKeyDer, raCertDer } as const;
  };

  const getCaCaps = async ({ profileId }: TGetCaCapsDTO): Promise<string> => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile || profile.enrollmentType !== EnrollmentType.SCEP) {
      throw new NotFoundError({ message: "SCEP profile not found" });
    }

    return getScepCapabilities({
      allowCertBasedRenewal: profile.scepConfig?.allowCertBasedRenewal ?? false
    });
  };

  const getCaCert = async ({ profileId }: TGetCaCertDTO): Promise<Buffer> => {
    const { scepConfig, ca, caType } = await loadScepContext(profileId);

    const raCert = new x509.X509Certificate(scepConfig.raCertificate);
    const rawCerts: ArrayBuffer[] = [raCert.rawData];

    // For internal CAs, include the CA certificate chain if configured.
    // External CAs don't have a local CA chain, so only the RA cert is returned.
    if (caType === CaType.INTERNAL && scepConfig.includeCaCertInResponse && ca?.internalCa?.activeCaCertId) {
      const { caCert, caCertChain } = await getCaCertChain({
        caCertId: ca.internalCa.activeCaCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      });

      const caCertObj = new x509.X509Certificate(caCert);
      rawCerts.push(caCertObj.rawData);

      if (caCertChain) {
        const chainCerts = extractX509CertFromChain(caCertChain);
        for (const cert of chainCerts) {
          rawCerts.push(new x509.X509Certificate(cert).rawData);
        }
      }
    }

    const base64Pkcs7 = convertRawCertsToPkcs7(rawCerts);
    return Buffer.from(base64Pkcs7, "base64");
  };

  type TScepContext = Awaited<ReturnType<typeof loadScepContext>>;

  const derToPem = (der: Buffer, label: string): string => {
    return x509.PemConverter.encode(der, label);
  };

  const resolveIssuanceParams = async (profile: TScepContext["profile"]) => {
    const policy = profile.certificatePolicyId
      ? await certificatePolicyDAL.findById(profile.certificatePolicyId)
      : null;
    const ttl = resolveEffectiveTtl({
      requestTtl: undefined,
      profileDefaultTtlDays: profile.defaults?.ttlDays,
      policyMaxValidity: policy?.validity?.max,
      flowDefaultTtl: "90d"
    });
    return { ttl };
  };

  const handlePkiOperation = async ({ profileId, message, clientIp }: THandlePkiOperationDTO): Promise<Buffer> => {
    const { profile, scepConfig, project, caType, raPrivateKeyDer, raCertDer } = await loadScepContext(profileId);

    const parsed = parseScepMessage(message, raPrivateKeyDer);

    switch (parsed.messageType) {
      case ScepMessageType.PKCSReq:
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return handleEnrollment({
          profile,
          scepConfig,
          project,
          caType,
          raPrivateKeyDer,
          raCertDer,
          parsed,
          clientIp
        });

      case ScepMessageType.RenewalReq:
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return handleRenewal({
          profile,
          scepConfig,
          project,
          caType,
          raPrivateKeyDer,
          raCertDer,
          parsed,
          clientIp
        });

      case ScepMessageType.GetCertInitial:
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return handleGetCertInitial({
          profile,
          raPrivateKeyDer,
          raCertDer,
          parsed
        });

      default:
        throw new BadRequestError({ message: `Unsupported SCEP message type: ${parsed.messageType}` });
    }
  };

  const handleEnrollment = async ({
    profile,
    scepConfig,
    project,
    caType,
    raPrivateKeyDer,
    raCertDer,
    parsed,
    clientIp
  }: {
    profile: TScepContext["profile"];
    scepConfig: TScepContext["scepConfig"];
    project: TScepContext["project"];
    caType: CaType;
    raPrivateKeyDer: Buffer;
    raCertDer: Buffer;
    parsed: TParsedScepMessage;
    clientIp: string;
  }): Promise<Buffer> => {
    if (!parsed.csr) {
      throw new BadRequestError({ message: "No CSR found in SCEP enrollment request" });
    }

    const csrObj = new x509.Pkcs10CertificateRequest(parsed.csr);
    const challengePasswordOid = "1.2.840.113549.1.9.7"; // PKCS#9 challengePassword
    const challengeAttr = csrObj.attributes.find((attr) => attr.type === challengePasswordOid);

    let challengePassword = "";
    if (challengeAttr && challengeAttr.values && challengeAttr.values.length > 0) {
      // The challengePassword is typically a UTF8String or PrintableString
      // @peculiar/x509 returns ASN.1 ArrayBuffer values
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const raw = challengeAttr.values[0] as any;
      if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
        // The value is DER-encoded ASN.1 string
        // Strip the tag+length to get the actual string bytes
        const buf = Buffer.from(raw);
        // ASN.1 string: tag (1 byte) + length (1+ bytes) + value
        let offset = 1; // skip tag
        // eslint-disable-next-line no-bitwise
        if (buf[offset] & 0x80) {
          // eslint-disable-next-line no-bitwise
          const numLenBytes = buf[offset] & 0x7f;
          offset += 1 + numLenBytes;
        } else {
          offset += 1;
        }
        challengePassword = buf.subarray(offset).toString("utf-8");
      } else if (typeof raw === "string") {
        challengePassword = raw;
      } else {
        challengePassword = String(raw);
      }
    }

    const challengeValidator = getScepChallengeValidator(scepConfig.challengeType as ScepChallengeType, {
      scepEnrollmentConfigDAL,
      scepDynamicChallengeDAL
    });
    const isValid = await challengeValidator.validate(challengePassword, scepConfig.id);

    if (!isValid) {
      // Many SCEP clients (including sscep) send PKCSReq for both initial enrollment
      // and renewal — they don't use RenewalReq (messageType=17). Detect renewal by
      // checking if the signer cert chains to the profile CA.
      // Cert-based renewal requires the CA chain for verification, so it's only
      // supported for internal CAs (not external CAs).
      if (scepConfig.allowCertBasedRenewal && caType === CaType.INTERNAL) {
        const isRenewalViaPKCSReq = await isSignerCertIssuedByCa({
          signerCertDer: parsed.signerCertDer,
          caId: profile.caId!,
          certificateAuthorityCertDAL,
          certificateAuthorityDAL,
          projectDAL,
          kmsService
        });
        if (isRenewalViaPKCSReq) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          return handleRenewal({
            profile,
            scepConfig,
            project,
            caType,
            raPrivateKeyDer,
            raCertDer,
            parsed,
            clientIp
          });
        }
      }

      void auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: {
          type: ActorType.SCEP_ACCOUNT,
          metadata: { profileId: profile.id }
        },
        event: {
          type: EventType.SCEP_ENROLLMENT,
          metadata: {
            profileId: profile.id,
            profileSlug: profile.slug,
            transactionId: parsed.transactionId,
            csrSubject: csrObj.subject,
            challengeType: scepConfig.challengeType as ScepChallengeType,
            status: "failure" as const,
            failReason: "Invalid challenge password",
            clientIp
          }
        }
      });

      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadRequest
      });
    }

    const { ttl } = await resolveIssuanceParams(profile);
    const csrPem = derToPem(Buffer.from(parsed.csr), "CERTIFICATE REQUEST");

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const result = await issueOrQueueCertificate({
      profile,
      project,
      caType,
      parsed,
      csrPem,
      ttl
    });

    const auditMetadata = {
      profileId: profile.id,
      profileSlug: profile.slug,
      transactionId: parsed.transactionId,
      csrSubject: csrObj.subject,
      challengeType: scepConfig.challengeType as ScepChallengeType,
      clientIp
    };

    if (result.status === "pending") {
      void auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: { type: ActorType.SCEP_ACCOUNT, metadata: { profileId: profile.id } },
        event: {
          type: EventType.SCEP_ENROLLMENT,
          metadata: { ...auditMetadata, status: "pending" as const }
        }
      });

      return buildCertRepPending({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce
      });
    }

    void auditLogService.createAuditLog({
      projectId: profile.projectId,
      actor: { type: ActorType.SCEP_ACCOUNT, metadata: { profileId: profile.id } },
      event: {
        type: EventType.SCEP_ENROLLMENT,
        metadata: {
          ...auditMetadata,
          status: "success" as const,
          issuedCertificateId: result.certificateId,
          issuedSerialNumber: result.serialNumber
        }
      }
    });

    return buildCertRepSuccess({
      issuedCertDer: result.issuedCertDer,
      recipientCertDer: parsed.signerCertDer,
      raCertDer,
      raPrivateKeyDer,
      transactionId: parsed.transactionId,
      recipientNonce: parsed.senderNonce,
      clientCipherOid: parsed.clientCipherOid
    });
  };

  const handleRenewal = async ({
    profile,
    scepConfig,
    project,
    caType,
    raPrivateKeyDer,
    raCertDer,
    parsed,
    clientIp
  }: {
    profile: TScepContext["profile"];
    scepConfig: TScepContext["scepConfig"];
    project: TScepContext["project"];
    caType: CaType;
    raPrivateKeyDer: Buffer;
    raCertDer: Buffer;
    parsed: TParsedScepMessage;
    clientIp: string;
  }): Promise<Buffer> => {
    if (!scepConfig.allowCertBasedRenewal) {
      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadRequest
      });
    }

    if (!parsed.csr) {
      throw new BadRequestError({ message: "No CSR found in SCEP renewal request" });
    }

    const csrObj = new x509.Pkcs10CertificateRequest(parsed.csr);

    const isValidSigner = await isSignerCertIssuedByCa({
      signerCertDer: parsed.signerCertDer,
      caId: profile.caId!,
      certificateAuthorityCertDAL,
      certificateAuthorityDAL,
      projectDAL,
      kmsService
    });
    if (!isValidSigner) {
      void auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: {
          type: ActorType.SCEP_ACCOUNT,
          metadata: { profileId: profile.id }
        },
        event: {
          type: EventType.SCEP_RENEWAL,
          metadata: {
            profileId: profile.id,
            profileSlug: profile.slug,
            transactionId: parsed.transactionId,
            csrSubject: csrObj.subject,
            status: "failure" as const,
            failReason: "Signer certificate is expired or does not chain to profile CA",
            clientIp
          }
        }
      });

      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadCertId
      });
    }

    const { ttl } = await resolveIssuanceParams(profile);
    const csrPem = derToPem(Buffer.from(parsed.csr), "CERTIFICATE REQUEST");

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const result = await issueOrQueueCertificate({
      profile,
      project,
      caType,
      parsed,
      csrPem,
      ttl
    });

    const auditMetadata = {
      profileId: profile.id,
      profileSlug: profile.slug,
      transactionId: parsed.transactionId,
      csrSubject: csrObj.subject,
      clientIp
    };

    if (result.status === "pending") {
      void auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: { type: ActorType.SCEP_ACCOUNT, metadata: { profileId: profile.id } },
        event: {
          type: EventType.SCEP_RENEWAL,
          metadata: { ...auditMetadata, status: "pending" as const }
        }
      });

      return buildCertRepPending({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce
      });
    }

    void auditLogService.createAuditLog({
      projectId: profile.projectId,
      actor: { type: ActorType.SCEP_ACCOUNT, metadata: { profileId: profile.id } },
      event: {
        type: EventType.SCEP_RENEWAL,
        metadata: {
          ...auditMetadata,
          status: "success" as const,
          issuedCertificateId: result.certificateId,
          issuedSerialNumber: result.serialNumber
        }
      }
    });

    return buildCertRepSuccess({
      issuedCertDer: result.issuedCertDer,
      recipientCertDer: parsed.signerCertDer,
      raCertDer,
      raPrivateKeyDer,
      transactionId: parsed.transactionId,
      recipientNonce: parsed.senderNonce,
      clientCipherOid: parsed.clientCipherOid
    });
  };

  type TIssuanceResult =
    | { status: "pending" }
    | { status: "success"; issuedCertDer: Buffer; certificateId?: string; serialNumber?: string };

  // For internal CAs signs directly via signCertificateFromProfile.
  // For external CAs, creates a cert request and queues async issuance.
  const issueOrQueueCertificate = async ({
    profile,
    project,
    caType,
    parsed,
    csrPem,
    ttl
  }: {
    profile: TScepContext["profile"];
    project: TScepContext["project"];
    caType: CaType;
    parsed: TParsedScepMessage;
    csrPem: string;
    ttl: string;
  }): Promise<TIssuanceResult> => {
    // Internal CAs use direct signing
    if (caType === CaType.INTERNAL) {
      const result = await certificateV3Service.signCertificateFromProfile({
        actor: ActorType.SCEP_ACCOUNT,
        actorId: profile.id,
        actorAuthMethod: null,
        actorOrgId: project.orgId,
        profileId: profile.id,
        csr: csrPem,
        validity: { ttl },
        enrollmentType: EnrollmentType.SCEP
      });

      if (result.status === CertificateRequestStatus.PENDING_APPROVAL) {
        const existingTx = await scepTransactionDAL.findByProfileAndTransactionId(profile.id, parsed.transactionId);
        if (!existingTx) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + SCEP_TRANSACTION_EXPIRY_HOURS);

          await scepTransactionDAL.create({
            profileId: profile.id,
            transactionId: parsed.transactionId,
            senderNonce: parsed.senderNonce,
            signerCertDer: parsed.signerCertDer,
            certificateRequestId: result.certificateRequestId,
            clientCipherOid: parsed.clientCipherOid || null,
            expiresAt
          });
        }

        return { status: "pending" };
      }

      if (!result.certificate) {
        throw new BadRequestError({ message: "Certificate issuance failed" });
      }

      return {
        status: "success",
        issuedCertDer: Buffer.from(new x509.X509Certificate(result.certificate).rawData),
        certificateId: result.certificateId,
        serialNumber: result.serialNumber
      };
    }

    // External CA: validate policy, create cert request, queue async issuance
    if (!profile.certificatePolicyId) {
      throw new BadRequestError({ message: "Certificate policy is required for external CA issuance" });
    }

    const certRequest = extractCertificateRequestFromCSR(csrPem);
    const { keyAlgorithm, signatureAlgorithm } = extractAlgorithmsFromCSR(csrPem);

    const validationResult = await certificatePolicyService.validateCertificateRequest(profile.certificatePolicyId, {
      ...certRequest,
      keyAlgorithm,
      signatureAlgorithm,
      validity: { ttl }
    });
    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const newCertRequest = await certificateRequestService.createCertificateRequest({
      actor: ActorType.SCEP_ACCOUNT,
      actorId: profile.id,
      actorAuthMethod: null,
      actorOrgId: project.orgId,
      projectId: profile.projectId,
      caId: profile.caId!,
      profileId: profile.id,
      commonName: certRequest.commonName ?? "",
      keyUsages: certRequest.keyUsages?.map((u) => u.toString()) ?? [],
      extendedKeyUsages: certRequest.extendedKeyUsages?.map((u) => u.toString()) ?? [],
      keyAlgorithm: keyAlgorithm || "",
      signatureAlgorithm: signatureAlgorithm || "",
      altNames: certRequest.subjectAlternativeNames,
      csr: csrPem,
      ttl,
      status: CertificateRequestStatus.PENDING,
      enrollmentType: EnrollmentType.SCEP,
      organization: certRequest.organization,
      organizationalUnit: certRequest.organizationalUnit,
      country: certRequest.country,
      state: certRequest.state,
      locality: certRequest.locality
    });

    await certificateIssuanceQueue.queueCertificateIssuance({
      certificateId: newCertRequest.id,
      profileId: profile.id,
      caId: profile.caId!,
      ttl,
      signatureAlgorithm: signatureAlgorithm || "",
      keyAlgorithm: keyAlgorithm || "",
      commonName: certRequest.commonName || "",
      altNames: certRequest.subjectAlternativeNames?.map((san) => ({ type: san.type, value: san.value })) || [],
      keyUsages: certRequest.keyUsages?.map((u) => u.toString()) ?? [],
      extendedKeyUsages: certRequest.extendedKeyUsages?.map((u) => u.toString()) ?? [],
      certificateRequestId: newCertRequest.id,
      csr: csrPem,
      organization: certRequest.organization,
      organizationalUnit: certRequest.organizationalUnit,
      country: certRequest.country,
      state: certRequest.state,
      locality: certRequest.locality
    });

    // Create SCEP transaction so the client can poll via GetCertInitial
    const existingTx = await scepTransactionDAL.findByProfileAndTransactionId(profile.id, parsed.transactionId);
    if (!existingTx) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SCEP_TRANSACTION_EXPIRY_HOURS);

      await scepTransactionDAL.create({
        profileId: profile.id,
        transactionId: parsed.transactionId,
        senderNonce: parsed.senderNonce,
        signerCertDer: parsed.signerCertDer,
        certificateRequestId: newCertRequest.id,
        clientCipherOid: parsed.clientCipherOid || null,
        expiresAt
      });
    }

    return { status: "pending" };
  };

  const handleGetCertInitial = async ({
    profile,
    raPrivateKeyDer,
    raCertDer,
    parsed
  }: {
    profile: TScepContext["profile"];
    raPrivateKeyDer: Buffer;
    raCertDer: Buffer;
    parsed: TParsedScepMessage;
  }): Promise<Buffer> => {
    const transaction = await scepTransactionDAL.findByProfileAndTransactionId(profile.id, parsed.transactionId);

    if (!transaction) {
      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadCertId
      });
    }

    if (new Date() > new Date(transaction.expiresAt)) {
      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadTime
      });
    }

    if (!transaction.certificateRequestId) {
      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadRequest
      });
    }

    const certRequest = await certificateRequestDAL.findById(transaction.certificateRequestId);
    if (!certRequest) {
      return buildCertRepFailure({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce,
        failInfo: ScepFailInfo.BadRequest
      });
    }

    switch (certRequest.status) {
      case CertificateRequestStatus.PENDING_APPROVAL:
      case CertificateRequestStatus.PENDING:
        return buildCertRepPending({
          raCertDer,
          raPrivateKeyDer,
          transactionId: parsed.transactionId,
          recipientNonce: parsed.senderNonce
        });

      case CertificateRequestStatus.ISSUED: {
        if (!certRequest.certificateId) {
          return buildCertRepFailure({
            raCertDer,
            raPrivateKeyDer,
            transactionId: parsed.transactionId,
            recipientNonce: parsed.senderNonce,
            failInfo: ScepFailInfo.BadRequest
          });
        }

        const certBody = await certificateBodyDAL.findOne({ certId: certRequest.certificateId });
        if (!certBody || !certBody.encryptedCertificate) {
          return buildCertRepFailure({
            raCertDer,
            raPrivateKeyDer,
            transactionId: parsed.transactionId,
            recipientNonce: parsed.senderNonce,
            failInfo: ScepFailInfo.BadRequest
          });
        }

        const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
          projectId: profile.projectId,
          projectDAL,
          kmsService
        });
        const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
        const decryptedCert = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });

        const issuedCertDer = Buffer.from(new x509.X509Certificate(decryptedCert).rawData);

        return buildCertRepSuccess({
          issuedCertDer,
          recipientCertDer: transaction.signerCertDer,
          raCertDer,
          raPrivateKeyDer,
          transactionId: parsed.transactionId,
          recipientNonce: parsed.senderNonce,
          clientCipherOid: transaction.clientCipherOid || undefined
        });
      }

      default:
        return buildCertRepFailure({
          raCertDer,
          raPrivateKeyDer,
          transactionId: parsed.transactionId,
          recipientNonce: parsed.senderNonce,
          failInfo: ScepFailInfo.BadRequest
        });
    }
  };

  const generateDynamicChallenge = async ({
    profileId,
    clientIp,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGenerateDynamicChallengeDTO) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile || profile.enrollmentType !== EnrollmentType.SCEP) {
      throw new NotFoundError({ message: "SCEP profile not found" });
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
      ProjectPermissionCertificateProfileActions.Edit,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    );

    if (!profile.scepConfigId) {
      throw new BadRequestError({ message: "SCEP enrollment not configured for this profile" });
    }

    const scepConfig = await scepEnrollmentConfigDAL.findById(profile.scepConfigId);
    if (!scepConfig) {
      throw new NotFoundError({ message: "SCEP configuration not found" });
    }

    if (scepConfig.challengeType !== ScepChallengeType.DYNAMIC) {
      throw new BadRequestError({ message: "Dynamic challenges are not enabled for this SCEP profile" });
    }

    const project = await projectDAL.findOne({ id: profile.projectId });
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.pkiScep) {
      throw new BadRequestError({
        message: "Failed to generate SCEP challenge due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const challengePlaintext = randomBytes(32).toString("hex");

    const appCfg = getConfig();
    const hashedChallenge = await crypto.hashing().createHash(challengePlaintext, appCfg.SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + scepConfig.dynamicChallengeExpiryMinutes);

    await scepDynamicChallengeDAL.transaction(async (tx) => {
      const pendingCount = await scepDynamicChallengeDAL.countPending(scepConfig.id, tx);
      if (pendingCount >= scepConfig.dynamicChallengeMaxPending) {
        throw new BadRequestError({
          message: `Maximum number of pending challenges (${scepConfig.dynamicChallengeMaxPending}) reached. Wait for existing challenges to expire or be used.`
        });
      }

      await scepDynamicChallengeDAL.create(
        {
          scepConfigId: scepConfig.id,
          hashedChallenge,
          expiresAt,
          clientIp: clientIp || null
        },
        tx
      );
    });

    void scepDynamicChallengeDAL.pruneExpired(scepConfig.id);

    return {
      challenge: challengePlaintext,
      projectId: profile.projectId,
      profileSlug: profile.slug,
      expiresAt: expiresAt.toISOString()
    };
  };

  return {
    getCaCaps,
    getCaCert,
    handlePkiOperation,
    generateDynamicChallenge
  };
};
