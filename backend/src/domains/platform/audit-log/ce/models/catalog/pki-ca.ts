import type { KerberosFailureReason } from "@app/lib/kerberos";

import { EventType } from "../event-type";
import type { TAuditLogCollapseSummary } from "./misc";
import type {
  TAuditLogAcmeChallengeType,
  TAuditLogAcmeIdentifierType,
  TAuditLogCaCrlRegenerationTrigger,
  TAuditLogCaStatus,
  TAuditLogMicrosoftAutoenrollmentFailureReason,
  TAuditLogMicrosoftAutoenrollmentIssuanceResult,
  TAuditLogMicrosoftAutoenrollmentKeytabSource,
  TAuditLogScepChallengeType,
  TAuditLogScepEnrollmentStatus
} from "./shared";

export type TCaKeySourceAuditMetadata = {
  keySource?: string;
  hsmConnectorId?: string;
  hsmConnectorName?: string;
  appConnectionId?: string;
  appConnectionName?: string;
  externalKeyId?: string;
  region?: string;
};

export interface CreateCa {
  type: EventType.CREATE_CA;
  metadata: TCaKeySourceAuditMetadata & {
    caId: string;
    name: string;
    dn?: string;
    isOcspEnabled?: boolean;
    crlValidityDays?: number;
  };
}

export interface GetCa {
  type: EventType.GET_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
  };
}

export interface GetCAs {
  type: EventType.GET_CAS;
  metadata: {
    caIds: string[];
  };
}

export interface UpdateCa {
  type: EventType.UPDATE_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
    status: TAuditLogCaStatus;
    isOcspEnabled?: boolean;
    crlValidityDays?: number;
  };
}

export interface DeleteCa {
  type: EventType.DELETE_CA;
  metadata: TCaKeySourceAuditMetadata & {
    caId: string;
    name: string;
    dn?: string;
  };
}

export interface RenewCa {
  type: EventType.RENEW_CA;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface ExportCertManagerProject {
  type: EventType.EXPORT_CERT_MANAGER_PROJECT;
  metadata: {
    sourceProjectId: string;
    destinationProjectId: string;
    exportedCertificateAuthorities: number;
    renamedCertificateAuthorities: { originalName: string; newName: string }[];
    exportedCertificatePolicies: number;
    renamedCertificatePolicies: { originalName: string; newName: string }[];
    exportedCertificateProfiles: number;
    skippedCertificateProfiles: number;
    renamedCertificateProfiles: { originalSlug: string; newSlug: string }[];
  };
}

export interface GetCaCsr {
  type: EventType.GET_CA_CSR;
  metadata: {
    caId: string;
    dn: string;
    maxPathLength?: number;
  };
}

export interface GetCaCerts {
  type: EventType.GET_CA_CERTS;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface GetCaCert {
  type: EventType.GET_CA_CERT;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface SignIntermediate {
  type: EventType.SIGN_INTERMEDIATE;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}

export interface ImportCaCert {
  type: EventType.IMPORT_CA_CERT;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface ImportCaCrossSignedCert {
  type: EventType.IMPORT_CA_CROSS_SIGNED_CERT;
  metadata: {
    caId: string;
    caName: string;
    issuer: string;
    serialNumber: string;
    notAfter: string;
    replacedSerialNumber?: string;
  };
}

export interface DeleteCaCrossSignedCert {
  type: EventType.DELETE_CA_CROSS_SIGNED_CERT;
  metadata: {
    caId: string;
    caName: string;
    issuer: string;
    serialNumber: string;
    notAfter: string;
  };
}

export interface GetCaCrls {
  type: EventType.GET_CA_CRLS;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface RegenerateCaCrl {
  type: EventType.REGENERATE_CA_CRL;
  metadata: {
    caId: string;
    caName: string;
    crlId: string;
    crlNumber: number;
    thisUpdate: string;
    nextUpdate: string;
    trigger: TAuditLogCaCrlRegenerationTrigger;
  };
}

export interface GenerateCaCertificate {
  type: EventType.GENERATE_CA_CERTIFICATE;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
    parentCaId?: string;
  };
}

export interface InstallCaCertVenafi {
  type: EventType.INSTALL_CA_CERT_VENAFI;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface InstallCaCertAdcs {
  type: EventType.INSTALL_CA_CERT_ADCS;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface CreateCaSigningConfig {
  type: EventType.CREATE_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    signingConfigType: string;
  };
}

export interface GetCaSigningConfig {
  type: EventType.GET_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface UpdateCaSigningConfig {
  type: EventType.UPDATE_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    signingConfigType: string;
  };
}

export interface GetCaAutoRenewalConfig {
  type: EventType.GET_CA_AUTO_RENEWAL_CONFIG;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface UpdateCaAutoRenewalConfig {
  type: EventType.UPDATE_CA_AUTO_RENEWAL_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    autoRenewalEnabled?: boolean;
  };
}

export interface GetCaCertificateTemplates {
  type: EventType.GET_CA_CERTIFICATE_TEMPLATES;
  metadata: {
    caId: string;
    dn: string;
  };
}

export interface CreateCertificateTemplateEstConfig {
  type: EventType.CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
    isEnabled: boolean;
  };
}

export interface GetAzureAdCsTemplatesEvent {
  type: EventType.GET_AZURE_AD_TEMPLATES;
  metadata: {
    caId: string;
    amount: number;
  };
}

export interface GetAdcsTemplatesEvent {
  type: EventType.GET_ADCS_TEMPLATES;
  metadata: {
    caId: string;
    amount: number;
  };
}

export interface UpdateCertificateTemplateEstConfig {
  type: EventType.UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
    isEnabled: boolean;
  };
}

export interface GetCertificateTemplateEstConfig {
  type: EventType.GET_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
  };
}

export interface SetPkiApplicationAcmeEnrollment {
  type: EventType.SET_PKI_APPLICATION_ACME_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    skipDnsOwnershipVerification: boolean;
    skipEabBinding: boolean;
  };
}

export interface ClearPkiApplicationAcmeEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_ACME_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface RevealPkiApplicationAcmeEabSecret {
  type: EventType.REVEAL_PKI_APPLICATION_ACME_EAB_SECRET;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface RotatePkiApplicationAcmeEabSecret {
  type: EventType.ROTATE_PKI_APPLICATION_ACME_EAB_SECRET;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface SetPkiApplicationScepEnrollment {
  type: EventType.SET_PKI_APPLICATION_SCEP_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    challengeType: string;
    signRaWithCa: boolean;
    validationConnectionId?: string;
    validationConnectionName?: string;
  };
}

export interface ClearPkiApplicationScepEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_SCEP_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface SetPkiApplicationMicrosoftAutoenrollmentEnrollment {
  type: EventType.SET_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
    servicePrincipalName: string;
    keyVersion: number;
    connectionId: string;
    connectionName: string;
    allowedGroups: { sid: string; name: string }[];
    renewBeforeDays: number;
    allowAnyChannelBinding: boolean;
    keytabSource: TAuditLogMicrosoftAutoenrollmentKeytabSource;
    reusedFromProfileId?: string;
    reusedFromProfileName?: string;
  };
}

export interface ClearPkiApplicationMicrosoftAutoenrollmentEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
  };
}

export interface ReenrollPkiApplicationMicrosoftAutoenrollmentComputers {
  type: EventType.REENROLL_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_COMPUTERS;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
    templateMajorRevision: number;
  };
}

export interface CreateAcmeAccountEvent {
  type: EventType.CREATE_ACME_ACCOUNT;
  metadata: {
    accountId: string;
    publicKeyThumbprint: string;
    emails?: string[];
  };
}

export interface RetrieveAcmeAccountEvent {
  type: EventType.RETRIEVE_ACME_ACCOUNT;
  metadata: {
    accountId: string;
    publicKeyThumbprint: string;
  };
}

export interface CreateAcmeOrderEvent {
  type: EventType.CREATE_ACME_ORDER;
  metadata: {
    orderId: string;
    identifiers: Array<{
      type: TAuditLogAcmeIdentifierType;
      value: string;
      wildcard?: boolean;
    }>;
  };
}

export interface FinalizeAcmeOrderEvent {
  type: EventType.FINALIZE_ACME_ORDER;
  metadata: {
    orderId: string;
    commonName: string;
    csr: string;
  };
}

export interface DownloadAcmeCertificateEvent {
  type: EventType.DOWNLOAD_ACME_CERTIFICATE;
  metadata: {
    orderId: string;
    certificateId: string;
    commonName: string;
    serialNumber: string;
  };
}

export interface RespondToAcmeChallengeEvent {
  type: EventType.RESPOND_TO_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: TAuditLogAcmeChallengeType;
  };
}

export interface PassedAcmeChallengeEvent {
  type: EventType.PASS_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: TAuditLogAcmeChallengeType;
  };
}

export interface AttemptAcmeChallengeEvent {
  type: EventType.ATTEMPT_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: TAuditLogAcmeChallengeType;
    retryCount: number;
    errorMessage: string;
  };
}

export interface FailAcmeChallengeEvent {
  type: EventType.FAIL_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: TAuditLogAcmeChallengeType;
    retryCount: number;
    errorMessage: string;
  };
}

export interface ScepEnrollmentEvent {
  type: EventType.SCEP_ENROLLMENT;
  metadata: {
    profileId: string;
    profileSlug: string;
    transactionId: string;
    csrSubject: string;
    challengeType: TAuditLogScepChallengeType;
    status: TAuditLogScepEnrollmentStatus;
    failReason?: string;
    issuedCertificateId?: string;
    issuedSerialNumber?: string;
    clientIp: string;
  };
}

export interface ScepRenewalEvent {
  type: EventType.SCEP_RENEWAL;
  metadata: {
    profileId: string;
    profileSlug: string;
    transactionId: string;
    csrSubject: string;
    existingCertificateSerial?: string;
    existingCertificateSubject?: string;
    status: TAuditLogScepEnrollmentStatus;
    failReason?: string;
    issuedCertificateId?: string;
    issuedSerialNumber?: string;
    clientIp: string;
  };
}

export interface MicrosoftAutoenrollmentIssuanceEvent {
  type: EventType.MICROSOFT_AUTOENROLLMENT_ISSUANCE | EventType.MICROSOFT_AUTOENROLLMENT_RENEWAL;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
    profileName: string;
    computerName: string;
    computerSid: string;
    dnsHostName: string;
    result: TAuditLogMicrosoftAutoenrollmentIssuanceResult;
    certificateId?: string;
    serialNumber?: string;
    certificateRequestId: string;
    requestNumber: string;
  };
}

export interface MicrosoftAutoenrollmentRequestRefusedEvent {
  type: EventType.MICROSOFT_AUTOENROLLMENT_REQUEST_REFUSED;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
    profileName: string;
    reason: KerberosFailureReason | TAuditLogMicrosoftAutoenrollmentFailureReason;
    computerName?: string;
    ticketServiceName?: string;
    ticketKeyVersion?: number;
    message?: string;
  } & TAuditLogCollapseSummary;
}

export interface ScepDynamicChallengeGeneratedEvent {
  type: EventType.SCEP_DYNAMIC_CHALLENGE_GENERATED;
  metadata: {
    profileId: string;
    profileSlug: string;
    expiresAt: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export type TPkiCaAuditLogEvent =
  | CreateCa
  | GetCa
  | GetCAs
  | UpdateCa
  | DeleteCa
  | RenewCa
  | ExportCertManagerProject
  | GetCaCsr
  | GetCaCerts
  | GetCaCert
  | SignIntermediate
  | ImportCaCert
  | ImportCaCrossSignedCert
  | DeleteCaCrossSignedCert
  | GetCaCrls
  | RegenerateCaCrl
  | GenerateCaCertificate
  | InstallCaCertVenafi
  | InstallCaCertAdcs
  | CreateCaSigningConfig
  | GetCaSigningConfig
  | UpdateCaSigningConfig
  | GetCaAutoRenewalConfig
  | UpdateCaAutoRenewalConfig
  | GetCaCertificateTemplates
  | CreateCertificateTemplateEstConfig
  | GetAzureAdCsTemplatesEvent
  | GetAdcsTemplatesEvent
  | UpdateCertificateTemplateEstConfig
  | GetCertificateTemplateEstConfig
  | SetPkiApplicationAcmeEnrollment
  | ClearPkiApplicationAcmeEnrollment
  | RevealPkiApplicationAcmeEabSecret
  | RotatePkiApplicationAcmeEabSecret
  | SetPkiApplicationScepEnrollment
  | ClearPkiApplicationScepEnrollment
  | CreateAcmeAccountEvent
  | RetrieveAcmeAccountEvent
  | CreateAcmeOrderEvent
  | FinalizeAcmeOrderEvent
  | DownloadAcmeCertificateEvent
  | RespondToAcmeChallengeEvent
  | PassedAcmeChallengeEvent
  | AttemptAcmeChallengeEvent
  | FailAcmeChallengeEvent
  | ScepEnrollmentEvent
  | ScepRenewalEvent
  | ScepDynamicChallengeGeneratedEvent
  | SetPkiApplicationMicrosoftAutoenrollmentEnrollment
  | ClearPkiApplicationMicrosoftAutoenrollmentEnrollment
  | ReenrollPkiApplicationMicrosoftAutoenrollmentComputers
  | MicrosoftAutoenrollmentIssuanceEvent
  | MicrosoftAutoenrollmentRequestRefusedEvent;
