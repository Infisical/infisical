import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faCubesStacked,
  faFilter,
  faMagnifyingGlass,
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
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningDataSourceWithDetails,
  useTriggerSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourceRow } from "./SecretScanningDataSourceRow";

enum DataSourcesOrderBy {
  Findings = "findings",
  Name = "name",
  LastScan = "last-scan"
}

type DataSourceFilters = {
  types: SecretScanningDataSource[];
};

type Props = {
  dataSources: TSecretScanningDataSourceWithDetails[];
};

export const SecretScanningDataSourcesTable = ({ dataSources }: Props) => {
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

          const searchValue = search.trim().toLowerCase();

          return (
            SECRET_SCANNING_DATA_SOURCE_MAP[type].name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue) ||
            (connection && connection.name.toLowerCase().includes(searchValue))
          );
        })
        .sort((a, b) => {
          const [dataSourceOne, dataSourceTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case DataSourcesOrderBy.LastScan:
              if (dataSourceOne.lastScannedAt === null && dataSourceTwo.lastScannedAt === null)
                return 0;
              if (dataSourceOne.lastScannedAt === null) return 1;
              if (dataSourceTwo.lastScannedAt === null) return -1;

              return (
                new Date(dataSourceTwo.lastScannedAt).getTime() -
                new Date(dataSourceOne.lastScannedAt).getTime()
              );
            case DataSourcesOrderBy.Findings:
              if (
                dataSourceOne.unresolvedFindings === null &&
                dataSourceTwo.unresolvedFindings === null
              )
                return 0;
              if (dataSourceOne.unresolvedFindings === null) return 1;
              if (dataSourceTwo.unresolvedFindings === null) return -1;

              if (
                dataSourceOne.unresolvedFindings === 0 &&
                dataSourceOne.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return 1;
              if (
                dataSourceTwo.unresolvedFindings === 0 &&
                dataSourceTwo.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return -1;

              return dataSourceTwo.unresolvedFindings - dataSourceOne.unresolvedFindings;
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
              <Th className="w-60">Platform</Th>
              <Th className="w-1/3">
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
              <Th className="w-1/3">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Last Scan
                  <IconButton
                    variant="plain"
                    className={getClassName(DataSourcesOrderBy.LastScan)}
                    ariaLabel="sort"
                    onClick={() => handleSort(DataSourcesOrderBy.LastScan)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(DataSourcesOrderBy.LastScan)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredDataSources.slice(offset, perPage * page).map((dataSource) => (
              <SecretScanningDataSourceRow
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
            icon={dataSources.length ? faSearch : faCubesStacked}
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
