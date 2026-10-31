import * as x509 from "@peculiar/x509";
import axios from "axios";
import { differenceInCalendarDays } from "date-fns";
import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";

import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { TCaCrossSignedCertificate } from "@app/hooks/api/ca/types";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

export type TCrossSignedCertPopUp =
  | "generateCrossSignCsr"
  | "importCrossSignedCert"
  | "removeCrossSignedCert";

export const INACTIVE_CA_TEXT = "Enable this CA first";

export const GENERATE_CSR_DENIED_TEXT = "You don't have permission to generate a CSR for this CA";

const EXPIRY_WARNING_DAYS = 30;

const PEM_CERTIFICATE_REGEX = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

export const formatCertificateDate = (timestamp: Date | string) =>
  formatDateTime({ timestamp, timezone: Timezone.UTC, dateFormat: "yyyy-MM-dd" });

export const countPemCertificates = (pem: string) =>
  (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;

export const getServerErrorMessage = (
  error: unknown,
  fallback: string,
  isBadRequestOnly = false
) => {
  const serverResponse = axios.isAxiosError(error)
    ? (error.response?.data as TApiErrors | undefined)
    : undefined;
  if (isBadRequestOnly && serverResponse?.error !== ApiErrorTypes.BadRequestError) return null;
  return typeof serverResponse?.message === "string" && serverResponse.message
    ? serverResponse.message
    : fallback;
};

const getNameLabel = (name: x509.Name, fallback: string) => name.getField("CN")[0] ?? fallback;

export const summarizeCrossSignedCert = (crossSignedCert: TCaCrossSignedCertificate) => {
  const cert = new x509.X509Certificate(crossSignedCert.certificate);
  const chainCerts = crossSignedCert.certificateChain?.match(PEM_CERTIFICATE_REGEX) ?? [];
  const topChainPem = chainCerts[chainCerts.length - 1];
  const topChainCert = topChainPem ? new x509.X509Certificate(topChainPem) : null;

  const notBefore = new Date(crossSignedCert.notBefore);
  const notAfter = new Date(crossSignedCert.notAfter);
  const now = new Date();
  const daysLeft = differenceInCalendarDays(notAfter, now);

  const issuerName = getNameLabel(cert.issuerName, crossSignedCert.issuer);
  const chainTopName = topChainCert
    ? getNameLabel(topChainCert.subjectName, topChainCert.subject)
    : null;

  return {
    issuerName,
    chainRootName: topChainCert && topChainCert.subject !== cert.issuer ? chainTopName : null,
    trustedRootName: chainTopName ?? issuerName,
    notBefore,
    notAfter,
    daysLeft,
    isExpired: notAfter <= now,
    isNotYetValid: notBefore > now,
    isExpiringSoon: daysLeft <= EXPIRY_WARNING_DAYS
  };
};

export type TCrossSignedCertSummary = ReturnType<typeof summarizeCrossSignedCert>;

const formatExpiresIn = (daysLeft: number) => {
  if (daysLeft <= 0) return "Expires today";
  if (daysLeft === 1) return "Expires in 1 day";
  return `Expires in ${daysLeft} days`;
};

export const getCrossSignedCertStatus = (summary: TCrossSignedCertSummary) => {
  const { trustedRootName } = summary;

  if (summary.isExpired) {
    return {
      variant: "danger" as const,
      Icon: CircleXIcon,
      label: "Expired",
      alert: {
        title: `Expired on ${formatCertificateDate(summary.notAfter)}`,
        body: `New certificates from this CA and the CAs under it no longer carry it, so clients that only trust ${trustedRootName} won't trust them. Import a new cross-signed certificate.`
      }
    };
  }

  if (summary.isNotYetValid) {
    const notBefore = formatCertificateDate(summary.notBefore);
    return {
      variant: "warning" as const,
      Icon: TriangleAlertIcon,
      label: `Not valid until ${notBefore}`,
      alert: {
        title: "Not valid yet",
        body: `New certificates from this CA and the CAs under it carry it from ${notBefore}. Until then, clients that only trust ${trustedRootName} won't trust them.`
      }
    };
  }

  if (summary.isExpiringSoon) {
    return {
      variant: "warning" as const,
      Icon: TriangleAlertIcon,
      label: formatExpiresIn(summary.daysLeft),
      alert: {
        title: "Replace before it expires",
        body: `Replace it before then, or new certificates from this CA and the CAs under it won't be trusted by clients that only trust ${trustedRootName}.`
      }
    };
  }

  return { variant: "success" as const, Icon: CircleCheckIcon, label: "Active", alert: null };
};
