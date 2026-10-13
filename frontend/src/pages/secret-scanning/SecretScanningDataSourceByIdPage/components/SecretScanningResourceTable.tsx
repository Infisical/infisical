import { useMemo, useState } from "react";
import {
  BanIcon,
  ChevronDownIcon,
  FilterIcon,
  InfoIcon,
  SearchIcon,
  TargetIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
  TableSkeletonRows,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

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

          let isActive: boolean;

          switch (dataSource.type) {
            case SecretScanningDataSource.Bitbucket:
            case SecretScanningDataSource.GitHub:
              isActive =
                dataSource.config.includeRepos.includes("*") ||
                dataSource.config.includeRepos.includes(name);
              break;
            case SecretScanningDataSource.GitLab: {
              if (dataSource.config.scope === GitLabDataSourceScope.Project) {
                isActive = true; // always active
              } else {
                isActive =
                  dataSource.config.includeProjects.includes("*") ||
                  dataSource.config.includeProjects.includes(name);
              }
              break;
            }
            default:
              throw new Error("Unhandled Data Source Type: Active Filter");
          }

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

  const getSortDirection = (col: ResourcesOrderBy) => {
    if (orderBy !== col) return "none" as const;
    const sortsLargestFirst =
      col === ResourcesOrderBy.Findings || col === ResourcesOrderBy.LastScanned;
    return (orderDirection === OrderByDirection.ASC) !== sortsLargestFirst
      ? ("ascending" as const)
      : ("descending" as const);
  };

  const getSortIconClassName = (col: ResourcesOrderBy) =>
    twMerge(
      "transition-transform",
      orderDirection === OrderByDirection.DESC && orderBy === col && "rotate-180",
      orderBy !== col && "opacity-30"
    );

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const isTableFiltered = Boolean(filters.status.length);

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
            placeholder={`Search ${resourceDetails.pluralNoun}...`}
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
            <DropdownMenuLabel className="flex w-full items-center justify-between">
              Status
              <Tooltip hoverable delayDuration={50}>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Inactive {resourceDetails.pluralNoun} will not be scanned due to exclusion in Data
                  Source configuration.
                </TooltipContent>
              </Tooltip>
            </DropdownMenuLabel>
            {Object.values(ResourceStatus).map((status) => (
              <DropdownMenuCheckboxItem
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
                key={status}
              >
                {status === ResourceStatus.Active ? (
                  <TargetIcon className="text-project" />
                ) : (
                  <BanIcon className="text-muted" />
                )}
                <span className="capitalize">{status.replace("-", " ")}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        {/* eslint-disable-next-line no-nested-ternary */}
        {!canReadResources ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BanIcon />
              </EmptyMedia>
              <EmptyTitle>
                You do not have permission to view data source {resourceDetails.pluralNoun}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : isResourcesPending || filteredResources.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-1/2"
                    sortDirection={getSortDirection(ResourcesOrderBy.Name)}
                    onSortChange={() => handleSort(ResourcesOrderBy.Name)}
                  >
                    Name
                    <ChevronDownIcon className={getSortIconClassName(ResourcesOrderBy.Name)} />
                  </TableHead>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(ResourcesOrderBy.Findings)}
                    onSortChange={() => handleSort(ResourcesOrderBy.Findings)}
                  >
                    Findings
                    <ChevronDownIcon className={getSortIconClassName(ResourcesOrderBy.Findings)} />
                  </TableHead>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(ResourcesOrderBy.LastScanned)}
                    onSortChange={() => handleSort(ResourcesOrderBy.LastScanned)}
                  >
                    Last Scan
                    <ChevronDownIcon
                      className={getSortIconClassName(ResourcesOrderBy.LastScanned)}
                    />
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isResourcesPending && <TableSkeletonRows columns={4} />}
                {filteredResources.slice(offset, perPage * page).map((resource) => (
                  <SecretScanningResourceRow
                    key={resource.id}
                    resource={resource}
                    dataSource={dataSource}
                  />
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
              {Boolean(resources.length) && (
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
              )}
              <EmptyTitle>
                {resources.length
                  ? "No resources match search..."
                  : `This data source has no ${resourceDetails.pluralNoun} associated with it.`}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
};
