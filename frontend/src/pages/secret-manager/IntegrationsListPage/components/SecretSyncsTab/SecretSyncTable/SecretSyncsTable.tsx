import { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  FilterIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  DeleteSecretSyncModal,
  SecretSyncImportSecretsModal,
  SecretSyncRemoveSecretsModal
} from "@app/components/secret-syncs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
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
  isPending: boolean;
};

const STATUS_ICON_MAP = {
  [SecretSyncStatus.Succeeded]: { Icon: CheckIcon, className: "text-success", name: "Synced" },
  [SecretSyncStatus.Failed]: {
    Icon: TriangleAlertIcon,
    className: "text-danger",
    name: "Not Synced"
  },
  [SecretSyncStatus.Pending]: { Icon: RefreshCwIcon, className: "text-info", name: "Syncing" },
  [SecretSyncStatus.Running]: { Icon: RefreshCwIcon, className: "text-info", name: "Syncing" }
};

export const SecretSyncsTable = ({ secretSyncs, isPending }: Props) => {
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

  const { currentProject } = useProject();

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

  const isTableFiltered = Boolean(
    filters.destinations.length || filters.status.length || filters.environmentIds.length
  );

  const handleDelete = (secretSync: TSecretSync) => handlePopUpOpen("deleteSync", secretSync);

  const handleTriggerImportSecrets = (secretSync: TSecretSync) =>
    handlePopUpOpen("importSecrets", secretSync);

  const handleTriggerRemoveSecrets = (secretSync: TSecretSync) =>
    handlePopUpOpen("removeSecrets", secretSync);

  const handleToggleEnableSync = async (secretSync: TSecretSync) => {
    const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

    const isAutoSyncEnabled = !secretSync.isAutoSyncEnabled;

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
  };

  const handleTriggerSync = async (secretSync: TSecretSync) => {
    const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

    await triggerSync.mutateAsync({
      syncId: secretSync.id,
      destination: secretSync.destination,
      projectId: secretSync.projectId
    });

    createNotification({
      text: `Successfully triggered ${destinationName} Sync`,
      type: "success"
    });
  };

  const isFiltered = Boolean(search || isTableFiltered);
  const showEmpty = !isPending && filteredSecretSyncs.length === 0;
  const visibleSyncs = filteredSecretSyncs.slice(offset, perPage * page);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search secret syncs..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Filter secret syncs"
              variant={isTableFiltered ? "project" : "outline"}
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {[SecretSyncStatus.Running, SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].map(
              (status) => {
                const { Icon, className, name } = STATUS_ICON_MAP[status];
                return (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={filters.status.includes(status)}
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        status: prev.status.includes(status)
                          ? prev.status.filter((s) => s !== status)
                          : [...prev.status, status]
                      }));
                    }}
                  >
                    <Icon className={className} />
                    <span className="capitalize">{name}</span>
                  </DropdownMenuCheckboxItem>
                );
              }
            )}

            {secretSyncs.length ? (
              <>
                <DropdownMenuLabel>Service</DropdownMenuLabel>
                {[...new Set(secretSyncs.map(({ destination }) => destination))].map(
                  (destination) => {
                    const { name, image } = SECRET_SYNC_MAP[destination];

                    return (
                      <DropdownMenuCheckboxItem
                        key={destination}
                        checked={filters.destinations.includes(destination)}
                        onClick={(e) => {
                          e.preventDefault();
                          setFilters((prev) => ({
                            ...prev,
                            destinations: prev.destinations.includes(destination)
                              ? prev.destinations.filter((a) => a !== destination)
                              : [...prev.destinations, destination]
                          }));
                        }}
                      >
                        <img
                          alt={`${name} integration`}
                          src={`/images/integrations/${image}`}
                          className="h-4 w-4"
                        />
                        <span>{name}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  }
                )}
              </>
            ) : null}
            <DropdownMenuLabel>Environment</DropdownMenuLabel>
            {currentProject.environments.map((env) => (
              <DropdownMenuCheckboxItem
                key={env.id}
                checked={filters.environmentIds.includes(env.id)}
                onClick={(e) => {
                  e.preventDefault();
                  setFilters((prev) => ({
                    ...prev,
                    environmentIds: prev.environmentIds.includes(env.id)
                      ? prev.environmentIds.filter((i) => i !== env.id)
                      : [...prev.environmentIds, env.id]
                  }));
                }}
              >
                <span className="capitalize">{env.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {isFiltered ? <SearchIcon /> : <RefreshCwIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {isFiltered ? "No syncs match search" : "This project has no syncs configured"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered ? "Adjust your search or filter criteria." : "Add a sync to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-2" />
                <TableHead className="w-1/4" onClick={() => handleSort(SecretSyncsOrderBy.Name)}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === SecretSyncsOrderBy.Name &&
                        "rotate-180",
                      orderBy !== SecretSyncsOrderBy.Name && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead className="w-1/3" onClick={() => handleSort(SecretSyncsOrderBy.Source)}>
                  Source
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === SecretSyncsOrderBy.Source &&
                        "rotate-180",
                      orderBy !== SecretSyncsOrderBy.Source && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead
                  className="w-1/3"
                  onClick={() => handleSort(SecretSyncsOrderBy.Destination)}
                >
                  Destination
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === SecretSyncsOrderBy.Destination &&
                        "rotate-180",
                      orderBy !== SecretSyncsOrderBy.Destination && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead
                  className="min-w-42"
                  onClick={() => handleSort(SecretSyncsOrderBy.Status)}
                >
                  Status
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === SecretSyncsOrderBy.Status &&
                        "rotate-180",
                      orderBy !== SecretSyncsOrderBy.Status && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-7" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                visibleSyncs.map((secretSync) => (
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
            </TableBody>
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
        </>
      )}
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
