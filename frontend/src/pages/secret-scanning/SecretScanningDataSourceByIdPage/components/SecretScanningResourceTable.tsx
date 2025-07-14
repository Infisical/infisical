import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faBan,
  faBullseye,
  faCheckCircle,
  faFilter,
  faInfoCircle,
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
  Tooltip,
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
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningResourceRow } from "./SecretScanningResourceRow";

enum ResourcesOrderBy {
  Name = "name",
  Findings = "findings",
  LastScanned = "last-scanned"
}

type Props = {
  dataSource: TSecretScanningDataSource;
};

enum ResourceStatus {
  Active = "active",
  Inactive = "inactive"
}

type ResourceFilters = {
  status: ResourceStatus[];
};

export const SecretScanningResourcesTable = ({ dataSource }: Props) => {
  const { permission } = useProjectPermission();

  const canReadResources = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadResources,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const [filters, setFilters] = useState<ResourceFilters>({
    status: [ResourceStatus.Active]
  });

  const { data: resources = [], isPending: isResourcesPending } = useListSecretScanningResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadResources
    }
  );

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
  } = usePagination<ResourcesOrderBy>(ResourcesOrderBy.Name, { initPerPage: 10 });

  const filteredResources = useMemo(
    () =>
      resources
        .filter((resource) => {
          const { name } = resource;
          const {
            config: { includeRepos }
          } = dataSource;

          // scott: will need to be differentiated by type once other data sources are available
          const isActive = includeRepos.includes("*") || includeRepos.includes(name);

          if (filters.status.length === 1) {
            if (filters.status.includes(ResourceStatus.Active) && !isActive) {
              return false;
            }
            if (filters.status.includes(ResourceStatus.Inactive) && isActive) {
              return false;
            }
          }

          const searchValue = search.trim().toLowerCase();

          return name.toLowerCase().includes(searchValue);
        })
        .sort((a, b) => {
          const [resourceOne, resourceTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case ResourcesOrderBy.Findings:
              if (
                resourceOne.unresolvedFindings === 0 &&
                resourceOne.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return 1;
              if (
                resourceTwo.unresolvedFindings === 0 &&
                resourceTwo.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return -1;

              return resourceTwo.unresolvedFindings - resourceOne.unresolvedFindings;
            case ResourcesOrderBy.LastScanned:
              return (
                new Date(resourceTwo.lastScannedAt).getTime() -
                new Date(resourceOne.lastScannedAt).getTime()
              );
            case ResourcesOrderBy.Name:
            default:
              return resourceOne.name.toLowerCase().localeCompare(resourceTwo.name.toLowerCase());
          }
        }),
    [resources, orderDirection, search, orderBy, filters, dataSource]
  );

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const handleSort = (column: ResourcesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: ResourcesOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: ResourcesOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const isTableFiltered = Boolean(filters.status.length);

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder={`Search ${resourceDetails.pluralNoun}...`}
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
            <DropdownMenuLabel className="flex w-full items-center justify-between">
              Status
              <Tooltip
                content={`Inactive ${resourceDetails.pluralNoun} will not be scanned due to exclusion in Data Source configuration.`}
              >
                <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
              </Tooltip>
            </DropdownMenuLabel>
            {Object.values(ResourceStatus).map((status) => (
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
                    icon={status === ResourceStatus.Active ? faBullseye : faBan}
                    className={
                      status === ResourceStatus.Active ? "text-primary" : "text-mineshaft-400"
                    }
                  />
                  <span className="capitalize">{status.replace("-", " ")}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/2">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4 whitespace-nowrap">
                <div className="flex items-center">
                  Last Scan
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.LastScanned)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.LastScanned)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.LastScanned)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {canReadResources && isResourcesPending && (
              <TableSkeleton columns={4} innerKey="resource" />
            )}
            {filteredResources.slice(offset, perPage * page).map((resource) => (
              <SecretScanningResourceRow
                key={resource.id}
                resource={resource}
                dataSource={dataSource}
              />
            ))}
          </TBody>
        </Table>
        {!canReadResources && (
          <EmptyState
            icon={faBan}
            title={`You do not have permission to view data source ${resourceDetails.pluralNoun}`}
          />
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
        {!isResourcesPending && !filteredResources?.length && (
          <EmptyState
            title={
              resources.length
                ? "No resources match search..."
                : `This data source has no ${resourceDetails.pluralNoun} associated with it.`
            }
            icon={resources.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
    </div>
  );
};
