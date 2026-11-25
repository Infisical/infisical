import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TKmsDataKeyService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { isSignerCertIssuedByCa } from "@app/ee/services/pki-scep/pki-scep-fns";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { classifyError } from "@app/lib/errors/classify";
import { asNonSharedBuffer } from "@app/lib/fn";
import {
  assertTicketIsForServicePrincipal,
  KerberosError,
  KerberosFailureReason,
  parseKeytab,
  parseNegotiateToken,
  readAuthorizationHeader,
  TKerberosIdentity,
  TNegotiateToken,
  verifyNegotiateToken
} from "@app/lib/kerberos";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { findDirectoryComputerBySid } from "@app/services/app-connection/ldap/ldap-directory-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import {
  assertCaInProfileProject,
  getCaCertChain
} from "@app/services/certificate-authority/certificate-authority-fns";
import {
  CertificateIssuanceOperation,
  CertSubjectAlternativeNameType
} from "@app/services/certificate-common/certificate-constants";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { getSerialNumberSpellings } from "@app/services/certificate/certificate-fns";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TMicrosoftAutoenrollmentEnrollmentConfigDALFactory } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { TPkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";

import { TChannelBindingCache, TExpectedChannelBindings } from "./microsoft-autoenrollment-channel-binding-cache";
import {
  describeUnverifiableChannelBinding,
  getInstanceTlsEndpoint,
  TServerChannelBindingEntry
} from "./microsoft-autoenrollment-channel-binding-fns";
import { parseEnrollmentRequestToken } from "./microsoft-autoenrollment-cmc-fns";
import { resolveMicrosoftAutoenrollmentTtl } from "./microsoft-autoenrollment-enrollment-fns";
import {
  buildCesUrl,
  describeUnreadableUserAccountControl,
  isComputerInAllowedGroups,
  loadLdapConnectionConfig,
  stripKerberosRealm
} from "./microsoft-autoenrollment-fns";
import { TMicrosoftAutoenrollmentRequestDALFactory } from "./microsoft-autoenrollment-request-dal";
import {
  buildGetPoliciesResponse,
  buildIssuedResponseFromPem,
  buildPendingResponse,
  buildSoapFault,
  parseSoapEnvelope,
  SoapOperation,
  TParsedSoapEnvelope
} from "./microsoft-autoenrollment-soap-fns";
import {
  buildPolicyId,
  buildProfileUsageExtensions,
  buildSidSecurityExtension,
  readSidSecurityExtension,
  buildTemplateInfoExtension,
  buildTemplateOid,
  resolveRenewalPeriodSeconds,
  resolveTemplatePrivateKey,
  resolveTemplateSignatureAlgorithm
} from "./microsoft-autoenrollment-template-fns";
import {
  MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE,
  MicrosoftAutoenrollmentFailureReason,
  MicrosoftAutoenrollmentIssuanceResult,
  MicrosoftAutoenrollmentMetadataKey,
  TMicrosoftAutoenrollmentRequestDTO,
  TMicrosoftAutoenrollmentResponse
} from "./microsoft-autoenrollment-types";

type TMicrosoftAutoenrollmentServiceFactoryDep = {
  pkiApplicationProfileDAL: Pick<TPkiApplicationProfileDALFactory, "findOneByApplicationAndProfile">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  microsoftAutoenrollmentEnrollmentConfigDAL: Pick<TMicrosoftAutoenrollmentEnrollmentConfigDALFactory, "findById">;
  microsoftAutoenrollmentRequestDAL: TMicrosoftAutoenrollmentRequestDALFactory;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "findOneLiveFirst" | "transaction" | "primaryNode">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "findById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find">;
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  projectDAL: Pick<TProjectDALFactory, "findOne">;
  kmsDataKeyService: TKmsDataKeyService;
  kmsKeyService: TKmsKeyService;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  channelBindingCache: TChannelBindingCache;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog" | "createCollapsedAuditLog">;
};

export type TMicrosoftAutoenrollmentServiceFactory = ReturnType<typeof microsoftAutoenrollmentServiceFactory>;

const REMOVED_RESOURCE_FAILURE_MESSAGE =
  "The certificate profile, its policy or its certificate authority was changed or removed in Infisical. Check the profile's Microsoft Autoenrollment settings.";
const MAX_TICKET_SERVICE_NAME_LENGTH = 255;
const MAX_REFUSAL_MESSAGE_LENGTH = 512;
const FAULT_STATUS_CODE = 500;
const NOT_ENABLED_STATUS_CODE = 404;
const UNAUTHORIZED_STATUS_CODE = 401;
const NEGOTIATE = "Negotiate";
const UNEXPECTED_FAILURE_MESSAGE = "Infisical could not complete this request. Try again later.";
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

const CHANNEL_BINDING_OPT_OUT_HINT =
  "If this deployment cannot support the check, an admin can turn on Skip the channel binding check in the profile's Microsoft Autoenrollment settings.";

type TChannelBindingCheck = { expected: TExpectedChannelBindings | null; unverifiableReason?: string };

const toChannelBindingBuffers = (entries: TServerChannelBindingEntry[]) =>
  entries.map(({ binding }) => Buffer.from(binding, "hex"));

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
  kmsDataKeyService,
  kmsKeyService,
  appConnectionDAL,
  gatewayV2Service,
  gatewayPoolService,
  keyStore,
  channelBindingCache,
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

    const { orgId } = await projectDAL.findOne({ id: profile.projectId });

    return { applicationId, junction, config, profile, caId: profile.caId, orgId };
  };

  type TProfileContext = NonNullable<Awaited<ReturnType<typeof $loadContext>>>;

  const $decryptKeytab = async (profileContext: TProfileContext) => {
    const kmsDecryptor = await kmsKeyService.decryptWithKmsKey({
      kmsId: await kmsDataKeyService.getProjectCertificateKmsKeyId(profileContext.profile.projectId)
    });
    const keytabEntries = parseKeytab(await kmsDecryptor({ cipherTextBlob: profileContext.config.encryptedKeytab }));
    return { ...profileContext, kmsDecryptor, keytabEntries };
  };

  type TContext = Awaited<ReturnType<typeof $decryptKeytab>>;

  const $recordRefusal = async (
    context: TProfileContext,
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
          profileName: context.profile.slug,
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

  const $loadChannelBindingCheck = async (allowAnyChannelBinding: boolean): Promise<TChannelBindingCheck> => {
    if (allowAnyChannelBinding) return { expected: null };
    const expected = await channelBindingCache.loadExpected();
    if (expected) return { expected };
    return {
      expected: null,
      unverifiableReason: describeUnverifiableChannelBinding(
        crypto.isFipsModeEnabled() ? null : getInstanceTlsEndpoint()
      )
    };
  };

  const $verifyNegotiateToken = (
    context: TContext,
    negotiateToken: TNegotiateToken,
    expectedChannelBindings: Buffer[] | null
  ) =>
    verifyNegotiateToken({
      negotiateToken,
      keytabEntries: context.keytabEntries,
      expectedChannelBindings,
      checkReplay: async (replayKey) =>
        (await keyStore.setItemWithExpiryNX(
          KeyStorePrefixes.MicrosoftAutoenrollmentReplay(context.config.servicePrincipalName.toLowerCase(), replayKey),
          KeyStoreTtls.MicrosoftAutoenrollmentReplayInSeconds,
          1
        )) === "OK"
    });

  const $verifyWithChannelBindingRefresh = async (
    context: TContext,
    negotiateToken: TNegotiateToken,
    channelBindings: TExpectedChannelBindings | null
  ) => {
    try {
      return await $verifyNegotiateToken(
        context,
        negotiateToken,
        channelBindings && toChannelBindingBuffers(channelBindings.entries)
      );
    } catch (error) {
      if (
        !channelBindings ||
        !(error instanceof KerberosError) ||
        error.reason !== KerberosFailureReason.ChannelBindingMismatch
      ) {
        throw error;
      }
      const refreshedEntries = await channelBindingCache.refresh(channelBindings.endpoint, channelBindings.entries);
      const hasNewBinding = refreshedEntries?.some(
        ({ binding }) => !channelBindings.entries.some((entry) => entry.binding === binding)
      );
      if (!refreshedEntries || !hasNewBinding) throw error;
      return $verifyNegotiateToken(context, negotiateToken, toChannelBindingBuffers(refreshedEntries));
    }
  };

  const $challenge = () => $soapResponse("", { "WWW-Authenticate": NEGOTIATE }, UNAUTHORIZED_STATUS_CODE);

  const $authenticate = async (
    profileContext: TProfileContext,
    authorizationHeader: string | undefined,
    clientIp: string
  ) => {
    if (!authorizationHeader) return { refusal: $challenge() };

    let channelBindings: TExpectedChannelBindings | null = null;
    try {
      const negotiateToken = parseNegotiateToken(readAuthorizationHeader(authorizationHeader));
      assertTicketIsForServicePrincipal(negotiateToken, {
        principal: stripKerberosRealm(profileContext.config.servicePrincipalName),
        newestKeyVersion: profileContext.config.keyVersion
      });
      const context = await $decryptKeytab(profileContext);
      const channelBindingCheck = await $loadChannelBindingCheck(profileContext.config.allowAnyChannelBinding);
      channelBindings = channelBindingCheck.expected;
      const identity = await $verifyWithChannelBindingRefresh(context, negotiateToken, channelBindings);
      if (channelBindingCheck.unverifiableReason) {
        await $recordRefusal(profileContext, clientIp, {
          reason: MicrosoftAutoenrollmentFailureReason.ChannelBindingUnverifiable,
          computerName: identity.clientName,
          message:
            `TLS channel bindings can't be checked: ${channelBindingCheck.unverifiableReason} ${CHANNEL_BINDING_OPT_OUT_HINT}`.slice(
              0,
              MAX_REFUSAL_MESSAGE_LENGTH
            )
        });
        return { refusal: $challenge() };
      }
      return { context, identity };
    } catch (error) {
      if (!(error instanceof KerberosError)) throw error;

      const message =
        error.reason === KerberosFailureReason.ChannelBindingMismatch && channelBindings
          ? `The request's Kerberos channel binding matches none of the TLS certificates this instance found at ${channelBindings.endpoint.host}, so the computer saw a certificate this instance cannot see at that host name, such as one from a proxy that inspects HTTPS or from an internal address this instance does not resolve. Exclude ${channelBindings.endpoint.host} from HTTPS inspection and make sure this instance resolves it the same way computers do.`
          : error.message;
      await $recordRefusal(profileContext, clientIp, {
        reason: error.reason,
        computerName: error.clientName,
        ticketServiceName: error.serviceName?.slice(0, MAX_TICKET_SERVICE_NAME_LENGTH),
        ticketKeyVersion: error.keyVersion ?? undefined,
        message: message.slice(0, MAX_REFUSAL_MESSAGE_LENGTH)
      });

      return { refusal: $challenge() };
    }
  };

  const $buildTemplateInfoExtension = (context: TContext, templateOid = buildTemplateOid(context.junction.id)) =>
    buildTemplateInfoExtension(templateOid, context.config.templateMajorRevision, context.config.templateMinorRevision);

  const $resolveTtl = (context: TContext, clientIp: string, computerName: string) =>
    resolveMicrosoftAutoenrollmentTtl(context.profile, certificatePolicyDAL).catch(async (error: unknown) => {
      if (error instanceof BadRequestError) {
        await $recordRefusal(context, clientIp, {
          reason: MicrosoftAutoenrollmentFailureReason.ProfileMisconfigured,
          computerName,
          message: error.message
        });
      }
      throw error;
    });

  const $buildPolicyTemplate = async (context: TContext, ttl: string) => {
    const { profile, config, applicationId } = context;
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(context.caId);
    if (ca) assertCaInProfileProject(ca, profile);
    if (!ca?.internalCa?.activeCaCertId) {
      throw new BadRequestError({
        message: `The certificate authority of profile '${profile.slug}' has no active certificate, so it cannot issue certificates.`
      });
    }
    const { caCert } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      kmsDataKeyService,
      kmsKeyService
    });

    const templateOid = buildTemplateOid(context.junction.id);
    const validitySeconds = ms(ttl) / 1000;

    return {
      templateOid,
      templateName: profile.slug,
      validitySeconds,
      renewalPeriodSeconds: resolveRenewalPeriodSeconds(config.renewBeforeDays, validitySeconds),
      privateKey: resolveTemplatePrivateKey(profile.defaults?.keyAlgorithm),
      hashAlgorithm: resolveTemplateSignatureAlgorithm(profile.defaults).hash,
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

    const lookup = await loadLdapConnectionConfig(context.config.appConnectionId, {
      appConnectionDAL,
      kmsDataKeyService
    })
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
        describeUnreadableUserAccountControl(computer.samAccountName)
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
      kmsDataKeyService,
      kmsKeyService,
      shouldThrowLookupErrors: true
    });
    const storedCertificate = isCurrentCertificateValid
      ? await certificateDAL.findOneLiveFirst(
          {
            $in: { serialNumber: getSerialNumberSpellings(currentCertificate.serialNumber) },
            caId: context.caId,
            profileId: context.profile.id,
            applicationId: context.applicationId
          },
          certificateDAL.primaryNode()
        )
      : undefined;
    if (!storedCertificate || storedCertificate.deletedAt || storedCertificate.status === CertStatus.REVOKED) {
      return {
        refusal: `The certificate being renewed (serial ${currentCertificate.serialNumber}) was not issued from profile '${context.profile.slug}' in this application, has expired, was deleted, or is revoked.`
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
    return certificateRequestId
      ? certificateRequestDAL.findById(certificateRequestId, certificateDAL.primaryNode())
      : undefined;
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

    const metadata = await resourceMetadataDAL.find(
      { certificateRequestId: certificateRequest.id },
      { tx: certificateDAL.primaryNode() }
    );
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
    const isIssuedCertificateExpired = Boolean(issuedCertificate && issuedCertificate.notAfter <= new Date());
    const certificateBody =
      issuedCertificate && !isIssuedCertificateRevoked && !issuedCertificate.deletedAt && !isIssuedCertificateExpired
        ? await certificateBodyDAL.findOne({ certId: issuedCertificate.id }, certificateDAL.primaryNode())
        : undefined;
    if (!certificateBody) {
      let message = `Certificate request '${requestId}' was not issued in Infisical.`;
      if (issuedCertificate?.deletedAt) {
        message = `The certificate for request '${requestId}' was deleted in Infisical after it was approved.`;
      } else if (isIssuedCertificateRevoked) {
        message = `The certificate for request '${requestId}' was revoked in Infisical after it was approved.`;
      } else if (isIssuedCertificateExpired) {
        message = `The certificate for request '${requestId}' expired before this computer picked it up. The computer enrolls for a new certificate.`;
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
          profileName: context.profile.slug,
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
      validity: { ttl: await $resolveTtl(context, clientIp, identity.clientName) },
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
      onCertificateRequestPersisted: async (certificateRequest, tx) => {
        persisted.requestNumber = String(
          await microsoftAutoenrollmentRequestDAL.createRequestNumber(certificateRequest, tx)
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
    let mutualAuthHeaders: Record<string, string> = {};
    let envelope: TParsedSoapEnvelope | null = null;
    try {
      const profileContext = await $loadContext(applicationId, profileId);
      if (!profileContext) {
        return $soapResponse(
          buildSoapFault({ relatesTo: null, message: MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE }),
          {},
          NOT_ENABLED_STATUS_CODE
        );
      }

      const authentication = await $authenticate(profileContext, authorizationHeader, clientIp);
      if (authentication.refusal) return authentication.refusal;
      const { context, identity } = authentication;

      if (identity.responseToken) {
        mutualAuthHeaders = { "WWW-Authenticate": `${NEGOTIATE} ${identity.responseToken}` };
      }

      envelope = parseSoapEnvelope(body);
      const response = await respond(context, identity, envelope);
      return typeof response === "string"
        ? $soapResponse(response, mutualAuthHeaders)
        : { ...response, headers: { ...response.headers, ...mutualAuthHeaders } };
    } catch (error) {
      const relatesTo = envelope?.messageId ?? null;
      if (error instanceof BadRequestError || error instanceof ForbiddenRequestError) {
        return $fault(relatesTo, error.message, mutualAuthHeaders);
      }
      if (error instanceof NotFoundError) {
        logger.warn(
          error,
          `Microsoft Autoenrollment request refers to a removed resource [applicationId=${applicationId}] [profileId=${profileId}]`
        );
        return $fault(relatesTo, REMOVED_RESOURCE_FAILURE_MESSAGE, mutualAuthHeaders);
      }
      logger.error(
        error,
        `Unable to answer a Microsoft Autoenrollment request [applicationId=${applicationId}] [profileId=${profileId}]`
      );
      return $fault(relatesTo, UNEXPECTED_FAILURE_MESSAGE, mutualAuthHeaders);
    }
  };

  const getPolicies = (dto: TMicrosoftAutoenrollmentRequestDTO) =>
    $handle(dto, async (context, identity, envelope) => {
      if (envelope.operation !== SoapOperation.GetPolicies) {
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
        template: isAllowed
          ? await $buildPolicyTemplate(context, await $resolveTtl(context, dto.clientIp, identity.clientName))
          : null
      });
    });

  const requestSecurityToken = (dto: TMicrosoftAutoenrollmentRequestDTO) =>
    $handle(dto, async (context, identity, envelope) => {
      if (envelope.operation === SoapOperation.Issue) {
        return $issueCertificate(context, identity, envelope, dto.clientIp);
      }
      if (envelope.operation === SoapOperation.QueryTokenStatus) {
        return $queryTokenStatus(context, identity, envelope);
      }
      return $fault(
        envelope.messageId,
        "This enrollment URL only answers certificate requests and certificate status queries."
      );
    });

  return {
    getPolicies,
    requestSecurityToken
  };
};
