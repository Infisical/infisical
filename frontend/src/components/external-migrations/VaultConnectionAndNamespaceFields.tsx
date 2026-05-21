import { AppConnectionOption } from "@app/components/app-connections";
import { FilterableSelect, FormControl } from "@app/components/v2";
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
        <FormControl
          label="App Connection"
          className="mb-4"
          tooltipText="Select the HashiCorp Vault app connection to use for this import."
        >
          <>
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
              className="w-full"
              components={{ Option: AppConnectionOption }}
            />
            <p className="mt-1 text-xs text-mineshaft-400">
              Project-scoped HashiCorp Vault app connections available to you
            </p>
          </>
        </FormControl>
      )}

      <FormControl label="Namespace" className="mb-4" tooltipText={namespaceTooltip}>
        <>
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
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">{namespaceHelpText}</p>
        </>
      </FormControl>
    </>
  );
};
