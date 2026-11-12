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
  isNativeServiceType,
  TAgentVaultMemberProvidedField
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { ExpandableValueList } from "./ExpandableValueList";
import {
  credentialLabel,
  hasDatabase,
  isAllMethods,
  McpToolScope,
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
  const value = form.memberProvidedFields.includes(AgentVaultVariableReferenceField.CredentialValue)
    ? "<member value>"
    : MASK;
  if (form.credentialType === AgentVaultCredentialType.OAuth)
    return `Authorization: Bearer ${value}`;
  const prefix = form.headerPrefix ? `${form.headerPrefix} ` : "";
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
  const isNative = isNativeServiceType(form.serviceType);
  const isBasic = form.credentialType === AgentVaultCredentialType.Basic;
  const isSshKey = form.credentialType === AgentVaultCredentialType.SshKey;
  const isOAuth = form.credentialType === AgentVaultCredentialType.OAuth;
  const isAllTools = form.toolScope === McpToolScope.All;
  const secretLabel = isBasic ? "Password" : "Token";
  // A database or SSH login sends no HTTP header.
  const sends = isNative ? null : credentialPreview(form);

  const tlsSummary = () => {
    if (!form.tlsEnabled) return "Off";
    if (!form.tlsVerify) return "On, doesn't verify the certificate";
    return form.tlsCa.trim()
      ? "On, verifies the certificate with a custom CA"
      : "On, verifies the certificate";
  };

  // An emptied box keeps what is stored; only Remove Certificate takes a stored value away.
  const keyOutcome = (value: string, hasStored: boolean, isRemoved = false) => {
    if (hasStored && isRemoved) return "Removed";
    if (hasStored && (value === UNCHANGED_SECRET || !value.trim())) return "Unchanged";
    if (value.trim()) return hasStored ? "Replaced" : "Set";
    return "None";
  };
  const hasStoredKey = isUpdate && storedType === AgentVaultCredentialType.SshKey;
  const hasStoredCertificate =
    hasStoredKey &&
    service?.credential.type === AgentVaultCredentialType.SshKey &&
    service.credential.hasCertificate;

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
        {isNative && (
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{form.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Host</DetailLabel>
              <DetailValue className="break-all">{form.host.trim()}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Port</DetailLabel>
              <DetailValue>{form.port.trim()}</DetailValue>
            </Detail>
            {hasDatabase(form.serviceType) && (
              <Detail>
                <DetailLabel>Database</DetailLabel>
                <DetailValue className="break-all">{form.database.trim()}</DetailValue>
              </Detail>
            )}
            {hasDatabase(form.serviceType) && (
              <Detail>
                <DetailLabel>TLS</DetailLabel>
                <DetailValue>{tlsSummary()}</DetailValue>
              </Detail>
            )}
          </div>
        )}
        {isMcp && (
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
        )}
        {!isNative && !isMcp && (
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
        {form.description.trim() && (
          <Detail>
            <DetailLabel>Description</DetailLabel>
            <DetailValue>{form.description.trim()}</DetailValue>
          </Detail>
        )}
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Credential</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Type</DetailLabel>
            <DetailValue>
              {isMcp && !isOAuth
                ? "Bearer Token"
                : credentialLabel(form.serviceType, form.credentialType)}
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
          {isSshKey && (
            <>
              <Detail>
                <DetailLabel>Username</DetailLabel>
                <DetailValue>{keyOutcome(form.username ?? "", hasStoredKey)}</DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Private Key</DetailLabel>
                <DetailValue>{keyOutcome(form.sshPrivateKey, hasStoredKey)}</DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Certificate</DetailLabel>
                <DetailValue>
                  {keyOutcome(
                    form.sshCertificate,
                    hasStoredCertificate,
                    form.sshCertificateRemoved
                  )}
                </DetailValue>
              </Detail>
            </>
          )}
          {form.credentialType !== AgentVaultCredentialType.Passthrough &&
            !isOAuth &&
            !isSshKey && (
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

      {isMcp && (
        <DetailGroup>
          <DetailGroupHeader className="border-b border-border pb-2">Tools</DetailGroupHeader>
          <Detail className="w-full min-w-0">
            <DetailLabel>
              {isAllTools ? "Allowed" : `Allowed (${form.allowedTools.length})`}
            </DetailLabel>
            <DetailValue>
              {isAllTools ? "All" : <ExpandableValueList values={form.allowedTools} />}
            </DetailValue>
          </Detail>
        </DetailGroup>
      )}
    </div>
  );
};
