import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { TIssuerModifiedField } from "@app/hooks/api/certificates/types";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  customExtensionLabelFor,
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
  signatureAlgorithm: "Signature algorithm",
  customExtensions: "Custom extensions"
};

const FORMATTERS: Record<string, (value: string) => string> = {
  keyUsages: (value) => formatKeyUsage(value as CertKeyUsageType),
  extendedKeyUsages: (value) => formatExtendedKeyUsage(value as CertExtendedKeyUsageType),
  customExtensions: (oid) => customExtensionLabelFor(oid)
};

const LIST_FIELDS = new Set(["altNames", "keyUsages", "extendedKeyUsages", "customExtensions"]);

const splitValues = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const formatValues = (field: TIssuerModifiedField, values: string[]) => {
  const format = FORMATTERS[field.field] ?? ((value: string) => value);
  return values.map(format).join(", ");
};

const describeListChange = (field: TIssuerModifiedField) => {
  const requested = splitValues(field.requested);
  const issued = splitValues(field.issued);
  const added = issued.filter((value) => !requested.includes(value));
  const removed = requested.filter((value) => !issued.includes(value));

  if (!removed.length && added.length) return formatValues(field, added);

  const parts = [
    added.length ? `added ${formatValues(field, added)}` : "",
    removed.length ? `removed ${formatValues(field, removed)}` : ""
  ].filter(Boolean);

  // A value rewritten under the same identifier shows up in neither list.
  return parts.length ? parts.join("; ") : `changed ${formatValues(field, issued)}`;
};

const describeValueChange = (field: TIssuerModifiedField) => {
  if (!field.issued) return `removed ${field.requested}`;
  if (!field.requested) return field.issued;
  return `changed to ${field.issued}`;
};

export const describeIssuerChange = (field: TIssuerModifiedField) => {
  const label = ISSUER_MODIFIED_LABELS[field.field] ?? field.field;
  const change = LIST_FIELDS.has(field.field)
    ? describeListChange(field)
    : describeValueChange(field);
  return `${label}: ${change}`;
};

export const IssuerModifiedNotice = ({ fields }: Props) => {
  if (fields.length === 0) return null;

  return (
    <Alert variant="warning">
      <InfoIcon />
      <AlertTitle>Additional values set by the CA on the current certificate</AlertTitle>
      <AlertDescription>
        {fields.map((field) => (
          <p key={field.field}>{describeIssuerChange(field)}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
};
