import { type ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
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
};

export const defaultVaultConnectionId = (appConnections: TAvailableAppConnection[]) =>
  appConnections.length === 1 ? appConnections[0].id : null;

const FieldLabelWithTooltip = ({
  children,
  tooltip
}: {
  children: ReactNode;
  tooltip: string;
}) => (
  <FieldLabel>
    {children}
    <Tooltip>
      <TooltipTrigger>
        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
    </Tooltip>
  </FieldLabel>
);

export const VaultConnectionAndNamespaceFields = ({
  appConnections,
  connectionId,
  onConnectionIdChange,
  namespace,
  onNamespaceChange,
  namespaceTooltip,
  namespaceHelpText
}: Props) => {
  const hasAppConnections = appConnections.length > 0;
  const needsConnection = hasAppConnections && !connectionId;
  const activeConnectionId = hasAppConnections ? (connectionId ?? undefined) : undefined;
  const { data: namespaces, isLoading: isLoadingNamespaces } =
    useGetVaultNamespaces(activeConnectionId);

  return (
    <>
      {hasAppConnections && (
        <Field>
          <FieldLabelWithTooltip tooltip="Select the HashiCorp Vault app connection to use for this import.">
            App Connection
          </FieldLabelWithTooltip>
          <FieldContent>
            <FilterableSelect
              value={appConnections.find((conn) => conn.id === connectionId) ?? null}
              onChange={(value) => {
                if (value && !Array.isArray(value)) {
                  onConnectionIdChange((value as TAvailableAppConnection).id);
                }
              }}
              options={appConnections}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              placeholder="Select app connection..."
              components={{ Option: AppConnectionOption }}
            />
          </FieldContent>
          <FieldDescription>
            Project-scoped HashiCorp Vault app connections available to you
          </FieldDescription>
        </Field>
      )}

      <Field>
        <FieldLabelWithTooltip tooltip={namespaceTooltip}>Namespace</FieldLabelWithTooltip>
        <FieldContent>
          <FilterableSelect
            value={namespaces?.find((ns) => ns.name === namespace) ?? null}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                onNamespaceChange((value as { id: string; name: string }).name);
              }
            }}
            options={namespaces || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
            isDisabled={isLoadingNamespaces || needsConnection}
            placeholder={
              needsConnection ? "Select an app connection first..." : "Select namespace..."
            }
          />
        </FieldContent>
        <FieldDescription>{namespaceHelpText}</FieldDescription>
      </Field>
    </>
  );
};
