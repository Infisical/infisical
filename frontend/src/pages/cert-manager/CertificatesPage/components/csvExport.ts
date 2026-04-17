import { TCertificate, TCertificateSource } from "@app/hooks/api/certificates/types";

import { getCertSourceLabel } from "./CertificatesTable.utils";

const CSV_COLUMNS = [
  { key: "commonName", header: "Common Name" },
  { key: "altNames", header: "SANs" },
  { key: "serialNumber", header: "Serial Number" },
  { key: "status", header: "Status" },
  { key: "enrollmentType", header: "Enrollment Method" },
  { key: "keyAlgorithm", header: "Algorithm" },
  { key: "notBefore", header: "Issued" },
  { key: "notAfter", header: "Expires" },
  { key: "caName", header: "CA" },
  { key: "profileName", header: "Profile" },
  { key: "source", header: "Source" }
] as const;

const escapeCSV = (value: string | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const needsQuoting =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r") ||
    str.startsWith("=") ||
    str.startsWith("+") ||
    str.startsWith("-") ||
    str.startsWith("@");
  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const certificatesToCSV = (certificates: TCertificate[]): string => {
  const header = CSV_COLUMNS.map((col) => col.header).join(",");
  const rows = certificates.map((cert) =>
    CSV_COLUMNS.map((col) => {
      if (col.key === "source") {
        return escapeCSV(getCertSourceLabel((cert.source ?? null) as TCertificateSource));
      }
      const value = cert[col.key as keyof TCertificate];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return escapeCSV(JSON.stringify(value));
      return escapeCSV(String(value));
    }).join(",")
  );
  return [header, ...rows].join("\n");
};

export const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
