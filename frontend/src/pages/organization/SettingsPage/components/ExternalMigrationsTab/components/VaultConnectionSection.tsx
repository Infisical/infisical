import { useMemo } from "react";

import { createNotification } from "@app/components/notifications";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useGetExternalMigrationConfig,
  useUpdateExternalMigrationConfig
} from "@app/hooks/api/migration";
import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";

export const VaultConnectionSection = () => {
  const { data: appConnections = [], isPending: isLoadingConnections } = useListAppConnections();

  const vaultConnections = useMemo(
    () => appConnections.filter((conn) => conn.app === AppConnection.HCVault),
    [appConnections]
  );

  const { data: currentConfig, isPending: isLoadingConfig } = useGetExternalMigrationConfig(
    ExternalMigrationProviders.Vault
  );

  const { mutateAsync: updateConfig, isPending: isUpdating } = useUpdateExternalMigrationConfig(
    ExternalMigrationProviders.Vault
  );

  const handleConnectionChange = async (
    selectedConnection: { id: string; name: string } | null
  ) => {
    try {
      await updateConfig({
        connectionId: selectedConnection?.id || null
      });

      createNotification({
        type: "success",
        text: "Vault connection updated successfully"
      });
    } catch (error) {
      console.error("Failed to update vault connection:", error);
      createNotification({
        type: "error",
        text: "Failed to update vault connection"
      });
    }
  };

  const selectedConnection = useMemo(() => {
    if (!currentConfig?.connectionId) return null;
    return vaultConnections.find((conn) => conn.id === currentConfig.connectionId) || null;
  }, [currentConfig?.connectionId, vaultConnections]);

  const isLoading = isLoadingConnections || isLoadingConfig;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <img
          src="/images/integrations/Vault.png"
          alt="HashiCorp Vault logo"
          className="bg-bunker-500 h-10 w-10 rounded-md p-2"
        />
        <div>
          <h3 className="text-mineshaft-100 text-lg font-medium">HashiCorp Vault</h3>
          <p className="text-sm text-gray-400">
            Enable in-platform migration tooling for policy imports and secret engine migrations
          </p>
        </div>
      </div>

      <div className="max-w-md">
        <FormControl
          label="HashiCorp Vault Connection"
          tooltipText="Select an existing App Connection to enable in-platform migration features. Manage connections in the App Connections section."
        >
          <FilterableSelect
            value={selectedConnection}
            onChange={(newValue) => {
              handleConnectionChange(newValue as { id: string; name: string } | null);
            }}
            isLoading={isLoading}
            isDisabled={isUpdating}
            options={vaultConnections}
            placeholder="Select connection..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            isClearable
          />
        </FormControl>
      </div>

      <p className="text-mineshaft-400 mt-2 text-xs">
        Select an existing App Connection to enable in-platform migration features. Manage
        connections in the App Connections section.
      </p>
    </div>
  );
};
