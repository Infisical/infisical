import { ReactNode } from "react";
import { CircleHelpIcon } from "lucide-react";

import {
  Badge,
  Combobox,
  Field,
  FieldDescription,
  FieldLabel,
  OrgIcon,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetVaultNamespaces } from "@app/hooks/api/migration/queries";

type Props = {
  appConnections: TAvailableAppConnection[];
  connectionId: string | null;
  onConnectionIdChange: (connectionId: string) => void;
  namespace: string | null;
  onNamespaceChange: (namespace: string) => void;
  namespaceTooltip: string;
  namespaceHelpText: string;
  idPrefix?: string;
};

type VaultFieldLabelProps = {
  children: ReactNode;
  htmlFor: string;
  tooltip: string;
  tooltipLabel: string;
};

export const defaultVaultConnectionId = (appConnections: TAvailableAppConnection[]) =>
  appConnections.length === 1 ? appConnections[0].id : null;

export const VaultFieldLabel = ({
  children,
  htmlFor,
  tooltip,
  tooltipLabel
}: VaultFieldLabelProps) => (
  <div className="flex items-center gap-1.5">
    <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${tooltipLabel} information`}
          className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelpIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  </div>
);

export const VaultConnectionAndNamespaceFields = ({
  appConnections,
  connectionId,
  onConnectionIdChange,
  namespace,
  onNamespaceChange,
  namespaceTooltip,
  namespaceHelpText,
  idPrefix = "vault-import"
}: Props) => {
  const { isSubOrganization } = useOrganization();
  const hasAppConnections = appConnections.length > 0;
  const needsConnection = hasAppConnections && !connectionId;
  const activeConnectionId = hasAppConnections ? (connectionId ?? undefined) : undefined;
  const { data: namespaces, isLoading: isLoadingNamespaces } =
    useGetVaultNamespaces(activeConnectionId);
  const connectionInputId = `${idPrefix}-app-connection`;
  const namespaceInputId = `${idPrefix}-namespace`;

  return (
    <>
      {hasAppConnections && (
        <Field>
          <VaultFieldLabel
            htmlFor={connectionInputId}
            tooltip="Select the HashiCorp Vault app connection to use for this import."
            tooltipLabel="App Connection"
          >
            App Connection
          </VaultFieldLabel>
          <Combobox
            id={connectionInputId}
            value={appConnections.find((connection) => connection.id === connectionId) ?? null}
            onValueChange={(connection) => onConnectionIdChange(connection.id)}
            options={appConnections}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.name}
            placeholder="Select app connection..."
            searchPlaceholder="Search app connections..."
            searchAriaLabel="Search app connections"
            emptyMessage="No app connections found."
            modal
            renderOption={(option) => (
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate">{option.name}</span>
                {!option.projectId && (
                  <Badge variant={isSubOrganization ? "sub-org" : "org"}>
                    {isSubOrganization ? <SubOrgIcon /> : <OrgIcon />}
                    {isSubOrganization ? "Sub-Organization" : "Organization"}
                  </Badge>
                )}
              </div>
            )}
          />
          <FieldDescription>
            Project-scoped HashiCorp Vault app connections available to you
          </FieldDescription>
        </Field>
      )}

      <Field>
        <VaultFieldLabel
          htmlFor={namespaceInputId}
          tooltip={namespaceTooltip}
          tooltipLabel="Namespace"
        >
          Namespace
        </VaultFieldLabel>
        <Combobox
          id={namespaceInputId}
          value={namespaces?.find((option) => option.name === namespace) ?? null}
          onValueChange={(option) => onNamespaceChange(option.name)}
          options={namespaces ?? []}
          getOptionValue={(option) => option.name}
          getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
          isDisabled={isLoadingNamespaces || needsConnection}
          isLoading={isLoadingNamespaces}
          placeholder={
            needsConnection ? "Select an app connection first..." : "Select namespace..."
          }
          searchPlaceholder="Search namespaces..."
          searchAriaLabel="Search Vault namespaces"
          emptyMessage="No Vault namespaces found."
          modal
        />
        <FieldDescription>{namespaceHelpText}</FieldDescription>
      </Field>
    </>
  );
};
