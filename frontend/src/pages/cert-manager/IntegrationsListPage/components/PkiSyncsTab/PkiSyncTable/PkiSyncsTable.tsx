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
  DeletePkiSyncModal,
  PkiSyncImportCertificatesModal,
  PkiSyncRemoveCertificatesModal
} from "@app/components/pki-syncs";
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
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  PkiSync,
  PkiSyncStatus,
  TPkiSync,
  useTriggerPkiSyncSyncCertificates,
  useUpdatePkiSync
} from "@app/hooks/api/pkiSyncs";

import { getPkiSyncDestinationColValues } from "./helpers";
import { PkiSyncRow } from "./PkiSyncRow";

enum PkiSyncsOrderBy {
  Destination = "destination",
  Name = "name",
  Status = "status"
}

type PkiSyncFilters = {
  destinations: PkiSync[];
  status: PkiSyncStatus[];
};

const getSyncStatusOrderValue = (syncStatus: PkiSyncStatus | null) => {
  switch (syncStatus) {
    case PkiSyncStatus.Failed:
      return 0;
    case PkiSyncStatus.Pending:
    case PkiSyncStatus.Running:
      return 1;
    case PkiSyncStatus.Succeeded:
      return 2;
    default:
      return 3;
  }
};

type Props = {
  pkiSyncs: TPkiSync[];
};

const STATUS_ICON_MAP = {
  [PkiSyncStatus.Succeeded]: { icon: faCheck, className: "text-green", name: "Synced" },
  [PkiSyncStatus.Failed]: { icon: faWarning, className: "text-red", name: "Not Synced" },
  [PkiSyncStatus.Pending]: { icon: faRotate, className: "text-yellow", name: "Syncing" },
  [PkiSyncStatus.Running]: { icon: faRotate, className: "text-yellow", name: "Syncing" }
};

export const PkiSyncsTable = ({ pkiSyncs }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteSync",
    "importCertificates",
    "removeCertificates"
  ] as const);
  const triggerSync = useTriggerPkiSyncSyncCertificates();
  const updateSync = useUpdatePkiSync();

  const [filters, setFilters] = useState<PkiSyncFilters>({
    destinations: [],
    status: []
  });

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
  } = usePagination<PkiSyncsOrderBy>(PkiSyncsOrderBy.Name, {
    initPerPage: getUserTablePreference("pkiSyncTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pkiSyncTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredPkiSyncs = useMemo(
    () =>
      pkiSyncs
        .filter((pkiSync) => {
          const { destination, name, syncStatus } = pkiSync;

          if (filters.destinations.length && !filters.destinations.includes(destination))
            return false;

          if (filters.status.length && (!syncStatus || !filters.status.includes(syncStatus))) {
            return false;
          }

          const searchValue = search.trim().toLowerCase();

          const destinationValues = getPkiSyncDestinationColValues(pkiSync);

          return (
            (PKI_SYNC_MAP[destination]?.name || "Unknown Service")
              .toLowerCase()
              .includes(searchValue) ||
            name.toLowerCase().includes(searchValue) ||
            (pkiSync.appConnectionName &&
              pkiSync.appConnectionName.toLowerCase().includes(searchValue)) ||
            destinationValues.primaryText.toLowerCase().includes(searchValue) ||
            destinationValues.secondaryText?.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [syncOne, syncTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case PkiSyncsOrderBy.Destination:
              return getPkiSyncDestinationColValues(syncOne)
                .primaryText.toLowerCase()
                .localeCompare(getPkiSyncDestinationColValues(syncTwo).primaryText.toLowerCase());
            case PkiSyncsOrderBy.Status:
              if (!syncOne.syncStatus && syncTwo.syncStatus) return 1;
              if (syncOne.syncStatus && !syncTwo.syncStatus) return -1;
              if (!syncOne.syncStatus && !syncTwo.syncStatus) return 0;

              return (
                getSyncStatusOrderValue(syncOne.syncStatus) -
                getSyncStatusOrderValue(syncTwo.syncStatus)
              );
            case PkiSyncsOrderBy.Name:
            default:
              return syncOne.name.toLowerCase().localeCompare(syncTwo.name.toLowerCase());
          }
        }),
    [pkiSyncs, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredPkiSyncs.length,
    offset,
    setPage
  });

  const handleSort = (column: PkiSyncsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: PkiSyncsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: PkiSyncsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.destinations.length || filters.status.length);

  const handleDelete = (pkiSync: TPkiSync) => handlePopUpOpen("deleteSync", pkiSync);

  const handleTriggerImportCertificates = (pkiSync: TPkiSync) =>
    handlePopUpOpen("importCertificates", pkiSync);

  const handleTriggerRemoveCertificates = (pkiSync: TPkiSync) =>
    handlePopUpOpen("removeCertificates", pkiSync);

  const handleToggleEnableSync = async (pkiSync: TPkiSync) => {
    const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

    const isAutoSyncEnabled = !pkiSync.isAutoSyncEnabled;

    await updateSync.mutateAsync({
      syncId: pkiSync.id,
      projectId: pkiSync.projectId,
      destination: pkiSync.destination,
      isAutoSyncEnabled
    });

    createNotification({
      text: `Successfully ${isAutoSyncEnabled ? "enabled" : "disabled"} auto-sync for ${destinationName} Sync`,
      type: "success"
    });
  };

  const handleTriggerSync = async (pkiSync: TPkiSync) => {
    const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

    await triggerSync.mutateAsync({
      syncId: pkiSync.id,
      destination: pkiSync.destination,
      projectId: pkiSync.projectId
    });

    createNotification({
      text: `Successfully triggered ${destinationName} Sync`,
      type: "success"
    });
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search PKI syncs..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter PKI syncs"
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
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {[PkiSyncStatus.Running, PkiSyncStatus.Succeeded, PkiSyncStatus.Failed].map(
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
            {pkiSyncs.length ? (
              [...new Set(pkiSyncs.map(({ destination }) => destination))].map((destination) => {
                const { name, image } = PKI_SYNC_MAP[destination];

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
              <DropdownMenuItem isDisabled>No PKI Syncs Configured</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-2" />
              <Th className="w-1/2">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(PkiSyncsOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(PkiSyncsOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(PkiSyncsOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Destination
                  <IconButton
                    variant="plain"
                    className={getClassName(PkiSyncsOrderBy.Destination)}
                    ariaLabel="sort"
                    onClick={() => handleSort(PkiSyncsOrderBy.Destination)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(PkiSyncsOrderBy.Destination)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4 min-w-42">
                <div className="flex items-center">
                  Status
                  <IconButton
                    variant="plain"
                    className={getClassName(PkiSyncsOrderBy.Status)}
                    ariaLabel="sort"
                    onClick={() => handleSort(PkiSyncsOrderBy.Status)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(PkiSyncsOrderBy.Status)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredPkiSyncs.slice(offset, perPage * page).map((pkiSync) => (
              <PkiSyncRow
                key={pkiSync.id}
                pkiSync={pkiSync}
                onDelete={handleDelete}
                onTriggerSyncCertificates={handleTriggerSync}
                onTriggerImportCertificates={handleTriggerImportCertificates}
                onTriggerRemoveCertificates={handleTriggerRemoveCertificates}
                onToggleEnable={handleToggleEnableSync}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredPkiSyncs.length) && (
          <Pagination
            count={filteredPkiSyncs.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!filteredPkiSyncs?.length && (
          <EmptyState
            title={
              pkiSyncs.length ? "No syncs match search..." : "This project has no syncs configured"
            }
            icon={pkiSyncs.length ? faSearch : faRotate}
          />
        )}
      </TableContainer>
      <DeletePkiSyncModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSync", isOpen)}
        isOpen={popUp.deleteSync.isOpen}
        pkiSync={popUp.deleteSync.data}
      />
      {popUp.importCertificates.data && (
        <PkiSyncImportCertificatesModal
          onOpenChange={(isOpen) => handlePopUpToggle("importCertificates", isOpen)}
          isOpen={popUp.importCertificates.isOpen}
          pkiSync={popUp.importCertificates.data}
        />
      )}
      <PkiSyncRemoveCertificatesModal
        onOpenChange={(isOpen) => handlePopUpToggle("removeCertificates", isOpen)}
        isOpen={popUp.removeCertificates.isOpen}
        pkiSync={popUp.removeCertificates.data}
      />
    </div>
  );
};
