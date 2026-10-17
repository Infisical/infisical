import { useMemo } from "react";
import { ChevronDownIcon, HistoryIcon, LockIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Card,
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
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  TSecretScanningDataSource,
  TSecretScanningScanWithDetails,
  useListSecretScanningScans
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningScanRow } from "./SecretScanningScanRow";

enum ScansOrderBy {
  ResourceName = "resource-name",
  Findings = "findings",
  Started = "started"
}

const SKELETON_ROWS = ["first", "second", "third"];
const SKELETON_CELLS = ["resource", "started", "duration", "findings", "status", "actions"];

const sortScans = (
  a: TSecretScanningScanWithDetails,
  b: TSecretScanningScanWithDetails,
  orderBy: ScansOrderBy
) => {
  switch (orderBy) {
    case ScansOrderBy.Findings:
      return (
        b.unresolvedFindings + b.resolvedFindings - (a.unresolvedFindings + a.resolvedFindings)
      );
    case ScansOrderBy.ResourceName:
      return a.resourceName.toLowerCase().localeCompare(b.resourceName.toLowerCase());
    case ScansOrderBy.Started:
    default:
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
};

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningScanTable = ({ dataSource }: Props) => {
  const { permission } = useProjectPermission();

  const canReadScans = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadScans,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { data: scans = [], isPending } = useListSecretScanningScans(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadScans
    }
  );
  const isLoading = canReadScans && isPending;

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
  } = usePagination<ScansOrderBy>(ScansOrderBy.Started, {
    initPerPage: 20
  });

  const filteredScans = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    // sortScans orders by the natural direction of each column (newest, most findings, A-Z first)
    return scans
      .filter(({ resourceName }) => resourceName.toLowerCase().includes(searchValue))
      .sort((a, b) =>
        orderDirection === OrderByDirection.ASC
          ? sortScans(a, b, orderBy)
          : sortScans(b, a, orderBy)
      );
  }, [scans, orderDirection, search, orderBy]);

  useResetPageHelper({
    totalCount: filteredScans.length,
    offset,
    setPage
  });

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const handleSortChange = (column: ScansOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getSortDirection = (column: ScansOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const renderSortableHead = (column: ScansOrderBy, label: string, className?: string) => {
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
    if (!canReadScans) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>Access restricted</EmptyTitle>
            <EmptyDescription>
              You don&apos;t have permission to view this data source&apos;s scans.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (scans.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No scans match your search</EmptyTitle>
            <EmptyDescription>
              Try a different {resourceDetails.singularNoun} name.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No scans yet</EmptyTitle>
          <EmptyDescription>
            Scans appear here when a {resourceDetails.singularNoun} is scanned.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan History</CardTitle>
        <CardDescription>
          When each {resourceDetails.singularNoun} was scanned and what the scan found.
        </CardDescription>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search by ${resourceDetails.singularNoun}...`}
          />
        </InputGroup>
      </CardHeader>
      <CardContent>
        {!isLoading && !filteredScans.length ? (
          renderEmpty()
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {renderSortableHead(
                  ScansOrderBy.ResourceName,
                  resourceDetails.singularTitle,
                  "w-1/3"
                )}
                {renderSortableHead(ScansOrderBy.Started, "Started")}
                <TableHead>Duration</TableHead>
                {renderSortableHead(ScansOrderBy.Findings, "New Findings")}
                <TableHead>Status</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                SKELETON_ROWS.map((row) => (
                  <TableRow key={`scan-skeleton-${row}`}>
                    {SKELETON_CELLS.map((cell) => (
                      <TableCell key={`scan-skeleton-${row}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading &&
                filteredScans
                  .slice(offset, perPage * page)
                  .map((scan) => <SecretScanningScanRow key={scan.id} scan={scan} />)}
            </TableBody>
          </Table>
        )}
        {!isLoading && Boolean(filteredScans.length) && (
          <Pagination
            count={filteredScans.length}
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
