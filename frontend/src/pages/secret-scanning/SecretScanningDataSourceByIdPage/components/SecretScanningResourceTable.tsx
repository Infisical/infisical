import { useMemo } from "react";
import { ChevronDownIcon, FolderGitIcon, LockIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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
  TableRow,
  type TableSortDirection
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  canAddSecretScanningResources,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";

import { AddSecretScanningResourcesButton } from "./AddSecretScanningResourcesButton";
import { SecretScanningResourceRow } from "./SecretScanningResourceRow";

enum ResourcesOrderBy {
  Name = "name",
  Findings = "findings",
  LastScanned = "last-scanned"
}

const SKELETON_ROWS = ["first", "second", "third"];
const SKELETON_CELLS = ["name", "status", "last-scan", "actions"];

const sortResources = (
  a: TSecretScanningResourceWithDetails,
  b: TSecretScanningResourceWithDetails,
  orderBy: ResourcesOrderBy
) => {
  switch (orderBy) {
    case ResourcesOrderBy.Findings:
      if (a.unresolvedFindings === 0 && a.lastScanStatus === SecretScanningScanStatus.Failed)
        return 1;
      if (b.unresolvedFindings === 0 && b.lastScanStatus === SecretScanningScanStatus.Failed)
        return -1;

      return b.unresolvedFindings - a.unresolvedFindings;
    case ResourcesOrderBy.LastScanned:
      if (!a.lastScannedAt && !b.lastScannedAt) return 0;
      if (!a.lastScannedAt) return 1;
      if (!b.lastScannedAt) return -1;

      return new Date(b.lastScannedAt).getTime() - new Date(a.lastScannedAt).getTime();
    case ResourcesOrderBy.Name:
    default:
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
};

type Props = {
  dataSource: TSecretScanningDataSource;
  onViewFindings: (resourceId: string) => void;
};

export const SecretScanningResourcesTable = ({ dataSource, onViewFindings }: Props) => {
  const { permission } = useProjectPermission();

  const canReadResources = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadResources,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { data: resources = [], isPending } = useListSecretScanningResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadResources
    }
  );
  const isLoading = canReadResources && isPending;

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
  } = usePagination<ResourcesOrderBy>(ResourcesOrderBy.Name, { initPerPage: 20 });

  const filteredResources = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return resources
      .filter(({ name }) => name.toLowerCase().includes(searchValue))
      .sort((a, b) =>
        orderDirection === OrderByDirection.ASC
          ? sortResources(a, b, orderBy)
          : sortResources(b, a, orderBy)
      );
  }, [resources, orderDirection, search, orderBy]);

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const handleSortChange = (column: ResourcesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getSortDirection = (column: ResourcesOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const renderSortableHead = (column: ResourcesOrderBy, label: string, className?: string) => {
    const direction = getSortDirection(column);
    return (
      <TableHead
        className={className}
        sortDirection={direction}
        onSortChange={() => handleSortChange(column)}
      >
        {label}
        <ChevronDownIcon
          className={twMerge(
            "transition-transform",
            direction === "descending" && "rotate-180",
            direction === "none" && "opacity-30"
          )}
        />
      </TableHead>
    );
  };

  const renderEmpty = () => {
    if (!canReadResources) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>Access restricted</EmptyTitle>
            <EmptyDescription>
              You don&apos;t have permission to view this data source&apos;s{" "}
              {resourceDetails.pluralNoun}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (resources.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No {resourceDetails.pluralNoun} match your filters</EmptyTitle>
            <EmptyDescription>Try a different search term or status filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGitIcon />
          </EmptyMedia>
          <EmptyTitle>No {resourceDetails.pluralNoun} yet</EmptyTitle>
          <EmptyDescription>
            Add a {resourceDetails.singularNoun} to start scanning it for secrets.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  };

  const canAddResources = canAddSecretScanningResources(dataSource);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{resourceDetails.pluralTitle}</CardTitle>
        <CardDescription>
          {resourceDetails.pluralTitle} in this{" "}
          {SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name} data source. Select one to see its
          findings.
        </CardDescription>
        {canAddResources && (
          <CardAction>
            <AddSecretScanningResourcesButton dataSource={dataSource} />
          </CardAction>
        )}
        <div className="col-span-full flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${resourceDetails.pluralNoun}...`}
            />
          </InputGroup>
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && !filteredResources.length ? (
          renderEmpty()
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {renderSortableHead(ResourcesOrderBy.Name, resourceDetails.singularTitle, "w-1/2")}
                {renderSortableHead(ResourcesOrderBy.Findings, "Status")}
                {renderSortableHead(ResourcesOrderBy.LastScanned, "Last Scan")}
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                SKELETON_ROWS.map((row) => (
                  <TableRow key={`resource-skeleton-${row}`}>
                    {SKELETON_CELLS.map((cell) => (
                      <TableCell key={`resource-skeleton-${row}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading &&
                filteredResources
                  .slice(offset, perPage * page)
                  .map((resource) => (
                    <SecretScanningResourceRow
                      key={resource.id}
                      resource={resource}
                      dataSource={dataSource}
                      onViewFindings={onViewFindings}
                    />
                  ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && Boolean(filteredResources.length) && (
          <Pagination
            count={filteredResources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </CardContent>
    </Card>
  );
};
