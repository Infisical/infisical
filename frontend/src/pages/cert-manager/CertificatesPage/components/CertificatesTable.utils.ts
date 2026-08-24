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

const CERT_STATUS_PRESENTATION: Record<
  CertStatus,
  { label: string; variant: "success" | "danger" | "neutral" }
> = {
  [CertStatus.ACTIVE]: { label: "Active", variant: "success" },
  [CertStatus.RENEWED]: { label: "Renewed", variant: "neutral" },
  [CertStatus.EXPIRED]: { label: "Expired", variant: "danger" },
  [CertStatus.REVOKED]: { label: "Revoked", variant: "danger" }
};

type TCertificateStatusSource = {
  lifecycleStatus?: CertStatus;
  status?: string | null;
  notAfter: string;
  renewedByCertificateId?: string | null;
};

const resolveLifecycleStatus = (certificate: TCertificateStatusSource): CertStatus => {
  if (certificate.lifecycleStatus) return certificate.lifecycleStatus;
  if (certificate.status === CertStatus.REVOKED) return CertStatus.REVOKED;
  if (new Date(certificate.notAfter) < new Date()) return CertStatus.EXPIRED;
  if (certificate.renewedByCertificateId) return CertStatus.RENEWED;
  return CertStatus.ACTIVE;
};

export const getCertificateDisplayStatus = (certificate: TCertificateStatusSource) => {
  const status = resolveLifecycleStatus(certificate);
  return { status, ...CERT_STATUS_PRESENTATION[status] };
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
