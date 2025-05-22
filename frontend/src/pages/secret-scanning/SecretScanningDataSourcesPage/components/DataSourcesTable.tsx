import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faMagnifyingGlass,
  faRotate,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { EditSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { DeleteSecretScanningDataSourceModal } from "@app/components/secret-scanning/DeleteSecretScanningDataSourceModal";
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
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource,
  TSecretScanningDataSourceWithDetails,
  useTriggerSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { DataSourceRow } from "./DataSourceRow";

// import { getSecretSyncDestinationColValues } from "./helpers";

enum DataSourcesOrderBy {
  Type = "type",
  Name = "name",
  Status = "status"
}

type DataSourceFilters = {
  types: SecretScanningDataSource[];
  // status: SecretSyncStatus[];
};

// const getSyncStatusOrderValue = (syncStatus: SecretSyncStatus | null) => {
//   switch (syncStatus) {
//     case SecretSyncStatus.Failed:
//       return 0;
//     case SecretSyncStatus.Pending:
//     case SecretSyncStatus.Running:
//       return 1;
//     case SecretSyncStatus.Succeeded:
//       return 2;
//     default:
//       return 3;
//   }
// };

type Props = {
  dataSources: TSecretScanningDataSourceWithDetails[];
};

// const STATUS_ICON_MAP = {
//   [SecretSyncStatus.Succeeded]: { icon: faCheck, className: "text-green", name: "Synced" },
//   [SecretSyncStatus.Failed]: { icon: faWarning, className: "text-red", name: "Not Synced" },
//   [SecretSyncStatus.Pending]: { icon: faRotate, className: "text-yellow", name: "Syncing" },
//   [SecretSyncStatus.Running]: { icon: faRotate, className: "text-yellow", name: "Syncing" }
// };

export const DataSourcesTable = ({ dataSources }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteDataSource",
    "editDataSource",
    "triggerDataSourceScan"
  ] as const);
  const triggerDataSourceScan = useTriggerSecretScanningDataSource();
  const updateDataSource = useUpdateSecretScanningDataSource();

  const [filters, setFilters] = useState<DataSourceFilters>({
    types: []
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
  } = usePagination<DataSourcesOrderBy>(DataSourcesOrderBy.Name, { initPerPage: 20 });

  const filteredDataSources = useMemo(
    () =>
      dataSources
        .filter((dataSource) => {
          const { type, name, connection } = dataSource;

          if (filters.types.length && !filters.types.includes(type)) return false;

          // if (filters.status.length && (!syncStatus || !filters.status.includes(syncStatus))) {
          //   return false;
          // }

          const searchValue = search.trim().toLowerCase();

          // const destinationValues = getSecretSyncDestinationColValues(dataSource);

          return (
            SECRET_SCANNING_DATA_SOURCE_MAP[type].name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue) ||
            connection.name.toLowerCase().includes(searchValue)
            // ||
            // destinationValues.primaryText.toLowerCase().includes(searchValue) ||
            // destinationValues.secondaryText?.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [dataSourceOne, dataSourceTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          // TODO: platform

          switch (orderBy) {
            // case DataSourcesOrderBy.Type:
            //   return getSecretSyncDestinationColValues(dataSourceOne)
            //     .primaryText.toLowerCase()
            //     .localeCompare(
            //       getSecretSyncDestinationColValues(dataSourceTwo).primaryText.toLowerCase()
            //     );
            // case DataSourcesOrderBy.Status:
            //   if (!syncOne.syncStatus && syncTwo.syncStatus) return 1;
            //   if (syncOne.syncStatus && !syncTwo.syncStatus) return -1;
            //   if (!syncOne.syncStatus && !syncTwo.syncStatus) return 0;

            //   return (
            //     getSyncStatusOrderValue(syncOne.syncStatus) -
            //     getSyncStatusOrderValue(syncTwo.syncStatus)
            //   );
            case DataSourcesOrderBy.Name:
            default:
              return dataSourceOne.name
                .toLowerCase()
                .localeCompare(dataSourceTwo.name.toLowerCase());
          }
        }),
    [dataSources, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredDataSources.length,
    offset,
    setPage
  });

  const handleSort = (column: DataSourcesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: DataSourcesOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: DataSourcesOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.types.length);

  const handleDelete = (dataSource: TSecretScanningDataSource) =>
    handlePopUpOpen("deleteDataSource", dataSource);

  const handleEdit = (dataSource: TSecretScanningDataSource) =>
    handlePopUpOpen("editDataSource", dataSource);

  const handleToggleEnableAutoScan = async (dataSource: TSecretScanningDataSource) => {
    const destinationName = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name;

    const isAutoScanEnabled = !dataSource.isAutoScanEnabled;

    try {
      await updateDataSource.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        isAutoScanEnabled,
        projectId: dataSource.projectId
      });

      createNotification({
        text: `Successfully ${isAutoScanEnabled ? "enabled" : "disabled"} auto-scan for ${destinationName} Data Source`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to ${isAutoScanEnabled ? "enable" : "disable"} auto-scan for ${destinationName} Data Source`,
        type: "error"
      });
    }
  };

  const handleTriggerScan = async (dataSource: TSecretScanningDataSource) => {
    try {
      await triggerDataSourceScan.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId
      });

      createNotification({
        text: "Successfully triggered scan",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to trigger scan",
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
          placeholder="Search data sources..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter data sources"
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
            {/* {[SecretSyncStatus.Running, SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].map(
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
            )} */}
            <DropdownMenuLabel>Platform</DropdownMenuLabel>
            {dataSources.length ? (
              [...new Set(dataSources.map(({ type }) => type))].map((type) => {
                const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        types: prev.types.includes(type)
                          ? prev.types.filter((a) => a !== type)
                          : [...prev.types, type]
                      }));
                    }}
                    key={type}
                    icon={
                      filters.types.includes(type) && (
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
              <DropdownMenuItem isDisabled>No Data Sources Configured</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-40">Platform</Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.Status)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.Status)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.Status)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-60">
                <div className="flex items-center">
                  Last Scanned
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.Type)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.Type)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.Type)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Scan Status
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.Type)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.Type)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.Type)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredDataSources.slice(offset, perPage * page).map((dataSource) => (
              <DataSourceRow
                key={dataSource.id}
                dataSource={dataSource}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onTriggerScan={handleTriggerScan}
                onToggleEnableAutoScan={handleToggleEnableAutoScan}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredDataSources.length) && (
          <Pagination
            count={filteredDataSources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!filteredDataSources?.length && (
          <EmptyState
            title={
              dataSources.length
                ? "No data sources match search..."
                : "This project has no data sources configured"
            }
            icon={dataSources.length ? faSearch : faRotate}
          />
        )}
      </TableContainer>
      <DeleteSecretScanningDataSourceModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteDataSource", isOpen)}
        isOpen={popUp.deleteDataSource.isOpen}
        dataSource={popUp.deleteDataSource.data}
      />
      <EditSecretScanningDataSourceModal
        onOpenChange={(isOpen) => handlePopUpToggle("editDataSource", isOpen)}
        isOpen={popUp.editDataSource.isOpen}
        dataSource={popUp.editDataSource.data}
      />
    </div>
  );
};
