import { ReactNode } from "react";

import { Tooltip } from "@app/components/v2";

interface CertificateNameData {
  altNames?: string | null;
  commonName?: string | null;
  certificateAltNames?: string | null;
  certificateCommonName?: string | null;
}

interface DisplayNameResult {
  originalDisplayName: string;
  displayName: string;
  isTruncated: boolean;
}

/**
 * Extracts and formats the display name for a certificate from SAN/CN data
 * @param cert - Certificate object with potential altNames/commonName fields
 * @param maxLength - Maximum length before truncating (default: 64)
 * @param fallback - Fallback text when no name is found (default: "—")
 * @returns Object with original name, truncated name, and truncation flag
 */
export const getCertificateDisplayName = (
  cert: CertificateNameData,
  maxLength: number = 64,
  fallback: string = "—"
): DisplayNameResult => {
  // Extract original display name - prioritize SAN over CN
  let originalDisplayName = fallback;

  // Handle different property name variations
  const altNames = cert.altNames || cert.certificateAltNames;
  const commonName = cert.commonName || cert.certificateCommonName;

  if (altNames && altNames.trim()) {
    originalDisplayName = altNames.trim();
  } else if (commonName && commonName.trim()) {
    originalDisplayName = commonName.trim();
  }

  // Handle truncation
  let displayName = originalDisplayName;
  let isTruncated = false;

  if (originalDisplayName.length > maxLength) {
    displayName = `${originalDisplayName.substring(0, maxLength)}...`;
    isTruncated = true;
  }

  return {
    originalDisplayName,
    displayName,
    isTruncated
  };
};

/**
 * Renders a certificate display name with optional tooltip for truncated names
 * @param cert - Certificate object with potential altNames/commonName fields
 * @param maxLength - Maximum length before truncating (default: 64)
 * @param fallback - Fallback text when no name is found (default: "—")
 * @param className - Optional CSS class for the display element
 * @param tooltipClassName - Optional CSS class for the tooltip (default: "max-w-lg")
 * @returns JSX element with certificate name and optional tooltip
 */
export const CertificateDisplayName = ({
  cert,
  maxLength = 64,
  fallback = "—",
  className = "truncate",
  tooltipClassName = "max-w-lg"
}: {
  cert: CertificateNameData;
  maxLength?: number;
  fallback?: string;
  className?: string;
  tooltipClassName?: string;
}): ReactNode => {
  const { originalDisplayName, displayName, isTruncated } = getCertificateDisplayName(
    cert,
    maxLength,
    fallback
  );

  if (isTruncated) {
    return (
      <Tooltip content={originalDisplayName} className={tooltipClassName}>
        <div className={className}>{displayName}</div>
      </Tooltip>
    );
  }

  return (
    <div className={className} title={originalDisplayName}>
      {displayName}
    </div>
  );
};
