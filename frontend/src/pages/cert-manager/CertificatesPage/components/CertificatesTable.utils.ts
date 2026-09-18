import ms from "ms";

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

export const RENEWAL_UNAVAILABLE_NO_PROFILE =
  "Renewal is unavailable because the certificate profile this certificate was issued from no longer exists.";

type TCertificateRenewalSource = {
  profileId?: string | null;
  source?: string | null;
};

export const isManagedCertificate = (certificate: TCertificateRenewalSource) =>
  (certificate.source ?? CertSource.Issued) === CertSource.Issued;

type TCertificateStatusSource = {
  status?: string | null;
  notAfter: string;
  renewedByCertificateId?: string | null;
};

export const getCertificateDisplayStatus = (certificate: TCertificateStatusSource) => {
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
