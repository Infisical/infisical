import { useMemo, useState } from "react";
import { Download, Edit, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  EmptyMedia,
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
import { useOrganization } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  getInPlatformMigrationProviderMeta,
  TInPlatformMigrationApp
} from "@app/helpers/externalMigrationInPlatform";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  useDeleteDopplerExternalMigrationConfig,
  useDeleteVaultExternalMigrationConfig,
  useGetDopplerExternalMigrationConfigs,
  useGetVaultExternalMigrationConfigs
} from "@app/hooks/api/migration";
import {
  TDopplerExternalMigrationConfig,
  TVaultExternalMigrationConfig
} from "@app/hooks/api/migration/types";

import { DopplerConfigModal } from "./DopplerConfigModal";
import { DopplerImportModal } from "./DopplerImportModal";
import { SelectInPlatformMigrationProviderModal } from "./SelectInPlatformMigrationProviderModal";
import { VaultNamespaceConfigModal } from "./VaultNamespaceConfigModal";

type TMergedRow =
  | { kind: "vault"; config: TVaultExternalMigrationConfig }
  | { kind: "doppler"; config: TDopplerExternalMigrationConfig };

const SKELETON_ROW_KEYS = ["sk-1", "sk-2", "sk-3"] as const;

export const InPlatformMigrationSection = () => {
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);

  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultEditConfig, setVaultEditConfig] = useState<TVaultExternalMigrationConfig | undefined>();

  const [dopplerConfigModalOpen, setDopplerConfigModalOpen] = useState(false);
  const [dopplerEditConfig, setDopplerEditConfig] = useState<
    TDopplerExternalMigrationConfig | undefined
  >();

  const [dopplerImportModalOpen, setDopplerImportModalOpen] = useState(false);
  const [dopplerImportConfig, setDopplerImportConfig] = useState<TDopplerExternalMigrationConfig | null>(
    null
  );

  const [vaultDeleteOpen, setVaultDeleteOpen] = useState(false);
  const [vaultToDelete, setVaultToDelete] = useState<TVaultExternalMigrationConfig | null>(null);

  const [dopplerDeleteOpen, setDopplerDeleteOpen] = useState(false);
  const [dopplerToDelete, setDopplerToDelete] = useState<TDopplerExternalMigrationConfig | null>(null);

  const { data: vaultConfigs = [], isPending: isVaultLoading } = useGetVaultExternalMigrationConfigs();
  const { data: dopplerConfigs = [], isPending: isDopplerLoading } =
    useGetDopplerExternalMigrationConfigs();

  const { currentOrg } = useOrganization();
  const { data: appConnections = [] } = useListAppConnections();

  const { mutateAsync: deleteVaultConfig } = useDeleteVaultExternalMigrationConfig();
  const { mutateAsync: deleteDopplerConfig } = useDeleteDopplerExternalMigrationConfig();

  const mergedRows = useMemo(() => {
    const rows: TMergedRow[] = [
      ...vaultConfigs.map((config) => ({ kind: "vault" as const, config })),
      ...dopplerConfigs.map((config) => ({ kind: "doppler" as const, config }))
    ];
    rows.sort((a, b) => b.config.createdAt.localeCompare(a.config.createdAt));
    return rows;
  }, [vaultConfigs, dopplerConfigs]);

  const isLoading = isVaultLoading || isDopplerLoading;

  const getConnectionName = (connectionId: string | null) => {
    if (!connectionId) return "None";
    const connection = appConnections.find((conn) => conn.id === connectionId);
    return connection?.name || "Unknown";
  };

  const providerApp = (row: TMergedRow): TInPlatformMigrationApp =>
    row.kind === "vault" ? AppConnection.HCVault : AppConnection.Doppler;

  const openAddForProvider = (app: TInPlatformMigrationApp) => {
    if (app === AppConnection.HCVault) {
      setVaultEditConfig(undefined);
      setVaultModalOpen(true);
    } else {
      setDopplerEditConfig(undefined);
      setDopplerConfigModalOpen(true);
    }
  };

  const handleVaultDeleteConfirm = async () => {
    if (!vaultToDelete) return;
    await deleteVaultConfig({ id: vaultToDelete.id });
    createNotification({
      type: "success",
      text: "Namespace configuration deleted successfully"
    });
    setVaultDeleteOpen(false);
    setVaultToDelete(null);
  };

  const handleDopplerDeleteConfirm = async () => {
    if (!dopplerToDelete) return;
    await deleteDopplerConfig({ id: dopplerToDelete.id });
    createNotification({
      type: "success",
      text: "Doppler configuration deleted successfully"
    });
    setDopplerDeleteOpen(false);
    setDopplerToDelete(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-medium text-mineshaft-100">Configured platforms</h3>
          <p className="text-sm text-gray-400">
            Link HashiCorp Vault namespaces or Doppler to enable migration actions across Infisical.
          </p>
        </div>
        <Button
          variant="project"
          type="button"
          className="gap-1.5"
          onClick={() => setIsProviderPickerOpen(true)}
        >
          <Plus className="size-4 shrink-0" />
          Add configuration
        </Button>
      </div>

      {isLoading ? (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Platform</UnstableTableHead>
              <UnstableTableHead>Namespace</UnstableTableHead>
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
                  <Skeleton className="h-4 w-28" />
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
      ) : mergedRows.length === 0 ? (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <EmptyMedia variant="icon">
              <Plus />
            </EmptyMedia>
            <UnstableEmptyTitle>No migration configurations</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Add a platform configuration to enable in-platform migration features.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Platform</UnstableTableHead>
              <UnstableTableHead>Namespace</UnstableTableHead>
              <UnstableTableHead>Connection</UnstableTableHead>
              <UnstableTableHead className="w-12 text-right" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {mergedRows.map((row) => {
              const app = providerApp(row);
              const { name, imageFileName } = getInPlatformMigrationProviderMeta(app);

              return (
                <UnstableTableRow key={`${row.kind}-${row.config.id}`}>
                  <UnstableTableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={`/images/integrations/${imageFileName}`}
                        alt=""
                        className="size-8 rounded-md bg-bunker-500 p-1"
                      />
                      <span className="text-sm text-mineshaft-200">{name}</span>
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell className="text-sm text-mineshaft-300">
                    {row.kind === "vault" ? row.config.namespace : "—"}
                  </UnstableTableCell>
                  <UnstableTableCell>{getConnectionName(row.config.connectionId)}</UnstableTableCell>
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
                        {row.kind === "doppler" && (
                          <UnstableDropdownMenuItem
                            onClick={() => {
                              setDopplerImportConfig(row.config);
                              setDopplerImportModalOpen(true);
                            }}
                          >
                            <Download />
                            Import secrets
                          </UnstableDropdownMenuItem>
                        )}
                        <UnstableDropdownMenuItem
                          onClick={() => {
                            if (row.kind === "vault") {
                              setVaultEditConfig(row.config);
                              setVaultModalOpen(true);
                            } else {
                              setDopplerEditConfig(row.config);
                              setDopplerConfigModalOpen(true);
                            }
                          }}
                        >
                          <Edit />
                          Edit
                        </UnstableDropdownMenuItem>
                        <UnstableDropdownMenuItem
                          variant="danger"
                          onClick={() => {
                            if (row.kind === "vault") {
                              setVaultToDelete(row.config);
                              setVaultDeleteOpen(true);
                            } else {
                              setDopplerToDelete(row.config);
                              setDopplerDeleteOpen(true);
                            }
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
      )}

      <p className="mt-4 text-xs text-mineshaft-400">
        Manage credentials in{" "}
        <Link
          to="/organizations/$orgId/app-connections"
          params={{ orgId: currentOrg.id }}
          className="text-primary underline hover:text-primary-300"
        >
          App Connections
        </Link>
        . Use <span className="text-mineshaft-300">{APP_CONNECTION_MAP[AppConnection.HCVault].name}</span>{" "}
        or <span className="text-mineshaft-300">{APP_CONNECTION_MAP[AppConnection.Doppler].name}</span>{" "}
        connection types as needed.
      </p>

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

      {dopplerImportConfig && (
        <DopplerImportModal
          isOpen={dopplerImportModalOpen}
          onOpenChange={(open) => {
            setDopplerImportModalOpen(open);
            if (!open) setDopplerImportConfig(null);
          }}
          config={dopplerImportConfig}
        />
      )}

      <DeleteActionModal
        isOpen={vaultDeleteOpen}
        title={`Delete namespace configuration for "${vaultToDelete?.namespace}"?`}
        onChange={(open) => {
          setVaultDeleteOpen(open);
          if (!open) setVaultToDelete(null);
        }}
        deleteKey="confirm"
        onDeleteApproved={handleVaultDeleteConfirm}
      />

      <DeleteActionModal
        isOpen={dopplerDeleteOpen}
        title="Delete Doppler configuration?"
        onChange={(open) => {
          setDopplerDeleteOpen(open);
          if (!open) setDopplerToDelete(null);
        }}
        deleteKey="confirm"
        onDeleteApproved={handleDopplerDeleteConfirm}
      />
    </div>
  );
};
