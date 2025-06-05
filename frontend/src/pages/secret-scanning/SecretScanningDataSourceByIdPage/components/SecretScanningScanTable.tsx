import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faBan,
  faCheckCircle,
  faExpand,
  faFilter,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

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
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
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

  const getClassName = (col: ScansOrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: ScansOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.resourceNames.length);

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search scans..."
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
            <DropdownMenuLabel>{resourceDetails.pluralTitle}</DropdownMenuLabel>
            {scans.length ? (
              [...new Set(scans.map(({ resourceName }) => resourceName))].map((resourceName) => {
                return (
                  <DropdownMenuItem
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
                    icon={
                      filters.resourceNames.includes(resourceName) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    {resourceName}
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
              <Th className="w-1/4 whitespace-nowrap">
                <div className="flex items-center">
                  Timestamp
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.Timestamp)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.Timestamp)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.Timestamp)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/2">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.ResourceName)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.ResourceName)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.ResourceName)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-20">Type</Th>
              <Th className="w-1/5 whitespace-nowrap">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {canReadScans && isScansPending && <TableSkeleton columns={5} innerKey="resource" />}
            {filteredResources.slice(offset, perPage * page).map((scan) => (
              <SecretScanningScanRow key={scan.id} scan={scan} />
            ))}
          </TBody>
        </Table>
        {!canReadScans && (
          <EmptyState icon={faBan} title="You do not have permission to view data source scans" />
        )}
        {Boolean(filteredResources.length) && (
          <Pagination
            count={filteredResources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isScansPending && !filteredResources?.length && (
          <EmptyState
            title={
              scans.length
                ? "No scans match search..."
                : "This data source has no scans associated with it."
            }
            icon={scans.length ? faSearch : faExpand}
          />
        )}
      </TableContainer>
    </div>
  );
};
