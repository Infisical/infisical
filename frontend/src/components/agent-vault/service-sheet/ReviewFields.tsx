import { useFormContext } from "react-hook-form";

import {
  CodeBlock,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import {
  AgentVaultCredentialType,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  CREDENTIAL_LABELS,
  isAllMethods,
  oauthStatusLabel,
  SURFACE_LABELS,
  TRANSPORT_LABELS,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

const MASK = "\u2022".repeat(8);

const credentialPreview = (form: {
  credentialType: AgentVaultCredentialType;
  headerName?: string;
  headerPrefix?: string;
  memberProvidedFields: TAgentVaultMemberProvidedField[];
}): string | null => {
  if (form.credentialType === AgentVaultCredentialType.Passthrough) return null;
  if (form.credentialType === AgentVaultCredentialType.Basic) return `Authorization: Basic ${MASK}`;
  if (form.credentialType === AgentVaultCredentialType.OAuth)
    return `Authorization: Bearer ${MASK}`;
  const prefix = form.headerPrefix ? `${form.headerPrefix} ` : "";
  const value = form.memberProvidedFields.includes(AgentVaultVariableReferenceField.CredentialValue)
    ? "<member value>"
    : MASK;
  return `${form.headerName || "Authorization"}: ${prefix}${value}`;
};

const alignColumns = (rows: string[][]) => {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) =>
      row
        .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column])))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
};

type Props = {
  isUpdate: boolean;
  service?: TAgentVaultService | null;
  storedType?: AgentVaultCredentialType;
  /** The fields that were member-provided when the sheet opened, which have no stored value behind them. */
  storedMemberFields?: TAgentVaultMemberProvidedField[];
};

export const ReviewFields = ({ isUpdate, service, storedType, storedMemberFields = [] }: Props) => {
  const { watch } = useFormContext<TServiceForm>();
  const form = watch();

  const isMcp = form.serviceType === AgentVaultServiceType.Mcp;
  const isBasic = form.credentialType === AgentVaultCredentialType.Basic;
  const isOAuth = form.credentialType === AgentVaultCredentialType.OAuth;
  const secretLabel = isBasic ? "Password" : "Token";
  const sends = credentialPreview(form);

  const headerRows = form.customHeaders
    .filter((header) => header.name)
    .map((header) => [`${header.name}:`, header.prefix ? `${header.prefix} ${MASK}` : MASK]);

  const substitutionRows = form.substitutions
    .filter((substitution) => substitution.placeholder)
    .map((substitution) => [
      substitution.placeholder,
      `\u2192 ${MASK}`,
      substitution.surfaces.length
        ? `in ${substitution.surfaces.map((surface) => SURFACE_LABELS[surface]).join(", ")}`
        : ""
    ]);

  const outcome = (
    value: string | undefined,
    canClear: boolean,
    field: TAgentVaultMemberProvidedField
  ) => {
    if (form.memberProvidedFields.includes(field)) return "Set by each member";
    // Nothing of the admin's carries over to a new credential type or a field taken back from members, so there is
    // no value to replace or clear.
    if (!isUpdate || form.credentialType !== storedType || storedMemberFields.includes(field)) {
      return value ? "Set" : "None";
    }
    if (value === UNCHANGED_SECRET) return "Unchanged";
    if (value) return "Replaced";
    return canClear ? "Cleared" : "Unchanged";
  };

  return (
    <div className="mb-4 flex flex-col gap-y-8">
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Details</DetailGroupHeader>
        {isMcp ? (
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{form.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Server URL</DetailLabel>
              <DetailValue className="break-all">{form.serverUrl.trim()}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Transport</DetailLabel>
              <DetailValue>{TRANSPORT_LABELS[form.transport]}</DetailValue>
            </Detail>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{form.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Hosts</DetailLabel>
              <DetailValue>{form.hosts.join(", ")}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Methods</DetailLabel>
              <DetailValue>
                {isAllMethods(form.methods) ? "All" : form.methods.join(", ")}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Paths</DetailLabel>
              <DetailValue>
                {form.pathPrefixes.length ? form.pathPrefixes.join(", ") : "All"}
              </DetailValue>
            </Detail>
          </div>
        )}
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Credential</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Type</DetailLabel>
            <DetailValue>
              {isMcp && !isOAuth ? "Bearer Token" : CREDENTIAL_LABELS[form.credentialType]}
            </DetailValue>
          </Detail>
          {isOAuth && (
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>{oauthStatusLabel(form, service)}</DetailValue>
            </Detail>
          )}
          {sends && (
            <Detail>
              <DetailLabel>Sends</DetailLabel>
              <DetailValue>{sends}</DetailValue>
            </Detail>
          )}
          {isBasic && (
            <Detail>
              <DetailLabel>Username</DetailLabel>
              <DetailValue>
                {outcome(form.username, true, AgentVaultVariableReferenceField.CredentialUsername)}
              </DetailValue>
            </Detail>
          )}
          {form.credentialType !== AgentVaultCredentialType.Passthrough && !isOAuth && (
            <Detail>
              <DetailLabel>{secretLabel}</DetailLabel>
              <DetailValue>
                {outcome(form.secret, isBasic, AgentVaultVariableReferenceField.CredentialValue)}
              </DetailValue>
            </Detail>
          )}
        </div>
        {(headerRows.length > 0 || substitutionRows.length > 0) && (
          <div className="flex flex-col gap-3">
            {headerRows.length > 0 && (
              <CodeBlock
                label="Custom headers"
                isCopyable={false}
                value={alignColumns(headerRows)}
              />
            )}
            {substitutionRows.length > 0 && (
              <CodeBlock
                label="Substitutions"
                isCopyable={false}
                value={alignColumns(substitutionRows)}
              />
            )}
          </div>
        )}
      </DetailGroup>
    </div>
  );
};
