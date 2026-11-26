import { format } from "date-fns";
import ms from "ms";

import { getCertificateLabel } from "@app/components/utilities/certificateDisplayUtils";
import {
  ApprovalPolicyType,
  TCertificateActionPolicyType
} from "@app/hooks/api/approvalPolicies/types";
import { TApprovalRequest } from "@app/hooks/api/approvalRequests/types";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { CaType } from "@app/hooks/api/ca/enums";
import { getEnrollmentTypeName } from "@app/hooks/api/certificates/constants";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import {
  CertificateDeletionStatus,
  TCertificateSource,
  TDeleteCertResponse
} from "@app/hooks/api/certificates/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import { Project } from "@app/hooks/api/projects/types";

import { getCertManagerLink } from "../../cert-manager-link";

export const getCertSourceLabel = (source: TCertificateSource): string => {
  switch (source) {
    case CertSource.Discovered:
      return "Discovered";
    case CertSource.Imported:
      return "Imported";
    case CertSource.Issued:
    default:
      return "Managed";
  }
};

export const DELETED_CERTIFICATE_NO_ACTIONS = "No actions are available for a deleted certificate.";

export const RENEWAL_UNAVAILABLE_NO_PROFILE =
  "Renewal is unavailable because the certificate profile this certificate was issued from no longer exists.";

type TRenewNowCertificate = {
  profileId?: string | null;
  isRenewedByClient?: boolean;
  enrollmentType?: string | null;
};

export const getRenewNowState = ({
  certificate,
  canRenew,
  permissionBlockedReason
}: {
  certificate: TRenewNowCertificate;
  canRenew: boolean;
  permissionBlockedReason?: string;
}): { isDisabled: boolean; reason?: string } => {
  if (!certificate.profileId) return { isDisabled: true, reason: RENEWAL_UNAVAILABLE_NO_PROFILE };
  if (certificate.isRenewedByClient && certificate.enrollmentType) {
    return {
      isDisabled: true,
      reason: `${getEnrollmentTypeName(certificate.enrollmentType)} certificates can't be renewed here. The client that requested the certificate renews it.`
    };
  }
  return { isDisabled: !canRenew, reason: permissionBlockedReason };
};

type TApplicationAbility = {
  can: (action: string, subjectType: string) => boolean;
};

// canDelete and canRevoke count asking for approval when a policy covers the certificate.
// hasDeletePermission is the Delete action alone, which reissuing needs to revoke the current
// certificate.
export type TApplicationCertificateAccess = {
  canRenew: boolean;
  canEdit: boolean;
  hasDeletePermission: boolean;
  canDelete: boolean;
  canRevoke: boolean;
  canManagePkiSyncs: boolean;
  renewBlockedReason?: string;
  editBlockedReason?: string;
  editMetadataBlockedReason?: string;
  revokeBlockedReason?: string;
  deleteBlockedReason?: string;
  managePkiSyncsBlockedReason?: string;
};

// The backend checks only the application role for a certificate that belongs to an application,
// and gives a project admin who is not a member read access alone, so project permissions must not
// unlock these actions. Without Delete, revoking or deleting only opens an approval request, which
// the backend refuses unless a revocation or deletion policy covers the certificate's profile.
export const getApplicationCertificateAccess = ({
  applicationName,
  permission,
  isRevocationApprovalRequired = false,
  isDeletionApprovalRequired = false
}: {
  applicationName: string;
  permission?: TApplicationAbility;
  isRevocationApprovalRequired?: boolean;
  isDeletionApprovalRequired?: boolean;
}): TApplicationCertificateAccess => {
  const can = (
    action: PkiApplicationResourceActions,
    subjectType: PkiApplicationResourceSub = PkiApplicationResourceSub.Certificates
  ) => Boolean(permission?.can(action, subjectType));
  const canEdit = can(PkiApplicationResourceActions.Edit);
  const hasDeletePermission = can(PkiApplicationResourceActions.Delete);
  const canRenew = can(PkiApplicationResourceActions.Create) && canEdit;
  const canDelete =
    hasDeletePermission ||
    (isDeletionApprovalRequired && can(PkiApplicationResourceActions.RequestDeletion));
  const canRevoke =
    hasDeletePermission ||
    (isRevocationApprovalRequired && can(PkiApplicationResourceActions.RequestRevocation));
  const canManagePkiSyncs = can(
    PkiApplicationResourceActions.Edit,
    PkiApplicationResourceSub.PkiSyncs
  );

  // Until the ability loads the actions stay disabled without blaming a role.
  if (!permission) {
    return { canRenew, canEdit, hasDeletePermission, canDelete, canRevoke, canManagePkiSyncs };
  }

  const operatorOrAdmin = `You need the Operator or Admin role on ${applicationName}`;
  const admin = `You need the Admin role on ${applicationName}`;

  return {
    canRenew,
    canEdit,
    hasDeletePermission,
    canDelete,
    canRevoke,
    canManagePkiSyncs,
    renewBlockedReason: canRenew ? undefined : `${operatorOrAdmin} to renew this certificate.`,
    editBlockedReason: canEdit
      ? undefined
      : `${operatorOrAdmin} to change auto-renewal for this certificate.`,
    editMetadataBlockedReason: canEdit
      ? undefined
      : `${operatorOrAdmin} to edit this certificate's metadata.`,
    revokeBlockedReason: canRevoke
      ? undefined
      : `${isRevocationApprovalRequired ? operatorOrAdmin : admin} to revoke this certificate.`,
    deleteBlockedReason: canDelete
      ? undefined
      : `${isDeletionApprovalRequired ? operatorOrAdmin : admin} to delete this certificate.`,
    managePkiSyncsBlockedReason: canManagePkiSyncs
      ? undefined
      : `${admin} to manage PKI syncs for this certificate.`
  };
};

type TCertificateActionTarget = {
  status?: string | null;
  deletedAt?: string | null;
  profileName?: string | null;
};

export const CERTIFICATE_ACTION_APPROVALS: Record<
  TCertificateActionPolicyType,
  {
    noun: string;
    pastParticiple: string;
    pendingLabel: string;
    pendingReason: string;
    replaceableReason: string;
    isDone: (certificate: TCertificateActionTarget) => boolean;
  }
> = {
  [ApprovalPolicyType.CertRevocation]: {
    noun: "revocation",
    pastParticiple: "revoked",
    pendingLabel: "Revocation Pending",
    pendingReason: "A revocation of this certificate is already waiting for approval.",
    replaceableReason:
      "Not enough of the approvers on this certificate's revocation request can still approve it. Once every step of the revocation policy has as many approvers who can approve as it requires, revoking the certificate again replaces the request.",
    isDone: (certificate) => certificate.status === CertStatus.REVOKED
  },
  [ApprovalPolicyType.CertDeletion]: {
    noun: "deletion",
    pastParticiple: "deleted",
    pendingLabel: "Deletion Pending",
    pendingReason: "A deletion of this certificate is already waiting for approval.",
    replaceableReason:
      "Not enough of the approvers on this certificate's deletion request can still approve it. Once every step of the deletion policy has as many approvers who can approve as it requires, deleting the certificate again replaces the request.",
    isDone: (certificate) => Boolean(certificate.deletedAt)
  }
};

// Without `from: "root-requests"` the sidebar opens the legacy Approvals submenu, which doesn't list
// revocation or deletion requests. The Approval Requests inbox links the same way.
export const getPendingRequestLink = (
  project: Pick<Project, "id" | "type" | "orgId">,
  policyType: TCertificateActionPolicyType,
  approvalRequestId: string
) =>
  getCertManagerLink(project, `approvals/${approvalRequestId}`, {
    policyType,
    from: "root-requests"
  });

// With no policy covering the certificate, the action skips approval, so a pending request is no
// reason to block it. Once the action is done its request can't do anything (a DigiCert sync can
// revoke a certificate while its request is pending), so it is not shown at all. A request its
// approvers can no longer approve is replaced when the action is taken again.
export const getCertificateActionApproval = ({
  policyType,
  certificate,
  pendingRequest,
  policyProfileNames
}: {
  policyType: TCertificateActionPolicyType;
  certificate: TCertificateActionTarget;
  pendingRequest?: Pick<TApprovalRequest, "approversCanNoLongerApprove">;
  policyProfileNames?: Set<string>;
}) => {
  const action = CERTIFICATE_ACTION_APPROVALS[policyType];
  const isApprovalRequired = Boolean(
    certificate.profileName && policyProfileNames?.has(certificate.profileName)
  );
  const isPending = Boolean(pendingRequest) && !action.isDone(certificate);
  const blocksAction = isPending && isApprovalRequired;
  const isReplaceable = blocksAction && Boolean(pendingRequest?.approversCanNoLongerApprove);

  return {
    isApprovalRequired,
    isPending,
    // Coverage is unknown while the policy list loads or when it can't be read, and the server may still hold the
    // action then, so the note stays until the list shows no policy covers the certificate.
    showsPendingNote: isPending && (isApprovalRequired || policyProfileNames === undefined),
    pendingLabel: action.pendingLabel,
    blockedReason: blocksAction && !isReplaceable ? action.pendingReason : undefined,
    replacesRequestReason: isReplaceable ? action.replaceableReason : undefined
  };
};

export type TCertificateActionApproval = ReturnType<typeof getCertificateActionApproval>;

export const getCertificateActionMenuState = ({
  canAct,
  approval,
  accessBlockedReason
}: {
  canAct: boolean;
  approval: TCertificateActionApproval;
  accessBlockedReason?: string;
}) => {
  const blockedReason = approval.blockedReason ?? accessBlockedReason;
  return {
    isDisabled: !canAct || Boolean(approval.blockedReason),
    isDisabledFocusable: Boolean(blockedReason),
    reason: blockedReason ?? approval.replacesRequestReason
  };
};

export const getCertificateDeletionToast = ({ status }: TDeleteCertResponse) =>
  status === CertificateDeletionStatus.PendingApproval
    ? "Deletion requested. The certificate isn't deleted until the request is approved."
    : "Successfully deleted certificate";

type TCertificateRenewalPreview = {
  profileId?: string | null;
  source?: string | null;
};

export const isManagedCertificate = (certificate: TCertificateRenewalPreview) =>
  (certificate.source ?? CertSource.Issued) === CertSource.Issued;

type TCertificateStatusSource = {
  status?: string | null;
  notAfter: string;
  renewedByCertificateId?: string | null;
  deletedAt?: string | null;
};

export const getCertificateDisplayStatus = (certificate: TCertificateStatusSource) => {
  if (certificate.deletedAt) {
    return { status: CertStatus.DELETED, label: "Deleted", variant: "neutral" as const };
  }

  if (certificate.status === CertStatus.REVOKED) {
    return { status: CertStatus.REVOKED, label: "Revoked", variant: "danger" as const };
  }

  if (new Date(certificate.notAfter) < new Date()) {
    return { status: CertStatus.EXPIRED, label: "Expired", variant: "danger" as const };
  }

  if (certificate.renewedByCertificateId) {
    return { status: CertStatus.RENEWED, label: "Renewed", variant: "neutral" as const };
  }

  return { status: CertStatus.ACTIVE, label: "Active", variant: "success" as const };
};

type TCertificateDeletedBySource = {
  deletedByActorType?: ActorType | null;
  deletedByActorName?: string | null;
};

export const getCertificateDeletedBySummary = (certificate: TCertificateDeletedBySource) => {
  if (certificate.deletedByActorName) return certificate.deletedByActorName;

  if (certificate.deletedByActorType === ActorType.PLATFORM) return "Certificate cleanup";

  return certificate.deletedByActorType === ActorType.IDENTITY ? "A machine identity" : "A user";
};

export const canRevokeAfterDeletion = (
  certificate: { source?: string | null; profileId?: string | null },
  caType?: string | null
) =>
  !(
    certificate.source === CertSource.Imported &&
    Boolean(certificate.profileId) &&
    caType === CaType.INTERNAL
  );

type TCertificateDeletionSource = {
  status?: string | null;
  notAfter: string;
  hasPrivateKey?: boolean;
};

export type TCertificateHoldingSync = {
  isAutoSyncEnabled: boolean;
  syncOptions?: { canRemoveCertificates?: boolean } | null;
};

export const isRemovedFromSyncDestination = (sync: TCertificateHoldingSync) =>
  sync.isAutoSyncEnabled && Boolean(sync.syncOptions?.canRemoveCertificates);

const getCertificateTrustWarning = (
  certificate: TCertificateDeletionSource | undefined,
  canRevoke: boolean,
  isRevocableAfterDeletion: boolean
) => {
  if (
    !certificate ||
    certificate.status === CertStatus.REVOKED ||
    new Date(certificate.notAfter) <= new Date()
  ) {
    return "";
  }

  const expiresOn = format(new Date(certificate.notAfter), "yyyy-MM-dd");
  if (!canRevoke) return ` It stays valid until ${expiresOn}.`;
  if (isRevocableAfterDeletion) return ` It stays trusted until ${expiresOn} unless you revoke it.`;
  return " It can't be revoked once deleted, so revoke it first if clients should stop trusting it.";
};

export const getCertificateDeletionTitle = (certificate: {
  commonName: string;
  altNames?: string | null;
  friendlyName?: string | null;
  serialNumber: string;
}) =>
  `Delete Certificate ${getCertificateLabel(certificate, certificate.serialNumber.toUpperCase())}?`;

export const getCertificateDeletionWarning = (
  certificate?: TCertificateDeletionSource,
  canRevoke = false,
  isRevocableAfterDeletion = true,
  isApprovalRequired = false
) => {
  const removed =
    certificate?.hasPrivateKey === false
      ? "this removes the certificate"
      : "this removes the certificate and its private key";
  const trustWarning = getCertificateTrustWarning(certificate, canRevoke, isRevocableAfterDeletion);

  if (isApprovalRequired) {
    return `Confirming creates an approval request. Once it's approved, ${removed}, which can't be undone.${trustWarning}`;
  }
  return `${removed.charAt(0).toUpperCase()}${removed.slice(1)}.${trustWarning} This cannot be undone.`;
};

// Without the private key, Infisical renews on the existing key pair only from a CSR it holds for it, and
// only when the backend says that CSR can be renewed from (API-enrolled, and a CA that issues from a CSR).
export const canRenewOnExistingKeyPair = (certificate: {
  hasPrivateKey?: boolean;
  canRenewFromCsr?: boolean;
}): boolean => certificate.hasPrivateKey !== false || Boolean(certificate.canRenewFromCsr);

export const isExpiringWithinOneDay = (notAfter: string): boolean => {
  const expiryDate = new Date(notAfter);
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return expiryDate <= oneDayFromNow;
};

export const getCertValidUntilBadgeDetails = (notAfter: string) => {
  const currentDate = new Date().getTime();
  const notAfterDate = new Date(notAfter).getTime();
  const diffInMs = notAfterDate - currentDate;

  let variant: "success" | "warning" | "danger" = "success";
  let label = "Healthy";

  if (diffInMs > ms("60d")) {
    variant = "success";
  } else if (diffInMs > ms("30d")) {
    variant = "warning";
  } else {
    variant = "danger";
  }

  if (diffInMs > ms("60d")) {
    label = "Healthy";
  } else if (diffInMs > ms("0d")) {
    label = `Expires in ${ms(diffInMs)}`;
  } else {
    label = "Expired";
  }

  return { variant, label };
};
