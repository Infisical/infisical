import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheck,
  faCheckCircle,
  faFilter,
  faMagnifyingGlass,
  faRotate,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  DeleteSecretSyncModal,
  SecretSyncImportSecretsModal,
  SecretSyncRemoveSecretsModal
} from "@app/components/secret-syncs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretSync,
  SecretSyncStatus,
  TSecretSync,
  useTriggerSecretSyncSyncSecrets,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs";

import { getSecretSyncDestinationColValues } from "./helpers";
import { SecretSyncRow } from "./SecretSyncRow";

enum SecretSyncsOrderBy {
  Destination = "destination",
  Source = "source",
  Name = "name",
  Status = "status"
}

type SecretSyncFilters = {
  destinations: SecretSync[];
  status: SecretSyncStatus[];
  environmentIds: string[];
};

const getSyncStatusOrderValue = (syncStatus: SecretSyncStatus | null) => {
  switch (syncStatus) {
    case SecretSyncStatus.Failed:
      return 0;
    case SecretSyncStatus.Pending:
    case SecretSyncStatus.Running:
      return 1;
    case SecretSyncStatus.Succeeded:
      return 2;
    default:
      return 3;
  }
};

type Props = {
  secretSyncs: TSecretSync[];
};

const STATUS_ICON_MAP = {
  [SecretSyncStatus.Succeeded]: { icon: faCheck, className: "text-green", name: "Synced" },
  [SecretSyncStatus.Failed]: { icon: faWarning, className: "text-red", name: "Not Synced" },
  [SecretSyncStatus.Pending]: { icon: faRotate, className: "text-yellow", name: "Syncing" },
  [SecretSyncStatus.Running]: { icon: faRotate, className: "text-yellow", name: "Syncing" }
};

export const SecretSyncsTable = ({ secretSyncs }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteSync",
    "importSecrets",
    "removeSecrets"
  ] as const);
  const triggerSync = useTriggerSecretSyncSyncSecrets();
  const updateSync = useUpdateSecretSync();

  const [filters, setFilters] = useState<SecretSyncFilters>({
    destinations: [],
    status: [],
    environmentIds: []
  });

  const { currentWorkspace } = useWorkspace();

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection,
    orderBy,
    setOrderDirection,
    setOrderBy
  } = usePagination<SecretSyncsOrderBy>(SecretSyncsOrderBy.Name, {
    initPerPage: getUserTablePreference("secretSyncTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("secretSyncTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredSecretSyncs = useMemo(
    () =>
      secretSyncs
        .filter((secretSync) => {
          const { destination, name, connection, folder, environment, syncStatus } = secretSync;

          if (filters.destinations.length && !filters.destinations.includes(destination))
            return false;

          if (
            filters.environmentIds.length &&
            environment?.id &&
            !filters.environmentIds.includes(environment.id)
          )
            return false;

          if (filters.status.length && (!syncStatus || !filters.status.includes(syncStatus))) {
            return false;
          }

          const searchValue = search.trim().toLowerCase();

          const destinationValues = getSecretSyncDestinationColValues(secretSync);

          return (
            SECRET_SYNC_MAP[destination].name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue) ||
            folder?.path.toLowerCase().includes(searchValue) ||
            environment?.name.toLowerCase().includes(searchValue) ||
            connection.name.toLowerCase().includes(searchValue) ||
            destinationValues.primaryText.toLowerCase().includes(searchValue) ||
            destinationValues.secondaryText?.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [syncOne, syncTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case SecretSyncsOrderBy.Source:
              return (syncOne.folder?.path ?? "")
                .toLowerCase()
                .localeCompare(syncTwo.folder?.path.toLowerCase() ?? "");
            case SecretSyncsOrderBy.Destination:
              return getSecretSyncDestinationColValues(syncOne)
                .primaryText.toLowerCase()
                .localeCompare(
                  getSecretSyncDestinationColValues(syncTwo).primaryText.toLowerCase()
                );
            case SecretSyncsOrderBy.Status:
              if (!syncOne.syncStatus && syncTwo.syncStatus) return 1;
              if (syncOne.syncStatus && !syncTwo.syncStatus) return -1;
              if (!syncOne.syncStatus && !syncTwo.syncStatus) return 0;

              return (
                getSyncStatusOrderValue(syncOne.syncStatus) -
                getSyncStatusOrderValue(syncTwo.syncStatus)
              );
            case SecretSyncsOrderBy.Name:
            default:
              return syncOne.name.toLowerCase().localeCompare(syncTwo.name.toLowerCase());
          }
        }),
    [secretSyncs, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredSecretSyncs.length,
    offset,
    setPage
  });

  const handleSort = (column: SecretSyncsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: SecretSyncsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: SecretSyncsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.destinations.length);

  const handleDelete = (secretSync: TSecretSync) => handlePopUpOpen("deleteSync", secretSync);

  const handleTriggerImportSecrets = (secretSync: TSecretSync) =>
    handlePopUpOpen("importSecrets", secretSync);

  const handleTriggerRemoveSecrets = (secretSync: TSecretSync) =>
    handlePopUpOpen("removeSecrets", secretSync);

  const handleToggleEnableSync = async (secretSync: TSecretSync) => {
    const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

    const isAutoSyncEnabled = !secretSync.isAutoSyncEnabled;

    try {
      await updateSync.mutateAsync({
        syncId: secretSync.id,
        destination: secretSync.destination,
        isAutoSyncEnabled,
        projectId: secretSync.projectId
      });

      createNotification({
        text: `Successfully ${isAutoSyncEnabled ? "enabled" : "disabled"} auto-sync for ${destinationName} Sync`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to ${isAutoSyncEnabled ? "enable" : "disable"} auto-sync for ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  const handleTriggerSync = async (secretSync: TSecretSync) => {
    const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

    try {
      await triggerSync.mutateAsync({
        syncId: secretSync.id,
        destination: secretSync.destination,
        projectId: secretSync.projectId
      });

      createNotification({
        text: `Successfully triggered ${destinationName} Sync`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to trigger ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search secret syncs..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter secret syncs"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {[SecretSyncStatus.Running, SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].map(
              (status) => (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setFilters((prev) => ({
                      ...prev,
                      status: prev.status.includes(status)
                        ? prev.status.filter((s) => s !== status)
                        : [...prev.status, status]
                    }));
                  }}
                  key={status}
                  icon={
                    filters.status.includes(status) && (
                      <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={STATUS_ICON_MAP[status].icon}
                      className={STATUS_ICON_MAP[status].className}
                    />
                    <span className="capitalize">{STATUS_ICON_MAP[status].name}</span>
                  </div>
                </DropdownMenuItem>
              )
            )}
            <DropdownMenuLabel>Service</DropdownMenuLabel>
            {secretSyncs.length ? (
              [...new Set(secretSyncs.map(({ destination }) => destination))].map((destination) => {
                const { name, image } = SECRET_SYNC_MAP[destination];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        destinations: prev.destinations.includes(destination)
                          ? prev.destinations.filter((a) => a !== destination)
                          : [...prev.destinations, destination]
                      }));
                    }}
                    key={destination}
                    icon={
                      filters.destinations.includes(destination) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        alt={`${name} integration`}
                        src={`/images/integrations/${image}`}
                        className="h-4 w-4"
                      />
                      <span>{name}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Secret Syncs Configured</DropdownMenuItem>
            )}
            <DropdownMenuLabel>Environment</DropdownMenuLabel>
            {currentWorkspace.environments.map((env) => (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setFilters((prev) => ({
                    ...prev,
                    environmentIds: prev.environmentIds.includes(env.id)
                      ? prev.environmentIds.filter((i) => i !== env.id)
                      : [...prev.environmentIds, env.id]
                  }));
                }}
                key={env.id}
                icon={
                  filters.environmentIds.includes(env.id) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <span className="capitalize">{env.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-2" />
              <Th className="w-1/4">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(SecretSyncsOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(SecretSyncsOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(SecretSyncsOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Source
                  <IconButton
                    variant="plain"
                    className={getClassName(SecretSyncsOrderBy.Source)}
                    ariaLabel="sort"
                    onClick={() => handleSort(SecretSyncsOrderBy.Source)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(SecretSyncsOrderBy.Source)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Destination
                  <IconButton
                    variant="plain"
                    className={getClassName(SecretSyncsOrderBy.Destination)}
                    ariaLabel="sort"
                    onClick={() => handleSort(SecretSyncsOrderBy.Destination)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(SecretSyncsOrderBy.Destination)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="min-w-[10.5rem]">
                <div className="flex items-center">
                  Status
                  <IconButton
                    variant="plain"
                    className={getClassName(SecretSyncsOrderBy.Status)}
                    ariaLabel="sort"
                    onClick={() => handleSort(SecretSyncsOrderBy.Status)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(SecretSyncsOrderBy.Status)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredSecretSyncs.slice(offset, perPage * page).map((secretSync) => (
              <SecretSyncRow
                key={secretSync.id}
                secretSync={secretSync}
                onDelete={handleDelete}
                onTriggerSyncSecrets={handleTriggerSync}
                onTriggerImportSecrets={handleTriggerImportSecrets}
                onTriggerRemoveSecrets={handleTriggerRemoveSecrets}
                onToggleEnable={handleToggleEnableSync}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredSecretSyncs.length) && (
          <Pagination
            count={filteredSecretSyncs.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!filteredSecretSyncs?.length && (
          <EmptyState
            title={
              secretSyncs.length
                ? "No syncs match search..."
                : "This project has no syncs configured"
            }
            icon={secretSyncs.length ? faSearch : faRotate}
          />
        )}
      </TableContainer>
      <DeleteSecretSyncModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSync", isOpen)}
        isOpen={popUp.deleteSync.isOpen}
        secretSync={popUp.deleteSync.data}
      />
      <SecretSyncImportSecretsModal
        onOpenChange={(isOpen) => handlePopUpToggle("importSecrets", isOpen)}
        isOpen={popUp.importSecrets.isOpen}
        secretSync={popUp.importSecrets.data}
      />
      <SecretSyncRemoveSecretsModal
        onOpenChange={(isOpen) => handlePopUpToggle("removeSecrets", isOpen)}
        isOpen={popUp.removeSecrets.isOpen}
        secretSync={popUp.removeSecrets.data}
      />
    </div>
  );
};
