import { useMemo, useState } from "react";
import { Edit, MoreVertical, Plus, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Skeleton,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  getInPlatformMigrationProviderMeta,
  TInPlatformMigrationApp
} from "@app/helpers/externalMigrationInPlatform";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useDeleteExternalMigrationConfig,
  useGetExternalMigrationConfigs
} from "@app/hooks/api/migration";
import {
  ExternalMigrationProviders,
  TExternalMigrationConfig
} from "@app/hooks/api/migration/types";

import { DopplerConfigModal } from "./DopplerConfigModal";
import { MigrationConfigDeleteDialog } from "./MigrationConfigDeleteDialog";
import { SelectInPlatformMigrationProviderModal } from "./SelectInPlatformMigrationProviderModal";
import { VaultNamespaceConfigModal } from "./VaultNamespaceConfigModal";

const SKELETON_ROW_KEYS = ["sk-1", "sk-2", "sk-3"] as const;

export const InPlatformMigrationSection = () => {
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);

  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultEditConfig, setVaultEditConfig] = useState<TExternalMigrationConfig | undefined>();

  const [dopplerConfigModalOpen, setDopplerConfigModalOpen] = useState(false);
  const [dopplerEditConfig, setDopplerEditConfig] = useState<
    TExternalMigrationConfig | undefined
  >();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<TExternalMigrationConfig | null>(null);

  const { data: vaultConfigs = [], isPending: isVaultLoading } = useGetExternalMigrationConfigs(
    ExternalMigrationProviders.Vault
  );
  const { data: dopplerConfigs = [], isPending: isDopplerLoading } = useGetExternalMigrationConfigs(
    ExternalMigrationProviders.Doppler
  );

  const { data: appConnections = [] } = useListAppConnections();

  const { mutateAsync: deleteConfig } = useDeleteExternalMigrationConfig();

  const mergedRows = useMemo(() => {
    const rows: TExternalMigrationConfig[] = [...vaultConfigs, ...dopplerConfigs];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows;
  }, [vaultConfigs, dopplerConfigs]);

  const isLoading = isVaultLoading || isDopplerLoading;

  const getConnectionName = (connectionId: string | null) => {
    if (!connectionId) return "None";
    const connection = appConnections.find((conn) => conn.id === connectionId);
    return connection?.name || "Unknown";
  };

  const providerApp = (config: TExternalMigrationConfig): TInPlatformMigrationApp =>
    config.provider === ExternalMigrationProviders.Vault
      ? AppConnection.HCVault
      : AppConnection.Doppler;

  const openAddForProvider = (app: TInPlatformMigrationApp) => {
    if (app === AppConnection.HCVault) {
      setVaultEditConfig(undefined);
      setVaultModalOpen(true);
    } else {
      setDopplerEditConfig(undefined);
      setDopplerConfigModalOpen(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;
    await deleteConfig({
      id: configToDelete.id,
      provider: configToDelete.provider as ExternalMigrationProviders
    });
    createNotification({
      type: "success",
      text: "Migration configuration deleted successfully"
    });
    setDeleteOpen(false);
    setConfigToDelete(null);
  };

  const renderTable = () => {
    if (isLoading) {
      return (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Platform</UnstableTableHead>
              <UnstableTableHead>Connection</UnstableTableHead>
              <UnstableTableHead className="w-12 text-right" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {SKELETON_ROW_KEYS.map((key) => (
              <UnstableTableRow key={key}>
                <UnstableTableCell>
                  <Skeleton className="h-4 w-36" />
                </UnstableTableCell>
                <UnstableTableCell>
                  <Skeleton className="h-4 w-32" />
                </UnstableTableCell>
                <UnstableTableCell className="text-right">
                  <Skeleton className="ml-auto size-7 shrink-0 rounded-md" />
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
          </UnstableTableBody>
        </UnstableTable>
      );
    }
    if (mergedRows.length === 0) {
      return (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No migration configurations</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Add a platform configuration to enable in-platform migration features.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      );
    }
    return (
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Platform</UnstableTableHead>
            <UnstableTableHead>Connection</UnstableTableHead>
            <UnstableTableHead className="w-12 text-right" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {mergedRows.map((config) => {
            const app = providerApp(config);
            const { name, imageFileName } = getInPlatformMigrationProviderMeta(app);
            const isDoppler = config.provider === ExternalMigrationProviders.Doppler;

            return (
              <UnstableTableRow key={config.id}>
                <UnstableTableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-bunker-500 p-1">
                      <img
                        src={`/images/integrations/${imageFileName}`}
                        alt=""
                        className={
                          isDoppler
                            ? "max-h-5 max-w-5 object-contain"
                            : "max-h-full max-w-full object-contain"
                        }
                      />
                    </div>
                    <span className="text-sm text-mineshaft-200">{name}</span>
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>{getConnectionName(config.connectionId)}</UnstableTableCell>
                <UnstableTableCell className="text-right">
                  <UnstableDropdownMenu>
                    <UnstableDropdownMenuTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        aria-label="Row actions"
                        className="text-mineshaft-300"
                      >
                        <MoreVertical className="size-4" />
                      </UnstableIconButton>
                    </UnstableDropdownMenuTrigger>
                    <UnstableDropdownMenuContent align="end" className="min-w-40">
                      <UnstableDropdownMenuItem
                        onClick={() => {
                          if (isDoppler) {
                            setDopplerEditConfig(config);
                            setDopplerConfigModalOpen(true);
                          } else {
                            setVaultEditConfig(config);
                            setVaultModalOpen(true);
                          }
                        }}
                      >
                        <Edit />
                        Edit
                      </UnstableDropdownMenuItem>
                      <UnstableDropdownMenuItem
                        variant="danger"
                        onClick={() => {
                          setConfigToDelete(config);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 />
                        Delete
                      </UnstableDropdownMenuItem>
                    </UnstableDropdownMenuContent>
                  </UnstableDropdownMenu>
                </UnstableTableCell>
              </UnstableTableRow>
            );
          })}
        </UnstableTableBody>
      </UnstableTable>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Configurations</h3>
        <Button
          variant="org"
          type="button"
          className="gap-1.5"
          onClick={() => setIsProviderPickerOpen(true)}
        >
          <Plus className="size-4 shrink-0" />
          Add configuration
        </Button>
      </div>

      {renderTable()}

      <SelectInPlatformMigrationProviderModal
        isOpen={isProviderPickerOpen}
        onOpenChange={setIsProviderPickerOpen}
        onSelect={openAddForProvider}
      />

      <VaultNamespaceConfigModal
        isOpen={vaultModalOpen}
        onOpenChange={(open) => {
          setVaultModalOpen(open);
          if (!open) setVaultEditConfig(undefined);
        }}
        editConfig={vaultEditConfig}
      />

      <DopplerConfigModal
        isOpen={dopplerConfigModalOpen}
        onOpenChange={(open) => {
          setDopplerConfigModalOpen(open);
          if (!open) setDopplerEditConfig(undefined);
        }}
        editConfig={dopplerEditConfig}
      />

      <MigrationConfigDeleteDialog
        isOpen={deleteOpen}
        title="Delete migration configuration?"
        onChange={(open) => {
          setDeleteOpen(open);
          if (!open) setConfigToDelete(null);
        }}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};
