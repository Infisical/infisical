import * as x509 from "@peculiar/x509";

import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCertChain, getCaCertChains } from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
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
import { getScepCapabilities } from "./pki-scep-fns";
import { buildCertRepFailure, buildCertRepPending, buildCertRepSuccess } from "./pki-scep-message-builder";
import { parseScepMessage } from "./pki-scep-message-parser";
import { TScepTransactionDALFactory } from "./pki-scep-transaction-dal";
import {
  ScepFailInfo,
  ScepMessageType,
  TGetCaCapsDTO,
  TGetCaCertDTO,
  THandlePkiOperationDTO,
  TParsedScepMessage
} from "./pki-scep-types";

type TPkiScepServiceFactoryDep = {
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "findById">;
  scepTransactionDAL: TScepTransactionDALFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "findById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TPkiScepServiceFactory = ReturnType<typeof pkiScepServiceFactory>;

const SCEP_TRANSACTION_EXPIRY_HOURS = 24;

export const pkiScepServiceFactory = ({
  certificateV3Service,
  certificateProfileDAL,
  scepEnrollmentConfigDAL,
  scepTransactionDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateRequestDAL,
  certificateBodyDAL,
  projectDAL,
  kmsService,
  licenseService,
  certificatePolicyDAL,
  auditLogService
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
      throw new BadRequestError({ message: "Self-signed certificates are not supported for SCEP enrollment" });
    }

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

    return { profile, scepConfig, project, raPrivateKeyDer, raCertDer };
  };

  const getCaCaps = async ({ profileId }: TGetCaCapsDTO): Promise<string> => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile || profile.enrollmentType !== EnrollmentType.SCEP) {
      throw new NotFoundError({ message: "SCEP profile not found" });
    }

    return getScepCapabilities();
  };

  const getCaCert = async ({ profileId }: TGetCaCertDTO): Promise<Buffer> => {
    const { profile, scepConfig } = await loadScepContext(profileId);

    const raCert = new x509.X509Certificate(scepConfig.raCertificate);
    const rawCerts: ArrayBuffer[] = [raCert.rawData];

    if (scepConfig.includeCaCertInResponse && profile.caId) {
      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
      if (ca?.internalCa?.activeCaCertId) {
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
    }

    const base64Pkcs7 = convertRawCertsToPkcs7(rawCerts);
    return Buffer.from(base64Pkcs7, "base64");
  };

  type TScepContext = Awaited<ReturnType<typeof loadScepContext>>;

  const derToPem = (der: Buffer, label: string): string => {
    const base64 = der.toString("base64").replace(/(.{64})/g, "$1\n");
    return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
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
    const { profile, scepConfig, project, raPrivateKeyDer, raCertDer } = await loadScepContext(profileId);

    const parsed = parseScepMessage(message, raPrivateKeyDer);

    switch (parsed.messageType) {
      case ScepMessageType.PKCSReq:
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return handleEnrollment({
          profile,
          scepConfig,
          project,
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

  // Check if a signer certificate was issued by the profile's CA
  const isSignerCertIssuedByCa = async (signerCertDer: Buffer, profile: TScepContext["profile"]): Promise<boolean> => {
    try {
      const signerCert = new x509.X509Certificate(signerCertDer);

      if (new Date() > signerCert.notAfter) {
        return false;
      }

      const caCertChains = await getCaCertChains({
        caId: profile.caId!,
        certificateAuthorityCertDAL,
        certificateAuthorityDAL,
        projectDAL,
        kmsService
      });

      const verifiedChains = await Promise.all(
        caCertChains.map(async (chain) => {
          const caCert = new x509.X509Certificate(chain.certificate);
          const chainCerts = chain.certificateChain
            ? extractX509CertFromChain(chain.certificateChain).map((c) => new x509.X509Certificate(c))
            : [];
          return isCertChainValid([signerCert, caCert, ...chainCerts]);
        })
      );

      return verifiedChains.some(Boolean);
    } catch {
      return false;
    }
  };

  const handleEnrollment = async ({
    profile,
    scepConfig,
    project,
    raPrivateKeyDer,
    raCertDer,
    parsed,
    clientIp
  }: {
    profile: TScepContext["profile"];
    scepConfig: TScepContext["scepConfig"];
    project: TScepContext["project"];
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

    const isValid = challengePassword
      ? await crypto.hashing().compareHash(challengePassword, scepConfig.hashedChallengePassword)
      : false;

    if (!isValid) {
      // Many SCEP clients (including sscep) send PKCSReq for both initial enrollment
      // and renewal — they don't use RenewalReq (messageType=17). Detect renewal by
      // checking if the signer cert chains to the profile CA.
      if (scepConfig.allowCertBasedRenewal) {
        const isRenewalViaPKCSReq = await isSignerCertIssuedByCa(parsed.signerCertDer, profile);
        if (isRenewalViaPKCSReq) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          return handleRenewal({
            profile,
            scepConfig,
            project,
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
            challengeType: "static" as const,
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
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SCEP_TRANSACTION_EXPIRY_HOURS);

      await scepTransactionDAL.create({
        profileId: profile.id,
        transactionId: parsed.transactionId,
        senderNonce: parsed.senderNonce,
        signerCertDer: parsed.signerCertDer,
        certificateRequestId: result.certificateRequestId,
        expiresAt
      });

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
            challengeType: "static" as const,
            status: "pending" as const,
            clientIp
          }
        }
      });

      return buildCertRepPending({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce
      });
    }

    if (!result.certificate) {
      throw new BadRequestError({ message: "Certificate issuance failed" });
    }

    const issuedCert = new x509.X509Certificate(result.certificate);
    const issuedCertDer = Buffer.from(issuedCert.rawData);

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
          challengeType: "static" as const,
          status: "success" as const,
          issuedCertificateId: result.certificateId,
          issuedSerialNumber: result.serialNumber,
          clientIp
        }
      }
    });

    return buildCertRepSuccess({
      issuedCertDer,
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
    raPrivateKeyDer,
    raCertDer,
    parsed,
    clientIp
  }: {
    profile: TScepContext["profile"];
    scepConfig: TScepContext["scepConfig"];
    project: TScepContext["project"];
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

    const signerCert = new x509.X509Certificate(parsed.signerCertDer);
    const isValidSigner = await isSignerCertIssuedByCa(parsed.signerCertDer, profile);
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
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SCEP_TRANSACTION_EXPIRY_HOURS);

      await scepTransactionDAL.create({
        profileId: profile.id,
        transactionId: parsed.transactionId,
        senderNonce: parsed.senderNonce,
        signerCertDer: parsed.signerCertDer,
        certificateRequestId: result.certificateRequestId,
        expiresAt
      });

      return buildCertRepPending({
        raCertDer,
        raPrivateKeyDer,
        transactionId: parsed.transactionId,
        recipientNonce: parsed.senderNonce
      });
    }

    if (!result.certificate) {
      throw new BadRequestError({ message: "Certificate renewal failed" });
    }

    const issuedCert = new x509.X509Certificate(result.certificate);

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
          existingCertificateSerial: signerCert.serialNumber,
          status: "success" as const,
          issuedCertificateId: result.certificateId,
          issuedSerialNumber: result.serialNumber,
          clientIp
        }
      }
    });

    return buildCertRepSuccess({
      issuedCertDer: Buffer.from(issuedCert.rawData),
      recipientCertDer: parsed.signerCertDer,
      raCertDer,
      raPrivateKeyDer,
      transactionId: parsed.transactionId,
      recipientNonce: parsed.senderNonce,
      clientCipherOid: parsed.clientCipherOid
    });
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
          recipientNonce: parsed.senderNonce
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

  return {
    getCaCaps,
    getCaCert,
    handlePkiOperation
  };
};
