import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { isSignerCertIssuedByCa } from "@app/ee/services/pki-scep/pki-scep-fns";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { classifyError } from "@app/lib/errors/classify";
import { asNonSharedBuffer } from "@app/lib/fn";
import {
  KerberosError,
  KerberosFailureReason,
  parseKeytab,
  TKerberosIdentity,
  verifyNegotiateToken
} from "@app/lib/kerberos";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { findDirectoryComputerBySid } from "@app/services/app-connection/ldap/ldap-directory-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCertChain } from "@app/services/certificate-authority/certificate-authority-fns";
import {
  CertificateIssuanceOperation,
  CertSubjectAlternativeNameType
} from "@app/services/certificate-common/certificate-constants";
import { calculateRenewalThreshold } from "@app/services/certificate-common/certificate-issuance-utils";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { resolveEffectiveTtl } from "@app/services/certificate-v3/certificate-v3-fns";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TMicrosoftAutoenrollmentEnrollmentConfigDALFactory } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { TPkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";

import { parseEnrollmentRequestToken } from "./microsoft-autoenrollment-cmc-fns";
import {
  buildCesUrl,
  isComputerInAllowedGroups,
  loadLdapConnectionConfig,
  normalizeHttpServicePrincipalName,
  resolveInstanceServicePrincipalName,
  stripKerberosRealm
} from "./microsoft-autoenrollment-fns";
import { TMicrosoftAutoenrollmentRequestDALFactory } from "./microsoft-autoenrollment-request-dal";
import {
  buildGetPoliciesResponse,
  buildIssuedResponseFromPem,
  buildPendingResponse,
  buildSoapFault,
  parseSoapEnvelope,
  TParsedSoapEnvelope
} from "./microsoft-autoenrollment-soap-fns";
import {
  buildPolicyId,
  buildProfileUsageExtensions,
  buildSidSecurityExtension,
  readSidSecurityExtension,
  buildTemplateInfoExtension,
  buildTemplateOid,
  resolveTemplatePrivateKey
} from "./microsoft-autoenrollment-template-fns";
import {
  MicrosoftAutoenrollmentFailureReason,
  MicrosoftAutoenrollmentIssuanceResult,
  MicrosoftAutoenrollmentMetadataKey,
  TMicrosoftAutoenrollmentRequestDTO,
  TMicrosoftAutoenrollmentResponse
} from "./microsoft-autoenrollment-types";

type TMicrosoftAutoenrollmentServiceFactoryDep = {
  pkiApplicationProfileDAL: Pick<TPkiApplicationProfileDALFactory, "findOneByApplicationAndProfile">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
    TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
    "findById" | "recordKeytabMismatch"
  >;
  microsoftAutoenrollmentRequestDAL: TMicrosoftAutoenrollmentRequestDALFactory;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "transaction" | "primaryNode">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "findById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find">;
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  licenseService: TLicenseService;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog" | "createCollapsedAuditLog">;
};

export type TMicrosoftAutoenrollmentServiceFactory = ReturnType<typeof microsoftAutoenrollmentServiceFactory>;

const MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL = "365d";
const SECONDS_PER_DAY = 86400;
const MAX_TICKET_SERVICE_NAME_LENGTH = 255;
const MAX_REFUSAL_MESSAGE_LENGTH = 512;
const FAULT_STATUS_CODE = 500;
const NOT_ENABLED_STATUS_CODE = 404;
const UNAUTHORIZED_STATUS_CODE = 401;
const NEGOTIATE = "Negotiate";
const DIRECTORY_UNREACHABLE_MESSAGE =
  "Infisical could not reach Active Directory to look up this computer. Try again later.";
const DIRECTORY_LOOKUP_FAILED_MESSAGE =
  "Infisical could not look up this computer in Active Directory. Check the credentials and settings of the profile's LDAP connection.";

const CERTSRV_E_NO_REQUEST = -2146877438;
const CERTSRV_E_ADMIN_DENIED_REQUEST = -2146877420;
const REQUEST_NUMBER_PATTERN = new RE2("^[1-9][0-9]{0,9}$");
const MAX_REQUEST_NUMBER = 2147483647;

const PENDING_REQUEST_STATUSES: string[] = [
  CertificateRequestStatus.PENDING_APPROVAL,
  CertificateRequestStatus.PENDING
];

const describeDirectoryLookupFailure = (err: unknown) => {
  const errorType = classifyError(err);
  return errorType === "network" || errorType === "timeout"
    ? { reason: MicrosoftAutoenrollmentFailureReason.DirectoryUnreachable, message: DIRECTORY_UNREACHABLE_MESSAGE }
    : { reason: MicrosoftAutoenrollmentFailureReason.DirectoryLookupFailed, message: DIRECTORY_LOOKUP_FAILED_MESSAGE };
};

const MAX_FAILURE_REASON_LENGTH = 256;

export const microsoftAutoenrollmentServiceFactory = ({
  pkiApplicationProfileDAL,
  pkiApplicationDAL,
  microsoftAutoenrollmentEnrollmentConfigDAL,
  microsoftAutoenrollmentRequestDAL,
  certificateProfileDAL,
  certificatePolicyDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateDAL,
  certificateRequestDAL,
  certificateBodyDAL,
  resourceMetadataDAL,
  certificateV3Service,
  projectDAL,
  kmsService,
  appConnectionDAL,
  gatewayV2Service,
  gatewayPoolService,
  keyStore,
  licenseService,
  auditLogService
}: TMicrosoftAutoenrollmentServiceFactoryDep) => {
  const $soapResponse = (
    body: string,
    headers: Record<string, string> = {},
    statusCode = 200
  ): TMicrosoftAutoenrollmentResponse => ({ statusCode, body, headers });

  const $fault = (
    relatesTo: string | null,
    message: string,
    headers: Record<string, string> = {},
    enrollmentDetail?: Parameters<typeof buildSoapFault>[0]["enrollmentDetail"]
  ) => $soapResponse(buildSoapFault({ relatesTo, message, enrollmentDetail }), headers, FAULT_STATUS_CODE);

  const $loadContext = async (applicationId: string, profileId: string) => {
    const junction = await pkiApplicationProfileDAL.findOneByApplicationAndProfile(applicationId, profileId);
    if (!junction?.microsoftAutoenrollmentConfigId) return null;

    const [config, profile] = await Promise.all([
      microsoftAutoenrollmentEnrollmentConfigDAL.findById(junction.microsoftAutoenrollmentConfigId),
      certificateProfileDAL.findByIdWithConfigs(profileId)
    ]);
    if (!profile?.caId) return null;

    const [kmsDecryptor, { orgId, plan }] = await Promise.all([
      getProjectKmsCertificateKeyId({ projectId: profile.projectId, projectDAL, kmsService }).then((kmsId) =>
        kmsService.decryptWithKmsKey({ kmsId })
      ),
      projectDAL
        .findOne({ id: profile.projectId })
        .then(async (project) => ({ orgId: project.orgId, plan: await licenseService.getPlan(project.orgId) }))
    ]);
    const keytabEntries = parseKeytab(await kmsDecryptor({ cipherTextBlob: config.encryptedKeytab }));

    return {
      applicationId,
      junction,
      config,
      profile,
      caId: profile.caId,
      orgId,
      kmsDecryptor,
      keytabEntries,
      isEntitled: plan.has(PlanFeature.PkiMicrosoftAutoenrollment)
    };
  };

  type TContext = NonNullable<Awaited<ReturnType<typeof $loadContext>>>;

  const $recordRefusal = async (
    context: TContext,
    clientIp: string,
    {
      reason,
      computerName,
      ticketServiceName,
      ticketKeyVersion,
      message
    }: {
      reason: KerberosFailureReason | MicrosoftAutoenrollmentFailureReason;
      computerName?: string;
      ticketServiceName?: string;
      ticketKeyVersion?: number;
      message?: string;
    }
  ) => {
    const application = await pkiApplicationDAL.findById(context.applicationId);
    return auditLogService.createCollapsedAuditLog({
      projectId: context.profile.projectId,
      ipAddress: clientIp,
      actor: { type: ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT, metadata: { profileId: context.profile.id } },
      event: {
        type: EventType.MICROSOFT_AUTOENROLLMENT_REQUEST_REFUSED,
        metadata: {
          applicationId: context.applicationId,
          applicationName: application?.name,
          profileId: context.profile.id,
          profileSlug: context.profile.slug,
          reason,
          computerName,
          ticketServiceName,
          ticketKeyVersion,
          message
        }
      },
      collapseKeyParts: [context.junction.id, reason, computerName ?? ""]
    });
  };

  const $resolveInstanceServicePrincipalName = () =>
    resolveInstanceServicePrincipalName()
      .then(normalizeHttpServicePrincipalName)
      .catch(() => null);

  const $authenticate = async (context: TContext, authorizationHeader: string | undefined, clientIp: string) => {
    try {
      const identity = await verifyNegotiateToken({
        authorizationHeader,
        keytabEntries: context.keytabEntries,
        checkReplay: async (replayKey) =>
          (await keyStore.setItemWithExpiryNX(
            KeyStorePrefixes.MicrosoftAutoenrollmentReplay(
              context.config.servicePrincipalName.toLowerCase(),
              replayKey
            ),
            KeyStoreTtls.MicrosoftAutoenrollmentReplayInSeconds,
            1
          )) === "OK"
      });
      return { identity };
    } catch (error) {
      if (!(error instanceof KerberosError)) throw error;

      const ticketServicePrincipalName = normalizeHttpServicePrincipalName(error.serviceName);
      if (
        error.reason === KerberosFailureReason.NoMatchingKey &&
        ticketServicePrincipalName &&
        ticketServicePrincipalName.toLowerCase() !==
          stripKerberosRealm(context.config.servicePrincipalName).toLowerCase() &&
        ticketServicePrincipalName === (await $resolveInstanceServicePrincipalName())
      ) {
        await microsoftAutoenrollmentEnrollmentConfigDAL.recordKeytabMismatch(
          context.config.id,
          ticketServicePrincipalName
        );
      }

      await $recordRefusal(context, clientIp, {
        reason: error.reason,
        computerName: error.clientName,
        ticketServiceName: error.serviceName?.slice(0, MAX_TICKET_SERVICE_NAME_LENGTH),
        ticketKeyVersion: error.keyVersion ?? undefined,
        message: error.message.slice(0, MAX_REFUSAL_MESSAGE_LENGTH)
      });

      return { refusal: $soapResponse("", { "WWW-Authenticate": NEGOTIATE }, UNAUTHORIZED_STATUS_CODE) };
    }
  };

  const $resolveTtl = async (profile: TContext["profile"]) => {
    const policy = await certificatePolicyDAL.findById(profile.certificatePolicyId);
    const policyMaxValidity = policy?.validity?.max;
    return resolveEffectiveTtl({
      requestTtl: undefined,
      profileDefaultTtlDays: profile.defaults?.ttlDays,
      policyMaxValidity,
      flowDefaultTtl:
        policyMaxValidity && ms(policyMaxValidity) < ms(MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL)
          ? policyMaxValidity
          : MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL
    });
  };

  const $buildTemplateInfoExtension = (context: TContext, templateOid = buildTemplateOid(context.junction.id)) =>
    buildTemplateInfoExtension(templateOid, context.config.templateMajorRevision, context.config.templateMinorRevision);

  const $buildPolicyTemplate = async (context: TContext) => {
    const { profile, config, applicationId } = context;
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(context.caId);
    if (!ca?.internalCa?.activeCaCertId) {
      throw new BadRequestError({
        message: `The certificate authority of profile '${profile.slug}' has no active certificate, so it cannot issue certificates.`
      });
    }
    const [{ caCert }, ttl] = await Promise.all([
      getCaCertChain({
        caCertId: ca.internalCa.activeCaCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      }),
      $resolveTtl(profile)
    ]);

    const templateOid = buildTemplateOid(context.junction.id);
    const validitySeconds = ms(ttl) / 1000;
    const renewBeforeDays = calculateRenewalThreshold(
      config.renewBeforeDays,
      Math.ceil(validitySeconds / SECONDS_PER_DAY)
    ) as number;

    return {
      templateOid,
      templateName: profile.slug,
      validitySeconds,
      renewalPeriodSeconds: renewBeforeDays * SECONDS_PER_DAY,
      privateKey: resolveTemplatePrivateKey(profile.defaults?.keyAlgorithm),
      majorRevision: config.templateMajorRevision,
      minorRevision: config.templateMinorRevision,
      extensions: [
        ...buildProfileUsageExtensions(profile.defaults ?? {}),
        $buildTemplateInfoExtension(context, templateOid)
      ],
      caCertificate: Buffer.from(new x509.X509Certificate(caCert).rawData),
      cesUrl: buildCesUrl(applicationId, profile.id)
    };
  };

  const $lookUpComputer = async (context: TContext, identity: TKerberosIdentity, clientIp: string) => {
    const refuse = async (reason: MicrosoftAutoenrollmentFailureReason, message: string) => {
      await $recordRefusal(context, clientIp, { reason, computerName: identity.clientName, message });
      return { refusal: message };
    };

    const lookup = await loadLdapConnectionConfig(context.config.appConnectionId, { appConnectionDAL, kmsService })
      .then(async (config) => ({
        computer: await findDirectoryComputerBySid(
          { config, sid: identity.accountSid },
          { gatewayV2Service, gatewayPoolService }
        )
      }))
      .catch((err: unknown) => {
        logger.warn(
          { err },
          `Unable to look up a computer in Active Directory for Microsoft Autoenrollment [connectionId=${context.config.appConnectionId}]`
        );
        return { failure: describeDirectoryLookupFailure(err) };
      });

    if ("failure" in lookup) {
      return refuse(lookup.failure.reason, lookup.failure.message);
    }
    const { computer } = lookup;
    if (!computer) {
      return refuse(
        MicrosoftAutoenrollmentFailureReason.ComputerNotFound,
        `Computer ${identity.clientName} was not found in Active Directory.`
      );
    }
    if (computer.isDisabled === null) {
      return refuse(
        MicrosoftAutoenrollmentFailureReason.DirectoryLookupFailed,
        `The LDAP connection's account cannot read userAccountControl for computer ${computer.samAccountName}, so it is unknown whether the computer is disabled. Allow that account to read userAccountControl on computer objects.`
      );
    }
    if (computer.isDisabled) {
      return refuse(
        MicrosoftAutoenrollmentFailureReason.ComputerDisabled,
        `Computer ${computer.samAccountName} is disabled in Active Directory.`
      );
    }
    if (!computer.dnsHostName) {
      return refuse(
        MicrosoftAutoenrollmentFailureReason.NoDnsHostName,
        `Computer ${computer.samAccountName} has no DNS host name in Active Directory.`
      );
    }
    return { dnsHostName: computer.dnsHostName.toLowerCase() };
  };

  const $validateRenewalCertificate = async (
    context: TContext,
    currentCertificate: x509.X509Certificate,
    accountSid: string
  ): Promise<{ refusal: string } | { originalCertificateId: string }> => {
    const isCurrentCertificateValid = await isSignerCertIssuedByCa({
      signerCertDer: Buffer.from(currentCertificate.rawData),
      signerCert: currentCertificate,
      caId: context.caId,
      certificateDAL,
      certificateAuthorityCertDAL,
      certificateAuthorityDAL,
      projectDAL,
      kmsService
    });
    const storedCertificate = isCurrentCertificateValid
      ? await certificateDAL.findOne(
          { serialNumber: currentCertificate.serialNumber, caId: context.caId, profileId: context.profile.id },
          certificateDAL.primaryNode()
        )
      : undefined;
    if (!storedCertificate || storedCertificate.deletedAt) {
      return {
        refusal: `The certificate being renewed (serial ${currentCertificate.serialNumber}) was not issued from profile '${context.profile.slug}', has expired, was deleted, or is revoked.`
      };
    }

    const currentSid = readSidSecurityExtension(currentCertificate);
    if (currentSid !== accountSid) {
      return {
        refusal: currentSid
          ? `The certificate being renewed was issued to SID '${currentSid}', but the requesting computer's SID is '${accountSid}'.`
          : "The certificate being renewed does not name a computer SID, so it cannot be renewed. The computer enrolls for a new certificate once it expires."
      };
    }
    return { originalCertificateId: storedCertificate.id };
  };

  const $findCertificateRequest = async (requestId: string | null) => {
    if (!requestId || !REQUEST_NUMBER_PATTERN.test(requestId)) return undefined;
    const requestNumber = Number(requestId);
    if (requestNumber > MAX_REQUEST_NUMBER) return undefined;
    const certificateRequestId =
      await microsoftAutoenrollmentRequestDAL.findCertificateRequestIdByRequestNumber(requestNumber);
    return certificateRequestId ? certificateRequestDAL.findById(certificateRequestId) : undefined;
  };

  const $queryTokenStatus = async (context: TContext, identity: TKerberosIdentity, envelope: TParsedSoapEnvelope) => {
    const { messageId, requestId } = envelope;
    const certificateRequest = await $findCertificateRequest(requestId);
    const notFound = () =>
      $fault(
        messageId,
        `Certificate request '${requestId ?? ""}' was not found for this profile.`,
        {},
        { errorCode: CERTSRV_E_NO_REQUEST, isInvalidRequest: false, requestId }
      );
    if (
      !requestId ||
      !certificateRequest ||
      certificateRequest.profileId !== context.profile.id ||
      certificateRequest.applicationId !== context.applicationId
    ) {
      return notFound();
    }

    const metadata = await resourceMetadataDAL.find({ certificateRequestId: certificateRequest.id });
    const requestingComputerSid = metadata.find(
      (entry) => entry.key === MicrosoftAutoenrollmentMetadataKey.ComputerSid
    );
    if (requestingComputerSid?.value !== identity.accountSid) {
      return notFound();
    }

    if (PENDING_REQUEST_STATUSES.includes(certificateRequest.status)) {
      return buildPendingResponse({
        relatesTo: messageId,
        requestId,
        cesUrl: buildCesUrl(context.applicationId, context.profile.id)
      });
    }

    const issuedCertificate =
      certificateRequest.status === CertificateRequestStatus.ISSUED && certificateRequest.certificateId
        ? await certificateDAL.findOne({ id: certificateRequest.certificateId }, certificateDAL.primaryNode())
        : undefined;
    const isIssuedCertificateRevoked = issuedCertificate?.status === CertStatus.REVOKED;
    const certificateBody =
      issuedCertificate && !isIssuedCertificateRevoked && !issuedCertificate.deletedAt
        ? await certificateBodyDAL.findOne({ certId: issuedCertificate.id })
        : undefined;
    if (!certificateBody) {
      let message = `Certificate request '${requestId}' was not issued in Infisical.`;
      if (issuedCertificate?.deletedAt) {
        message = `The certificate for request '${requestId}' was deleted in Infisical after it was approved.`;
      } else if (isIssuedCertificateRevoked) {
        message = `The certificate for request '${requestId}' was revoked in Infisical after it was approved.`;
      } else if (certificateRequest.status === CertificateRequestStatus.REJECTED) {
        message = `Certificate request '${requestId}' was rejected in Infisical.`;
      } else if (certificateRequest.status === CertificateRequestStatus.FAILED) {
        message = `Certificate request '${requestId}' was approved, but Infisical could not issue it: ${(certificateRequest.errorMessage ?? "no reason was recorded").slice(0, MAX_FAILURE_REASON_LENGTH)}`;
      }
      return $fault(
        messageId,
        message,
        {},
        {
          errorCode: CERTSRV_E_ADMIN_DENIED_REQUEST,
          isInvalidRequest: true,
          requestId
        }
      );
    }

    const [certificate, certificateChain] = await Promise.all([
      context.kmsDecryptor({ cipherTextBlob: certificateBody.encryptedCertificate }),
      certificateBody.encryptedCertificateChain
        ? context.kmsDecryptor({ cipherTextBlob: certificateBody.encryptedCertificateChain }).then(String)
        : null
    ]);
    return buildIssuedResponseFromPem({
      relatesTo: messageId,
      requestId,
      certificatePem: certificate,
      certificateChainPem: certificateChain
    });
  };

  const $recordIssuance = async ({
    context,
    identity,
    clientIp,
    dnsHostName,
    result,
    requestNumber,
    isPending,
    isRenewal
  }: {
    context: TContext;
    identity: TKerberosIdentity;
    clientIp: string;
    dnsHostName: string;
    result: Awaited<
      ReturnType<TMicrosoftAutoenrollmentServiceFactoryDep["certificateV3Service"]["signCertificateFromProfile"]>
    >;
    requestNumber: string;
    isPending: boolean;
    isRenewal: boolean;
  }) => {
    await auditLogService.createAuditLog({
      projectId: context.profile.projectId,
      ipAddress: clientIp,
      actor: { type: ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT, metadata: { profileId: context.profile.id } },
      event: {
        type: isRenewal ? EventType.MICROSOFT_AUTOENROLLMENT_RENEWAL : EventType.MICROSOFT_AUTOENROLLMENT_ISSUANCE,
        metadata: {
          applicationId: context.applicationId,
          applicationName: result.applicationName ?? undefined,
          profileId: context.profile.id,
          profileSlug: context.profile.slug,
          computerName: identity.clientName,
          computerSid: identity.accountSid,
          dnsHostName,
          result: isPending
            ? MicrosoftAutoenrollmentIssuanceResult.Pending
            : MicrosoftAutoenrollmentIssuanceResult.Issued,
          certificateId: result.certificateId,
          serialNumber: result.serialNumber,
          certificateRequestId: result.certificateRequestId,
          requestNumber
        }
      }
    });
  };

  const $issueCertificate = async (
    context: TContext,
    identity: TKerberosIdentity,
    envelope: TParsedSoapEnvelope,
    clientIp: string
  ) => {
    const { messageId, binarySecurityToken } = envelope;
    const { profile, config, applicationId } = context;

    if (!binarySecurityToken) {
      return $fault(messageId, "The request does not contain a certificate request.");
    }

    if (!isComputerInAllowedGroups(config.allowedGroups, identity.groupSids)) {
      await $recordRefusal(context, clientIp, {
        reason: MicrosoftAutoenrollmentFailureReason.NotInAllowedGroup,
        computerName: identity.clientName
      });
      return $fault(messageId, `This computer is not in a group allowed to enroll for '${profile.slug}' certificates.`);
    }

    const { csr, currentCertificate } = await parseEnrollmentRequestToken(binarySecurityToken);

    const lookup = await $lookUpComputer(context, identity, clientIp);
    if ("refusal" in lookup) return $fault(messageId, lookup.refusal);
    const { dnsHostName } = lookup;

    let originalCertificateId: string | undefined;
    if (currentCertificate) {
      const renewal = await $validateRenewalCertificate(context, currentCertificate, identity.accountSid);
      if ("refusal" in renewal) {
        await $recordRefusal(context, clientIp, {
          reason: MicrosoftAutoenrollmentFailureReason.RenewalRefused,
          computerName: identity.clientName,
          message: renewal.refusal
        });
        return $fault(messageId, renewal.refusal);
      }
      originalCertificateId = renewal.originalCertificateId;
    }

    const persisted: { requestNumber?: string } = {};
    const result = await certificateV3Service.signCertificateFromProfile({
      actor: ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT,
      actorId: profile.id,
      actorAuthMethod: null,
      actorOrgId: context.orgId,
      profileId: profile.id,
      applicationId,
      csr: x509.PemConverter.encode(asNonSharedBuffer(Buffer.from(csr.rawData)), "CERTIFICATE REQUEST"),
      validity: { ttl: await $resolveTtl(profile) },
      enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
      issuerNameOverride: {
        commonName: dnsHostName,
        altNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: dnsHostName }]
      },
      additionalExtensions: [$buildTemplateInfoExtension(context), buildSidSecurityExtension(identity.accountSid)],
      metadata: [
        { key: MicrosoftAutoenrollmentMetadataKey.ComputerSid, value: identity.accountSid },
        { key: MicrosoftAutoenrollmentMetadataKey.ComputerAccount, value: `${identity.clientName}@${identity.realm}` }
      ],
      ...(originalCertificateId && {
        issuanceOperation: CertificateIssuanceOperation.RENEW,
        originalCertificateId
      }),
      auditLogInfo: {
        ipAddress: clientIp,
        actor: { type: ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT, metadata: { profileId: profile.id } }
      },
      onCertificateRequestPersisted: async (certificateRequestId, tx) => {
        persisted.requestNumber = String(
          await microsoftAutoenrollmentRequestDAL.createRequestNumber(certificateRequestId, tx)
        );
      }
    });
    const { requestNumber } = persisted;
    if (requestNumber === undefined) {
      throw new InternalServerError({ message: "The certificate request was saved without a request number." });
    }

    const isPending = result.status === CertificateRequestStatus.PENDING_APPROVAL;
    await $recordIssuance({
      context,
      identity,
      clientIp,
      dnsHostName,
      result,
      requestNumber,
      isPending,
      isRenewal: Boolean(originalCertificateId)
    });

    if (isPending || !result.certificate) {
      return buildPendingResponse({
        relatesTo: messageId,
        requestId: requestNumber,
        cesUrl: buildCesUrl(applicationId, profile.id)
      });
    }

    return buildIssuedResponseFromPem({
      relatesTo: messageId,
      requestId: requestNumber,
      certificatePem: result.certificate,
      certificateChainPem: result.certificateChain ?? null
    });
  };

  const $handle = async (
    { applicationId, profileId, authorizationHeader, body, clientIp }: TMicrosoftAutoenrollmentRequestDTO,
    respond: (
      context: TContext,
      identity: TKerberosIdentity,
      envelope: TParsedSoapEnvelope
    ) => Promise<string | TMicrosoftAutoenrollmentResponse>
  ): Promise<TMicrosoftAutoenrollmentResponse> => {
    const context = await $loadContext(applicationId, profileId);
    if (!context) {
      return $soapResponse(
        buildSoapFault({
          relatesTo: null,
          message: "Microsoft Autoenrollment is not turned on for this profile in the application."
        }),
        {},
        NOT_ENABLED_STATUS_CODE
      );
    }
    if (!context.isEntitled) {
      return $fault(null, "The organization's plan does not include Microsoft Autoenrollment.");
    }

    const authentication = await $authenticate(context, authorizationHeader, clientIp);
    if (authentication.refusal) return authentication.refusal;

    const mutualAuthHeaders: Record<string, string> = authentication.identity.responseToken
      ? { "WWW-Authenticate": `${NEGOTIATE} ${authentication.identity.responseToken}` }
      : {};

    let envelope: TParsedSoapEnvelope | null = null;
    try {
      envelope = parseSoapEnvelope(body);
      const response = await respond(context, authentication.identity, envelope);
      return typeof response === "string"
        ? $soapResponse(response, mutualAuthHeaders)
        : { ...response, headers: { ...response.headers, ...mutualAuthHeaders } };
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      return $fault(envelope?.messageId ?? null, error.message, mutualAuthHeaders);
    }
  };

  const getPolicies = (dto: TMicrosoftAutoenrollmentRequestDTO) =>
    $handle(dto, async (context, identity, envelope) => {
      if (!envelope.isGetPolicies) {
        return $fault(envelope.messageId, "This enrollment policy URL only answers GetPolicies requests.");
      }

      const isAllowed = isComputerInAllowedGroups(context.config.allowedGroups, identity.groupSids);
      if (!isAllowed) {
        await $recordRefusal(context, dto.clientIp, {
          reason: MicrosoftAutoenrollmentFailureReason.NotInAllowedGroup,
          computerName: identity.clientName
        });
      }

      return buildGetPoliciesResponse({
        relatesTo: envelope.messageId,
        policyId: buildPolicyId(context.junction.id),
        policyFriendlyName: context.profile.slug,
        template: isAllowed ? await $buildPolicyTemplate(context) : null
      });
    });

  const requestSecurityToken = (dto: TMicrosoftAutoenrollmentRequestDTO) =>
    $handle(dto, (context, identity, envelope) =>
      envelope.isQueryTokenStatus
        ? $queryTokenStatus(context, identity, envelope)
        : $issueCertificate(context, identity, envelope, dto.clientIp)
    );

  return {
    getPolicies,
    requestSecurityToken
  };
};
