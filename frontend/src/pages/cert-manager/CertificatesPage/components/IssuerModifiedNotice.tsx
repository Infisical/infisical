import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { TIssuerModifiedField } from "@app/hooks/api/certificates/types";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type Props = {
  fields: TIssuerModifiedField[];
};

export const ISSUER_MODIFIED_LABELS: Record<string, string> = {
  commonName: "Common name",
  organization: "Organization",
  organizationalUnit: "Organizational unit",
  country: "Country",
  state: "State",
  locality: "Locality",
  domainComponents: "Domain components",
  altNames: "Subject alternative names",
  keyUsages: "Key usages",
  extendedKeyUsages: "Extended key usages",
  keyAlgorithm: "Key algorithm",
  signatureAlgorithm: "Signature algorithm"
};

const FORMATTERS: Record<string, (value: string) => string> = {
  keyUsages: (value) => formatKeyUsage(value as CertKeyUsageType),
  extendedKeyUsages: (value) => formatExtendedKeyUsage(value as CertExtendedKeyUsageType)
};

export const formatIssuerValue = (field: TIssuerModifiedField, value: string) => {
  const format = FORMATTERS[field.field];
  if (!format) return value;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(format)
    .join(", ");
};

export const describeIssuerChange = (field: TIssuerModifiedField) => {
  const label = ISSUER_MODIFIED_LABELS[field.field] ?? field.field;
  const issued = formatIssuerValue(field, field.issued);
  if (!issued) return `${label}: omitted`;
  return `${label}: ${issued}`;
};

export const IssuerModifiedNotice = ({ fields }: Props) => {
  if (fields.length === 0) return null;

  return (
    <Alert variant="warning">
      <InfoIcon />
      <AlertTitle>Additional values set by the certificate authority</AlertTitle>
      <AlertDescription>
        {fields.map((field) => (
          <p key={field.field}>{describeIssuerChange(field)}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
};
