import { EventType } from "../event-type";
import type { TAuditLogCollapseSummary } from "./misc";
import type {
  TAuditLogCertExtendedKeyUsage,
  TAuditLogCertKeyUsage,
  TAuditLogCertStatus,
  TAuditLogCertificateIssuanceOperation,
  TAuditLogCertificateRenewalKeySource,
  TAuditLogCertificateRequestStatus,
  TAuditLogCertificateRevocationSource,
  TAuditLogCertificateSource,
  TAuditLogCrlReason,
  TAuditLogEnrollmentType,
  TAuditLogPkiAlertEventType,
  TAuditLogPkiItemType,
  TAuditLogTrustedIp
} from "./shared";

export interface LoginIdentityTlsCertAuthEvent {
  type: EventType.LOGIN_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    identityTlsCertAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityTlsCertAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_TLS_CERT_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityTlsCertAuthEvent {
  type: EventType.ADD_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    allowedCommonNames: string | null | undefined;
    allowedSubjectAltNames: string[] | null | undefined;
    verifyClientCertificateChain: boolean;
    bindAccessTokenToCertificate: boolean;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityTlsCertAuthEvent {
  type: EventType.REVOKE_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityTlsCertAuthEvent {
  type: EventType.UPDATE_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    allowedCommonNames: string | null | undefined;
    allowedSubjectAltNames: string[] | null | undefined;
    verifyClientCertificateChain?: boolean;
    bindAccessTokenToCertificate?: boolean;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityTlsCertAuthEvent {
  type: EventType.GET_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface IssueCert {
  type: EventType.ISSUE_CERT;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}

export interface ImportCert {
  type: EventType.IMPORT_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
    certificateProfileId?: string;
    profileName?: string;
    caId?: string;
    caName?: string;
    hasCsr?: boolean;
  };
}

export interface SignCert {
  type: EventType.SIGN_CERT;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}

export interface GetCert {
  type: EventType.GET_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface DeleteCert {
  type: EventType.DELETE_CERT;
  metadata: {
    certId: string;
    cn: string;
    friendlyName?: string | null;
    serialNumber: string;
    notAfter: string;
    source: TAuditLogCertificateSource;
    statusAtDeletion: TAuditLogCertStatus;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface RevokeCert {
  type: EventType.REVOKE_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
    revocationReason?: TAuditLogCrlReason;
    approvalRequestId?: string;
    requesterName?: string;
    requesterEmail?: string;
    crlWarning?: string;
    source?: TAuditLogCertificateRevocationSource;
    revokedThroughCertId?: string;
    revokedThroughCertName?: string;
  };
}

export interface RequestCertRevocation {
  type: EventType.REQUEST_CERT_REVOCATION;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
    revocationReason: TAuditLogCrlReason;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    approvalPolicyId: string;
    approvalPolicyName: string;
  };
}

export interface CertRevocationFailed {
  type: EventType.CERT_REVOCATION_FAILED;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId: string;
    applicationName?: string | null;
    revocationReason: TAuditLogCrlReason;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    error: string;
  };
}

export interface AssignCertToApplication {
  type: EventType.ASSIGN_CERT_TO_APPLICATION;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId: string;
    applicationName: string;
  };
}

export interface GetCertBody {
  type: EventType.GET_CERT_BODY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface GetCertPrivateKey {
  type: EventType.GET_CERT_PRIVATE_KEY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface GetCertBundle {
  type: EventType.GET_CERT_BUNDLE;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface GetCertPkcs12 {
  type: EventType.EXPORT_CERT_PKCS12;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface CreatePkiAlert {
  type: EventType.CREATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId?: string;
    applicationId?: string;
    applicationName?: string;
    name: string;
    alertBefore?: string;
    eventType: TAuditLogPkiAlertEventType;
    recipientEmails?: string;
  };
}

export interface GetPkiAlert {
  type: EventType.GET_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface UpdatePkiAlert {
  type: EventType.UPDATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId?: string;
    applicationId?: string;
    applicationName?: string;
    name?: string;
    alertBefore?: string;
    eventType?: TAuditLogPkiAlertEventType;
    recipientEmails?: string;
  };
}

export interface DeletePkiAlert {
  type: EventType.DELETE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface CreatePkiCollection {
  type: EventType.CREATE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
    name: string;
  };
}

export interface GetPkiCollection {
  type: EventType.GET_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
  };
}

export interface UpdatePkiCollection {
  type: EventType.UPDATE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
    name?: string;
  };
}

export interface DeletePkiCollection {
  type: EventType.DELETE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
  };
}

export interface GetPkiCollectionItems {
  type: EventType.GET_PKI_COLLECTION_ITEMS;
  metadata: {
    pkiCollectionId: string;
  };
}

export interface AddPkiCollectionItem {
  type: EventType.ADD_PKI_COLLECTION_ITEM;
  metadata: {
    pkiCollectionItemId: string;
    pkiCollectionId: string;
    type: TAuditLogPkiItemType;
    itemId: string;
  };
}

export interface DeletePkiCollectionItem {
  type: EventType.DELETE_PKI_COLLECTION_ITEM;
  metadata: {
    pkiCollectionItemId: string;
    pkiCollectionId: string;
  };
}

export interface CreateCertificateInventoryView {
  type: EventType.CREATE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name: string;
    filters?: Record<string, unknown>;
    columns?: string[];
    isShared?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface UpdateCertificateInventoryView {
  type: EventType.UPDATE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name?: string;
    filters?: Record<string, unknown>;
    columns?: string[];
    isShared?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface DeleteCertificateInventoryView {
  type: EventType.DELETE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface CreatePkiSubscriber {
  type: EventType.CREATE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    caId?: string;
    name: string;
    commonName: string;
    ttl?: string;
    subjectAlternativeNames: string[];
    keyUsages: TAuditLogCertKeyUsage[];
    extendedKeyUsages: TAuditLogCertExtendedKeyUsage[];
  };
}

export interface UpdatePkiSubscriber {
  type: EventType.UPDATE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    caId?: string;
    name?: string;
    commonName?: string;
    ttl?: string;
    subjectAlternativeNames?: string[];
    keyUsages?: TAuditLogCertKeyUsage[];
    extendedKeyUsages?: TAuditLogCertExtendedKeyUsage[];
  };
}

export interface DeletePkiSubscriber {
  type: EventType.DELETE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    name: string;
  };
}

export interface GetPkiSubscriber {
  type: EventType.GET_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    name: string;
  };
}

export interface IssuePkiSubscriberCert {
  type: EventType.ISSUE_PKI_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
    serialNumber?: string;
  };
}

export interface AutomatedRenewPkiSubscriberCert {
  type: EventType.AUTOMATED_RENEW_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
  };
}

export interface AutomatedRenewCertificate {
  type: EventType.AUTOMATED_RENEW_CERTIFICATE;
  metadata: {
    certificateId: string;
    newCertificateId?: string;
    certificateRequestId?: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
    status: TAuditLogCertificateRequestStatus;
    serialNumber?: string;
  };
}

export interface AutomatedRenewCertificateFailed {
  type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
    error: string;
  };
}

export interface CertificateIssuanceFailedEvent {
  type: EventType.CERTIFICATE_ISSUANCE_FAILED;
  metadata: TAuditLogCollapseSummary & {
    operation: TAuditLogCertificateIssuanceOperation;
    enrollmentType?: TAuditLogEnrollmentType;
    certificateProfileId?: string;
    profileName?: string;
    caId?: string;
    caName?: string;
    certificateRequestId?: string;
    originalCertificateId?: string;
    commonName?: string;
    applicationId?: string;
    applicationName?: string;
    errorName: string;
    error: string;
  };
}

export interface SignPkiSubscriberCert {
  type: EventType.SIGN_PKI_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
    serialNumber: string;
  };
}

export interface ListPkiSubscriberCerts {
  type: EventType.LIST_PKI_SUBSCRIBER_CERTS;
  metadata: {
    subscriberId: string;
    name: string;
    projectId: string;
  };
}

export interface GetSubscriberActiveCertBundle {
  type: EventType.GET_SUBSCRIBER_ACTIVE_CERT_BUNDLE;
  metadata: {
    subscriberId: string;
    name: string;
    certId: string;
    serialNumber: string;
  };
}

export interface CreateCertificatePolicy {
  type: EventType.CREATE_CERTIFICATE_POLICY;
  metadata:
    | {
        certificatePolicyId: string;
        name: string;
        projectId: string;
        customExtensionOids?: string[];
      }
    | {
        certificatePolicyId: string;
        caId: string;
        pkiCollectionId: string;
        name: string;
        commonName: string;
        subjectAlternativeName: string;
        ttl: string;
        projectId: string;
      };
}

export interface UpdateCertificatePolicy {
  type: EventType.UPDATE_CERTIFICATE_POLICY;
  metadata:
    | {
        certificatePolicyId: string;
        name: string;
        customExtensionOids?: string[];
      }
    | {
        certificatePolicyId: string;
        caId: string;
        pkiCollectionId: string;
        name: string;
        commonName: string;
        subjectAlternativeName: string;
        ttl: string;
        projectId: string;
      };
}

export interface DeleteCertificatePolicy {
  type: EventType.DELETE_CERTIFICATE_POLICY;
  metadata: {
    certificatePolicyId: string;
    name: string;
  };
}

export interface GetCertificatePolicy {
  type: EventType.GET_CERTIFICATE_POLICY;
  metadata: {
    certificatePolicyId: string;
    name: string;
  };
}

export interface ListCertificatePolicies {
  type: EventType.LIST_CERTIFICATE_POLICIES;
  metadata: {
    projectId: string;
  };
}

export interface CreateCertificateProfile {
  type: EventType.CREATE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
    projectId: string;
    enrollmentType: string;
    issuerType: string;
  };
}

export interface UpdateCertificateProfile {
  type: EventType.UPDATE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

export interface DeleteCertificateProfile {
  type: EventType.DELETE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

export interface CreatePkiApplication {
  type: EventType.CREATE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
    profileIds?: string[];
  };
}

export interface UpdatePkiApplication {
  type: EventType.UPDATE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

export interface DeletePkiApplication {
  type: EventType.DELETE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

export interface GetPkiApplication {
  type: EventType.GET_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

export interface ListPkiApplications {
  type: EventType.LIST_PKI_APPLICATIONS;
  metadata: {
    projectId: string;
  };
}

export interface AttachPkiApplicationProfiles {
  type: EventType.ATTACH_PKI_APPLICATION_PROFILES;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileIds: string[];
  };
}

export interface DetachPkiApplicationProfile {
  type: EventType.DETACH_PKI_APPLICATION_PROFILE;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
  };
}

export interface AddPkiApplicationMember {
  type: EventType.ADD_PKI_APPLICATION_MEMBER;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
    role: string;
  };
}

export interface UpdatePkiApplicationMemberRole {
  type: EventType.UPDATE_PKI_APPLICATION_MEMBER_ROLE;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
    role: string;
  };
}

export interface RemovePkiApplicationMember {
  type: EventType.REMOVE_PKI_APPLICATION_MEMBER;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
  };
}

export interface ListPkiApplicationMembers {
  type: EventType.LIST_PKI_APPLICATION_MEMBERS;
  metadata: {
    applicationId: string;
    applicationName?: string;
  };
}

export interface GetPkiApplicationEnrollment {
  type: EventType.GET_PKI_APPLICATION_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface SetPkiApplicationApiEnrollment {
  type: EventType.SET_PKI_APPLICATION_API_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    autoRenew: boolean;
    renewBeforeDays: number | null;
  };
}

export interface ClearPkiApplicationApiEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_API_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface SetPkiApplicationEstEnrollment {
  type: EventType.SET_PKI_APPLICATION_EST_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    disableBootstrapCaValidation: boolean;
  };
}

export interface ClearPkiApplicationEstEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_EST_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

export interface GetCertManagerInstanceState {
  type: EventType.GET_CERT_MANAGER_INSTANCE_STATE;
  metadata: {
    activeProjectId: string | null;
    projectCount: number;
    isMultiInstance: boolean;
  };
}

export interface SetCertManagerActiveProject {
  type: EventType.SET_CERT_MANAGER_ACTIVE_PROJECT;
  metadata: {
    activeProjectId: string;
    previousActiveProjectId: string | null;
    projectName: string;
  };
}

export interface InviteCertManagerUsers {
  type: EventType.INVITE_CERT_MANAGER_USERS;
  metadata: {
    emails: string[];
    usernames: string[];
    userIds: string[];
    membershipIds: string[];
    roleSlugs?: string[];
  };
}

export interface UpdateCertManagerUser {
  type: EventType.UPDATE_CERT_MANAGER_USER;
  metadata: {
    userId: string;
    roles: string[];
  };
}

export interface RemoveCertManagerUser {
  type: EventType.REMOVE_CERT_MANAGER_USER;
  metadata: {
    userId: string;
    membershipId: string;
  };
}

export interface RemoveCertManagerUsersBatch {
  type: EventType.REMOVE_CERT_MANAGER_USERS_BATCH;
  metadata: {
    emails: string[];
    usernames: string[];
    userIds: string[];
    membershipIds: string[];
  };
}

export interface AddCertManagerIdentity {
  type: EventType.ADD_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
    roles: string[];
  };
}

export interface UpdateCertManagerIdentity {
  type: EventType.UPDATE_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
    roles: string[];
  };
}

export interface RemoveCertManagerIdentity {
  type: EventType.REMOVE_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
  };
}

export interface AddCertManagerGroup {
  type: EventType.ADD_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
    roles: string[];
  };
}

export interface UpdateCertManagerGroup {
  type: EventType.UPDATE_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
    roles: string[];
  };
}

export interface RemoveCertManagerGroup {
  type: EventType.REMOVE_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
  };
}

export interface GetCertificateProfile {
  type: EventType.GET_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

export interface ListCertificateProfiles {
  type: EventType.LIST_CERTIFICATE_PROFILES;
  metadata: {
    projectId: string;
  };
}

export interface IssueCertificateFromProfile {
  type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    certificateRequestId: string;
    commonName: string;
    profileName: string;
    status: TAuditLogCertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface SignCertificateFromProfile {
  type: EventType.SIGN_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    certificateRequestId: string;
    profileName: string;
    commonName: string;
    status: TAuditLogCertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface OrderCertificateFromProfile {
  type: EventType.ORDER_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateRequestId: string;
    commonName: string;
    profileName: string;
    status: TAuditLogCertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface GetCertificateProfileLatestActiveBundle {
  type: EventType.GET_CERTIFICATE_PROFILE_LATEST_ACTIVE_BUNDLE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    commonName: string;
    profileName: string;
    serialNumber: string;
  };
}

export interface RenewCertificate {
  type: EventType.RENEW_CERTIFICATE;
  metadata: {
    originalCertificateId: string;
    newCertificateId: string;
    certificateRequestId: string;
    profileName: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    serialNumber?: string;
    renewalKeySource: TAuditLogCertificateRenewalKeySource;
    externalConfiguration?: { reissue?: boolean };
    changedAttributes: TAuditLogRenewalChange[];
    status?: TAuditLogCertificateRequestStatus;
  };
}

export interface GetPkiSigningOperationsEvent {
  type: EventType.GET_PKI_SIGNING_OPERATIONS;
  metadata: {
    signerId: string;
    signerName: string;
    count: number;
  };
}

export interface GetPkiSigningOperationEvent {
  type: EventType.GET_PKI_SIGNING_OPERATION;
  metadata: {
    signerId: string;
    signerName: string;
    operationId: string;
  };
}

export interface UpdateCertificateRenewalConfigEvent {
  type: EventType.UPDATE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    renewBeforeDays: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface UpdateCertificateMetadataEvent {
  type: EventType.UPDATE_CERTIFICATE_METADATA;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    metadata: { key: string; value: string }[];
  };
}

export interface UpdateCertificateCleanupConfigEvent {
  type: EventType.UPDATE_CERTIFICATE_CLEANUP_CONFIG;
  metadata: {
    projectId: string;
    isEnabled: boolean;
    postExpiryRetentionDays: number;
    skipCertsWithActiveSyncs: boolean;
  };
}

export interface CertificateCleanupCompletedEvent {
  type: EventType.CERTIFICATE_CLEANUP_COMPLETED;
  metadata: {
    deletedCount: number;
    certificateSerialNumbers: string[];
  };
}

export interface DisableCertificateRenewalConfigEvent {
  type: EventType.DISABLE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

export interface CreateCertificateRequestEvent {
  type: EventType.CREATE_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
    profileId?: string;
    caId?: string;
    commonName?: string;
  };
}

export interface GetCertificateRequestEvent {
  type: EventType.GET_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
    applicationId?: string | null;
    applicationName?: string | null;
    commonName?: string;
    status?: string;
    serialNumber?: string;
  };
}

export interface GetCertificateFromRequestEvent {
  type: EventType.GET_CERTIFICATE_FROM_REQUEST;
  metadata: {
    certificateRequestId: string;
    certificateId?: string;
  };
}

export interface TriggerCertificateRequestValidationEvent {
  type: EventType.TRIGGER_CERTIFICATE_REQUEST_VALIDATION;
  metadata: {
    certificateRequestId: string;
    applicationId?: string | null;
    applicationName?: string | null;
    status: string;
    orderStatus?: string;
  };
}

export interface CancelCertificateRequestEvent {
  type: EventType.CANCEL_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
    applicationId?: string | null;
    applicationName?: string | null;
    commonName?: string;
    cancelled: boolean;
    previousStatus: string;
    previousPendingMessage: string | null;
  };
}

export interface ListCertificateRequestsEvent {
  type: EventType.LIST_CERTIFICATE_REQUESTS;
  metadata: {
    offset: number;
    limit: number;
    search?: string;
    status?: string;
    count: number;
    certificateRequestIds: string[];
  };
}

export type TAuditLogRenewalChange = {
  field:
    | "commonName"
    | "organization"
    | "organizationalUnit"
    | "country"
    | "state"
    | "locality"
    | "domainComponents"
    | "altNames"
    | "keyUsages"
    | "extendedKeyUsages"
    | "signatureAlgorithm"
    | "keyAlgorithm"
    | "ttl"
    | "basicConstraints"
    | "customExtensions";
  from: string;
  to: string;
};

export type TPkiAuditLogEvent =
  | LoginIdentityTlsCertAuthEvent
  | LoginIdentityTlsCertAuthFailedEvent
  | AddIdentityTlsCertAuthEvent
  | DeleteIdentityTlsCertAuthEvent
  | UpdateIdentityTlsCertAuthEvent
  | GetIdentityTlsCertAuthEvent
  | IssueCert
  | ImportCert
  | SignCert
  | GetCert
  | DeleteCert
  | RevokeCert
  | RequestCertRevocation
  | CertRevocationFailed
  | AssignCertToApplication
  | GetCertBody
  | GetCertPrivateKey
  | GetCertBundle
  | GetCertPkcs12
  | CreatePkiAlert
  | GetPkiAlert
  | UpdatePkiAlert
  | DeletePkiAlert
  | CreatePkiCollection
  | GetPkiCollection
  | UpdatePkiCollection
  | DeletePkiCollection
  | GetPkiCollectionItems
  | AddPkiCollectionItem
  | DeletePkiCollectionItem
  | CreateCertificateInventoryView
  | UpdateCertificateInventoryView
  | DeleteCertificateInventoryView
  | CreatePkiSubscriber
  | UpdatePkiSubscriber
  | DeletePkiSubscriber
  | GetPkiSubscriber
  | IssuePkiSubscriberCert
  | AutomatedRenewPkiSubscriberCert
  | AutomatedRenewCertificate
  | AutomatedRenewCertificateFailed
  | CertificateIssuanceFailedEvent
  | SignPkiSubscriberCert
  | ListPkiSubscriberCerts
  | GetSubscriberActiveCertBundle
  | CreateCertificatePolicy
  | UpdateCertificatePolicy
  | DeleteCertificatePolicy
  | GetCertificatePolicy
  | ListCertificatePolicies
  | CreateCertificateProfile
  | UpdateCertificateProfile
  | DeleteCertificateProfile
  | CreatePkiApplication
  | UpdatePkiApplication
  | DeletePkiApplication
  | GetPkiApplication
  | ListPkiApplications
  | AttachPkiApplicationProfiles
  | DetachPkiApplicationProfile
  | AddPkiApplicationMember
  | UpdatePkiApplicationMemberRole
  | RemovePkiApplicationMember
  | ListPkiApplicationMembers
  | GetPkiApplicationEnrollment
  | SetPkiApplicationApiEnrollment
  | ClearPkiApplicationApiEnrollment
  | SetPkiApplicationEstEnrollment
  | ClearPkiApplicationEstEnrollment
  | GetCertManagerInstanceState
  | SetCertManagerActiveProject
  | InviteCertManagerUsers
  | UpdateCertManagerUser
  | RemoveCertManagerUser
  | RemoveCertManagerUsersBatch
  | AddCertManagerIdentity
  | UpdateCertManagerIdentity
  | RemoveCertManagerIdentity
  | AddCertManagerGroup
  | UpdateCertManagerGroup
  | RemoveCertManagerGroup
  | GetCertificateProfile
  | ListCertificateProfiles
  | IssueCertificateFromProfile
  | SignCertificateFromProfile
  | OrderCertificateFromProfile
  | GetCertificateProfileLatestActiveBundle
  | RenewCertificate
  | GetPkiSigningOperationsEvent
  | GetPkiSigningOperationEvent
  | UpdateCertificateRenewalConfigEvent
  | UpdateCertificateMetadataEvent
  | UpdateCertificateCleanupConfigEvent
  | CertificateCleanupCompletedEvent
  | DisableCertificateRenewalConfigEvent
  | CreateCertificateRequestEvent
  | GetCertificateRequestEvent
  | GetCertificateFromRequestEvent
  | TriggerCertificateRequestValidationEvent
  | CancelCertificateRequestEvent
  | ListCertificateRequestsEvent;
