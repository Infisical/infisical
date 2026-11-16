import type { TCertificate } from "@app/hooks/api/certificates/types";
import {
  getCertificateDisplayStatus,
  getCertSourceLabel
} from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

const columns: [string, (cert: TCertificate) => string | null | undefined][] = [
  ["Common Name", (cert) => cert.commonName],
  ["SANs", (cert) => cert.altNames],
  ["Serial Number", (cert) => cert.serialNumber],
  ["Status", (cert) => getCertificateDisplayStatus(cert).label],
  ["Enrollment Method", (cert) => cert.enrollmentType],
  ["Algorithm", (cert) => cert.keyAlgorithm],
  ["Issued", (cert) => cert.notBefore],
  ["Expires", (cert) => cert.notAfter],
  ["CA", (cert) => cert.caName],
  ["Profile", (cert) => cert.profileName],
  ["Source", (cert) => getCertSourceLabel(cert.source ?? null)]
];

const escape = (raw: string | null | undefined) => {
  if (raw === null || raw === undefined) return "";
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n']/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

export const certificatesToCsv = (certificates: TCertificate[]) =>
  [
    columns.map(([header]) => header).join(","),
    ...certificates.map((cert) => columns.map(([, read]) => escape(read(cert))).join(","))
  ].join("\n");
