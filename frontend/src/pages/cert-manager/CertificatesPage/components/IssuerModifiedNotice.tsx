import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
    <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
      <div className="flex items-start gap-2">
        <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 text-yellow-500" />
        <div className="space-y-1 text-sm">
          <p className="text-mineshaft-100">
            The certificate authority set these values at last issuance.
          </p>
          {fields.map((field) => (
            <p key={field.field} className="text-mineshaft-300">
              {describeIssuerChange(field)}
            </p>
          ))}
          <p className="text-mineshaft-400">
            Edit a field above to request a different value, or renew unchanged to let the authority
            set it again.
          </p>
        </div>
      </div>
    </div>
  );
};

const describeIssuerHint = (requested: string, issued: string) => {
  if (!issued) return `The certificate authority omitted ${requested} at last issuance.`;
  return `The certificate authority set ${issued} at last issuance.`;
};

type HintProps = {
  field?: TIssuerModifiedField;
};

export const IssuerModifiedHint = ({ field }: HintProps) => {
  if (!field) return null;

  const requested = formatIssuerValue(field, field.requested);
  const issued = formatIssuerValue(field, field.issued);

  return (
    <p className="mt-1 text-xs text-yellow-600">
      <FontAwesomeIcon icon={faCircleInfo} className="mr-1" />
      {describeIssuerHint(requested, issued)}
    </p>
  );
};
