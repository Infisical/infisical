import { useMemo, useState } from "react";
import { BoxesIcon, ChevronDownIcon, FilterIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { EditSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { DeleteSecretScanningDataSourceModal } from "@app/components/secret-scanning/DeleteSecretScanningDataSourceModal";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  ProviderIcon,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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

  const getSortDirection = (col: DataSourcesOrderBy) => {
    if (orderBy !== col) return "none" as const;
    return orderDirection === OrderByDirection.ASC
      ? ("ascending" as const)
      : ("descending" as const);
  };

  const getSortIconClassName = (col: DataSourcesOrderBy) =>
    twMerge(
      "transition-transform",
      orderDirection === OrderByDirection.DESC && orderBy === col && "rotate-180",
      orderBy !== col && "opacity-30"
    );

  const isTableFiltered = Boolean(filters.types.length);

  const handleDelete = (dataSource: TSecretScanningDataSource) =>
    handlePopUpOpen("deleteDataSource", dataSource);

  const handleEdit = (dataSource: TSecretScanningDataSource) =>
    handlePopUpOpen("editDataSource", dataSource);

  const handleToggleEnableAutoScan = async (dataSource: TSecretScanningDataSource) => {
    const destinationName = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name;

    const isAutoScanEnabled = !dataSource.isAutoScanEnabled;

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
  };

  const handleTriggerScan = async (dataSource: TSecretScanningDataSource) => {
    await triggerDataSourceScan.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId
    });

    createNotification({
      text: "Successfully triggered scan",
      type: "success"
    });
  };

  return (
    <div>
      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search data sources..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Filter data sources"
              variant={isTableFiltered ? "project" : "outline"}
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Platform</DropdownMenuLabel>
            {dataSources.length ? (
              [...new Set(dataSources.map(({ type }) => type))].map((type) => {
                const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

                return (
                  <DropdownMenuCheckboxItem
                    checked={filters.types.includes(type)}
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
                  >
                    <ProviderIcon alt={`${name} integration`} icon={image} className="h-4 w-4" />
                    {name}
                  </DropdownMenuCheckboxItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Data Sources Configured</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        {filteredDataSources.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">Platform</TableHead>
                  <TableHead
                    className="w-1/3"
                    sortDirection={getSortDirection(DataSourcesOrderBy.Name)}
                    onSortChange={() => handleSort(DataSourcesOrderBy.Name)}
                  >
                    Name
                    <ChevronDownIcon className={getSortIconClassName(DataSourcesOrderBy.Name)} />
                  </TableHead>
                  <TableHead
                    className="w-1/3"
                    sortDirection={getSortDirection(DataSourcesOrderBy.Findings)}
                    onSortChange={() => handleSort(DataSourcesOrderBy.Findings)}
                  >
                    Findings
                    <ChevronDownIcon
                      className={getSortIconClassName(DataSourcesOrderBy.Findings)}
                    />
                  </TableHead>
                  <TableHead
                    className="w-1/3"
                    sortDirection={getSortDirection(DataSourcesOrderBy.LastScan)}
                    onSortChange={() => handleSort(DataSourcesOrderBy.LastScan)}
                  >
                    Last Scan
                    <ChevronDownIcon
                      className={getSortIconClassName(DataSourcesOrderBy.LastScan)}
                    />
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
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
              </TableBody>
            </Table>
            <Pagination
              count={filteredDataSources.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          </>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {dataSources.length ? <SearchIcon /> : <BoxesIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {dataSources.length
                  ? "No data sources match search..."
                  : "This project has no data sources configured"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
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
