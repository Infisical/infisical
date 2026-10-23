import { format } from "date-fns";
import ms from "ms";

import { userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { CaType } from "@app/hooks/api/ca/enums";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import { TCertificateSource } from "@app/hooks/api/certificates/types";

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
  deletedVia?: UserAgentType | null;
};

export const getCertificateDeletedBySummary = (certificate: TCertificateDeletedBySource) => {
  const fallbackActor =
    certificate.deletedByActorType === ActorType.IDENTITY ? "A machine identity" : "A user";
  const client = certificate.deletedVia;
  let channel = "API";
  if (client === UserAgentType.WEB) channel = "UI";
  else if (client && client !== UserAgentType.OTHER && userAgentTypeToNameMap[client]) {
    channel = userAgentTypeToNameMap[client];
  }

  return `${certificate.deletedByActorName || fallbackActor} via ${channel}`;
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

const getCertificateSyncRemovalWarning = (holdingSyncs: unknown[]) => {
  if (holdingSyncs.length === 0) return "";

  return holdingSyncs.length === 1
    ? " It's also removed from 1 certificate sync."
    : ` It's also removed from ${holdingSyncs.length} certificate syncs.`;
};

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
  isRevocableAfterDeletion = true,
  holdingSyncs: unknown[] = []
) => {
  const removed =
    certificate?.hasPrivateKey === false
      ? "This removes the certificate."
      : "This removes the certificate and its private key.";

  return `${removed}${getCertificateTrustWarning(certificate, canRevoke, isRevocableAfterDeletion)}${getCertificateSyncRemovalWarning(holdingSyncs)}`;
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
