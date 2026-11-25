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
  [EnrollmentType.SCEP]: "SCEP"
};

export const inventoryFields = (
  authorities: TUnifiedCertificateAuthority[],
  profiles: { value: string; label: string }[]
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
  { key: "profileId", label: "Profile", type: "multi-select", options: profiles }
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
  });
  return params;
};
