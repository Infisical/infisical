import { useMemo, useState } from "react";
import { BanIcon, ChevronDownIcon, FilterIcon, ScanIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

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
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  useListSecretScanningScans
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningScanRow } from "./SecretScanningScanRow";

enum ScansOrderBy {
  ResourceName = "resource-name",
  Findings = "findings",
  Timestamp = "timestamp",
  Status = "status"
}

type Props = {
  dataSource: TSecretScanningDataSource;
};

type ScanFilters = {
  resourceNames: string[];
};

export const SecretScanningScanTable = ({ dataSource }: Props) => {
  const { permission } = useProjectPermission();

  const canReadScans = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadScans,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { data: scans = [], isPending: isScansPending } = useListSecretScanningScans(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadScans
    }
  );

  const [filters, setFilters] = useState<ScanFilters>({
    resourceNames: []
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
  } = usePagination<ScansOrderBy>(ScansOrderBy.Timestamp, { initPerPage: 10 });

  const filteredResources = useMemo(
    () =>
      scans
        .filter((scan) => {
          const { resourceName } = scan;

          if (filters.resourceNames.length && !filters.resourceNames.includes(resourceName))
            return false;

          const searchValue = search.trim().toLowerCase();

          return resourceName.toLowerCase().includes(searchValue);
        })
        .sort((a, b) => {
          const [scanOne, scanTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case ScansOrderBy.Findings:
              if (
                scanOne.unresolvedFindings === 0 &&
                scanOne.status === SecretScanningScanStatus.Failed
              )
                return 1;
              if (
                scanTwo.unresolvedFindings === 0 &&
                scanTwo.status === SecretScanningScanStatus.Failed
              )
                return -1;

              return scanTwo.unresolvedFindings - scanOne.unresolvedFindings;
            case ScansOrderBy.Timestamp:
              return new Date(scanTwo.createdAt).getTime() - new Date(scanOne.createdAt).getTime();
            case ScansOrderBy.ResourceName:
            default:
              return scanOne.resourceName
                .toLowerCase()
                .localeCompare(scanTwo.resourceName.toLowerCase());
          }
        }),
    [scans, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const handleSort = (column: ScansOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getSortDirection = (col: ScansOrderBy) => {
    if (orderBy !== col) return "none" as const;
    const sortsLargestFirst = col === ScansOrderBy.Findings || col === ScansOrderBy.Timestamp;
    return (orderDirection === OrderByDirection.ASC) !== sortsLargestFirst
      ? ("ascending" as const)
      : ("descending" as const);
  };

  const getSortIconClassName = (col: ScansOrderBy) =>
    twMerge(
      "transition-transform",
      orderDirection === OrderByDirection.DESC && orderBy === col && "rotate-180",
      orderBy !== col && "opacity-30"
    );

  const isTableFiltered = Boolean(filters.resourceNames.length);

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

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
            placeholder="Search scans..."
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
            <DropdownMenuLabel>{resourceDetails.pluralTitle}</DropdownMenuLabel>
            {scans.length ? (
              [...new Set(scans.map(({ resourceName }) => resourceName))].map((resourceName) => {
                return (
                  <DropdownMenuCheckboxItem
                    checked={filters.resourceNames.includes(resourceName)}
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        resourceNames: prev.resourceNames.includes(resourceName)
                          ? prev.resourceNames.filter((a) => a !== resourceName)
                          : [...prev.resourceNames, resourceName]
                      }));
                    }}
                    key={resourceName}
                  >
                    {resourceName}
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
        {/* eslint-disable-next-line no-nested-ternary */}
        {!canReadScans ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BanIcon />
              </EmptyMedia>
              <EmptyTitle>You do not have permission to view data source scans</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : isScansPending || filteredResources.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(ScansOrderBy.Timestamp)}
                    onSortChange={() => handleSort(ScansOrderBy.Timestamp)}
                  >
                    Timestamp
                    <ChevronDownIcon className={getSortIconClassName(ScansOrderBy.Timestamp)} />
                  </TableHead>
                  <TableHead
                    className="w-1/2"
                    sortDirection={getSortDirection(ScansOrderBy.ResourceName)}
                    onSortChange={() => handleSort(ScansOrderBy.ResourceName)}
                  >
                    Name
                    <ChevronDownIcon className={getSortIconClassName(ScansOrderBy.ResourceName)} />
                  </TableHead>
                  <TableHead className="w-20">Type</TableHead>
                  <TableHead
                    className="w-1/5"
                    sortDirection={getSortDirection(ScansOrderBy.Findings)}
                    onSortChange={() => handleSort(ScansOrderBy.Findings)}
                  >
                    Findings
                    <ChevronDownIcon className={getSortIconClassName(ScansOrderBy.Findings)} />
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isScansPending && <TableSkeletonRows columns={5} />}
                {filteredResources.slice(offset, perPage * page).map((scan) => (
                  <SecretScanningScanRow key={scan.id} scan={scan} />
                ))}
              </TableBody>
            </Table>
            {Boolean(filteredResources.length) && (
              <Pagination
                count={filteredResources.length}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={setPerPage}
              />
            )}
          </>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">{scans.length ? <SearchIcon /> : <ScanIcon />}</EmptyMedia>
              <EmptyTitle>
                {scans.length
                  ? "No scans match search..."
                  : "This data source has no scans associated with it."}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
};
