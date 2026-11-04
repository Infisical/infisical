import { format } from "date-fns";
import ms from "ms";

import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { CaType } from "@app/hooks/api/ca/enums";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import { TCertificateSource } from "@app/hooks/api/certificates/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";

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

type TApplicationAbility = {
  can: (action: string, subjectType: string) => boolean;
};

export type TApplicationCertificateAccess = {
  canRenew: boolean;
  canEdit: boolean;
  canDelete: boolean;
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
// unlock these actions.
export const getApplicationCertificateAccess = ({
  applicationName,
  permission
}: {
  applicationName: string;
  permission?: TApplicationAbility;
}): TApplicationCertificateAccess => {
  const can = (
    action: PkiApplicationResourceActions,
    subjectType: PkiApplicationResourceSub = PkiApplicationResourceSub.Certificates
  ) => Boolean(permission?.can(action, subjectType));
  const canEdit = can(PkiApplicationResourceActions.Edit);
  const canDelete = can(PkiApplicationResourceActions.Delete);
  const canRenew = can(PkiApplicationResourceActions.Create) && canEdit;
  const canManagePkiSyncs = can(
    PkiApplicationResourceActions.Edit,
    PkiApplicationResourceSub.PkiSyncs
  );

  // Until the ability loads the actions stay disabled without blaming a role.
  if (!permission) return { canRenew, canEdit, canDelete, canManagePkiSyncs };

  const operatorOrAdmin = `You need the Operator or Admin role on ${applicationName}`;
  const admin = `You need the Admin role on ${applicationName}`;

  return {
    canRenew,
    canEdit,
    canDelete,
    canManagePkiSyncs,
    renewBlockedReason: canRenew ? undefined : `${operatorOrAdmin} to renew this certificate.`,
    editBlockedReason: canEdit
      ? undefined
      : `${operatorOrAdmin} to change auto-renewal for this certificate.`,
    editMetadataBlockedReason: canEdit
      ? undefined
      : `${operatorOrAdmin} to edit this certificate's metadata.`,
    revokeBlockedReason: canDelete ? undefined : `${admin} to revoke this certificate.`,
    deleteBlockedReason: canDelete ? undefined : `${admin} to delete this certificate.`,
    managePkiSyncsBlockedReason: canManagePkiSyncs
      ? undefined
      : `${admin} to manage PKI syncs for this certificate.`
  };
};

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

export const getCertificateDeletionWarning = (
  certificate?: TCertificateDeletionSource,
  canRevoke = false,
  isRevocableAfterDeletion = true
) => {
  const removed =
    certificate?.hasPrivateKey === false
      ? "This removes the certificate."
      : "This removes the certificate and its private key.";

  return `${removed}${getCertificateTrustWarning(certificate, canRevoke, isRevocableAfterDeletion)} This cannot be undone.`;
};

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
