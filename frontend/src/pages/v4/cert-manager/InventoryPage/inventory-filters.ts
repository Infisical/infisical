import type { FilterBarField, FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";

import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { EnrollmentType } from "@app/hooks/api/certificateProfiles/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";

import type { TListCertificatesDTO } from "../../data/certificates/contract";

const options = (entries: Record<string, string>) =>
  Object.entries(entries).map(([value, label]) => ({ value, label }));

export const enrollmentLabel: Record<EnrollmentType, string> = {
  [EnrollmentType.API]: "API",
  [EnrollmentType.EST]: "EST",
  [EnrollmentType.ACME]: "ACME",
  [EnrollmentType.SCEP]: "SCEP",
  [EnrollmentType.MICROSOFT_AUTOENROLLMENT]: "Microsoft Autoenrollment"
};

type InventoryMetadata = NonNullable<TListCertificatesDTO["metadataFilter"]>;

const metadataToText = (metadata: InventoryMetadata) =>
  metadata.map(({ key, value }) => (value ? `${key}=${value}` : key)).join(", ");

const textToMetadata = (text: string): InventoryMetadata =>
  text
    .split(",")
    .map((pair) => {
      const [key, ...rest] = pair.split("=");
      const value = rest.join("=").trim();
      return { key: key.trim(), ...(value ? { value } : {}) };
    })
    .filter(({ key }) => key);

const pairsOf = (metadata: InventoryMetadata) =>
  JSON.stringify(metadata.map(({ key, value }) => [key, value ?? null]));

const parseMetadataPairs = (text: string): InventoryMetadata | undefined => {
  if (!text.startsWith("[")) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return undefined;
    const pairs = parsed.filter(
      (entry): entry is InventoryMetadata[number] =>
        typeof entry?.key === "string" &&
        (entry.value === undefined || typeof entry.value === "string")
    );
    return pairs.length === parsed.length && pairs.length ? pairs : undefined;
  } catch {
    return undefined;
  }
};

// Metadata the "key=value, ..." text can't express (commas, "=" in keys, empty values) stays
// as JSON in the filter so a saved view keeps returning the same certificates.
export const metadataToFilterValue = (metadata: InventoryMetadata) => {
  const text = metadataToText(metadata);
  return pairsOf(textToMetadata(text)) === pairsOf(metadata) ? text : JSON.stringify(metadata);
};

export const filterValueToMetadata = (value: string): InventoryMetadata =>
  parseMetadataPairs(value) ?? textToMetadata(value);

export const inventoryFields = (
  authorities: TUnifiedCertificateAuthority[],
  profiles: { value: string; label: string }[],
  applications?: Pick<FilterBarField & { type: "multi-select" }, "options" | "onSearch" | "loading">
): FilterBarField[] => [
  {
    key: "status",
    label: "Status",
    type: "multi-select",
    options: [
      { value: CertStatus.ACTIVE, label: "Active" },
      { value: CertStatus.RENEWED, label: "Renewed" },
      { value: CertStatus.EXPIRED, label: "Expired" },
      { value: CertStatus.REVOKED, label: "Revoked" },
      { value: CertStatus.DELETED, label: "Deleted" }
    ]
  },
  { key: "notAfter", label: "Expiration date", type: "date" },
  { key: "notBefore", label: "Issued date", type: "date" },
  {
    key: "enrollmentType",
    label: "Enrollment method",
    type: "multi-select",
    options: options(enrollmentLabel)
  },
  {
    key: "keyAlgorithm",
    label: "Algorithm",
    type: "multi-select",
    options: options(certKeyAlgorithmToNameMap)
  },
  {
    key: "keySize",
    label: "Key size",
    type: "multi-select",
    options: [
      { value: "256", label: "256-bit (ECDSA)" },
      { value: "384", label: "384-bit (ECDSA)" },
      { value: "521", label: "521-bit (ECDSA)" },
      { value: "2048", label: "2048-bit (RSA)" },
      { value: "3072", label: "3072-bit (RSA)" },
      { value: "4096", label: "4096-bit (RSA)" }
    ]
  },
  {
    key: "source",
    label: "Source",
    type: "multi-select",
    options: [
      { value: CertSource.Issued, label: "Managed" },
      { value: CertSource.Discovered, label: "Discovered" },
      { value: CertSource.Imported, label: "Imported" }
    ]
  },
  {
    key: "caId",
    label: "Certificate authority",
    type: "multi-select",
    options: authorities.map((ca) => ({ value: ca.id, label: ca.name || ca.id }))
  },
  { key: "profileId", label: "Profile", type: "multi-select", options: profiles },
  ...(applications
    ? [
        {
          key: "applicationId",
          label: "Application",
          type: "multi-select",
          ...applications
        } satisfies FilterBarField
      ]
    : []),
  { key: "metadata", label: "Metadata", type: "text", placeholder: "key or key=value", verb: "is" }
];

export const filterParams = (filters: FilterBarFilter[]): Partial<TListCertificatesDTO> => {
  const params: Partial<TListCertificatesDTO> = {};
  filters.forEach(({ field, operator, values }) => {
    if (!values.length) return;
    if (field === "notAfter" || field === "notBefore") {
      const date = new Date(values[0]);
      const bound = operator === "after" ? "From" : "To";
      params[`${field}${bound}`] = date;
      return;
    }
    if (field === "status") params.status = values.join(",");
    if (field === "enrollmentType") params.enrollmentTypes = values;
    if (field === "keyAlgorithm") params.keyAlgorithm = values;
    if (field === "keySize") params.keySizes = values.map(Number);
    if (field === "source") params.source = values;
    if (field === "caId") params.caIds = values;
    if (field === "profileId") params.profileIds = values;
    if (field === "applicationId") params.applicationIds = values;
    if (field === "metadata") params.metadataFilter = filterValueToMetadata(values[0]);
  });
  return params;
};
