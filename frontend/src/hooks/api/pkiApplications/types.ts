import { CaType } from "@app/hooks/api/ca/enums";
import { ScepChallengeType } from "@app/hooks/api/certificateProfiles/types";

/**
 * Mirror of backend's `ResourcePermissionSub` for type-safe `permission.can(...)` checks
 * on the application's resource ability. Keep in sync with
 * `backend/src/ee/services/permission/resource-permission.ts`.
 */
export enum PkiApplicationResourceSub {
  Application = "certificate-application",
  ApplicationEnrollment = "certificate-application-enrollment",
  ApprovalPolicies = "approval-policies",
  Certificates = "certificates",
  CertificateInventoryViews = "certificate-inventory-views",
  PkiSyncs = "pki-syncs",
  PkiAlerts = "pki-alerts",
  ApprovalRequests = "approval-requests",
  ApprovalRequestGrants = "approval-request-grants",
  Member = "member",
  Role = "role"
}

export enum PkiApplicationResourceActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete",
  Create = "create",
  List = "list",
  ReadPrivateKey = "read-private-key",
  Import = "import",
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret",
  GenerateScepChallenge = "generate-scep-challenge",
  ManageProfiles = "manage-profiles"
}

export type TPkiApplicationPermissionSet = [string, string];

export type TPkiApplication = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPkiApplicationListItem = TPkiApplication & {
  profileCount: number;
  memberCount: number;
  certificateCount: number;
};

export type TPkiApplicationProfile = {
  applicationId: string;
  profileId: string;
  profileSlug: string;
  profileDescription?: string | null;
  estConfigId?: string | null;
  apiConfigId?: string | null;
  acmeConfigId?: string | null;
  scepConfigId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPkiApplicationMemberDetails = {
  name: string | null;
  email?: string | null;
  username?: string | null;
  authMethod?: string | null;
  slug?: string | null;
};

export type TPkiApplicationMember = {
  membershipId: string;
  applicationId: string;
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  actorGroupId?: string | null;
  role: string;
  customRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
  details?: TPkiApplicationMemberDetails | null;
};

export { ScepChallengeType };

export type TPkiApplicationEnrollmentState = {
  applicationId: string;
  profileId: string;
  api: { id: string; autoRenew: boolean; renewBeforeDays: number | null } | null;
  est: {
    id: string;
    disableBootstrapCaValidation: boolean;
    estEndpointUrl: string;
  } | null;
  acme: {
    id: string;
    skipDnsOwnershipVerification: boolean;
    skipEabBinding: boolean;
    directoryUrl: string;
  } | null;
  scep: {
    id: string;
    challengeType: ScepChallengeType;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes: number | null;
    dynamicChallengeMaxPending: number | null;
    scepEndpointUrl: string;
    challengeEndpointUrl: string | null;
    raCertificatePem: string;
    raCertExpiresAt: string;
    validationConnectionId: string | null;
    signRaWithCa: boolean;
  } | null;
  raCaSigningSupported: boolean;
  caType: CaType;
  estConfigured: boolean;
  acmeConfigured: boolean;
  scepConfigured: boolean;
};

export type TCreatePkiApplicationDTO = {
  name: string;
  description?: string;
  profileIds?: string[];
};

export type TUpdatePkiApplicationDTO = {
  applicationId: string;
  name?: string;
  description?: string | null;
};

export type TDeletePkiApplicationDTO = {
  applicationId: string;
};

export type TAttachPkiApplicationProfilesDTO = {
  applicationId: string;
  profileIds: string[];
};

export type TDetachPkiApplicationProfileDTO = {
  applicationId: string;
  profileId: string;
};

export type TPkiApplicationMemberKind = "user" | "identity" | "group";

export type TAddPkiApplicationMemberDTO = {
  applicationId: string;
  kind: TPkiApplicationMemberKind;
  memberId: string;
  role: string;
};

export type TUpdatePkiApplicationMemberRoleDTO = {
  applicationId: string;
  kind: TPkiApplicationMemberKind;
  memberId: string;
  role: string;
};

export type TRemovePkiApplicationMemberDTO = {
  applicationId: string;
  kind: TPkiApplicationMemberKind;
  memberId: string;
};

export type TListPkiApplicationsParams = {
  search?: string;
  limit?: number;
  offset?: number;
  applicationIds?: string[];
};

export type TListPkiApplicationsResponse = {
  applications: TPkiApplicationListItem[];
  total: number;
};

export type TPkiApplicationResponse = {
  application: TPkiApplication;
};

export type TSetApiEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  autoRenew: boolean;
  renewBeforeDays?: number;
};

export type TClearEnrollmentMethodDTO = {
  applicationId: string;
  profileId: string;
};

export type TSetEstEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  passphrase: string;
  disableBootstrapCaValidation?: boolean;
  caChain?: string;
};

export type TSetAcmeEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  skipDnsOwnershipVerification?: boolean;
  skipEabBinding?: boolean;
};

export type TRevealAcmeEabSecretResponse = {
  applicationId: string;
  profileId: string;
  eabKid: string;
  eabSecret: string;
};

export type TSetScepEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  challengeType?: ScepChallengeType;
  challengePassword?: string;
  includeCaCertInResponse?: boolean;
  allowCertBasedRenewal?: boolean;
  dynamicChallengeExpiryMinutes?: number;
  dynamicChallengeMaxPending?: number;
  validationConnectionId?: string;
  signRaWithCa?: boolean;
};
