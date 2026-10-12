import { ReactNode, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDownIcon, FilterIcon, ShieldCheckIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Pagination,
  ProviderIcon,
  SelectedActionBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection
} from "@app/components/v3";
import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_MAP,
  SECRET_SCANNING_FINDING_STATUS_ORDER
} from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  SecretScanningFindingStatus,
  TSecretScanningDataSource,
  TSecretScanningFinding,
  useUpdateMultipleSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

import { FindingDetailSheet } from "./FindingDetailSheet";
import { FindingStatusBadge } from "./FindingStatusBadge";
import { FindingStatusDialog } from "./FindingStatusDialog";

export type FindingsStatusFilter = SecretScanningFindingStatus | "all";

enum FindingsOrderBy {
  Rule = "rule",
  Resource = "resource",
  Author = "author",
  Detected = "detected",
  Status = "status"
}

type TSort = { column: FindingsOrderBy; direction: Exclude<TableSortDirection, "none"> };

const DEFAULT_SORT: TSort = { column: FindingsOrderBy.Detected, direction: "descending" };

const ALL_OPTION = "all";

const compareFindings = (
  a: TSecretScanningFinding,
  b: TSecretScanningFinding,
  column: FindingsOrderBy
) => {
  switch (column) {
    case FindingsOrderBy.Rule:
      return a.rule.localeCompare(b.rule);
    case FindingsOrderBy.Resource:
      return a.resourceName.localeCompare(b.resourceName);
    case FindingsOrderBy.Author:
      return (a.details.author ?? "").localeCompare(b.details.author ?? "");
    case FindingsOrderBy.Status:
      return (
        SECRET_SCANNING_FINDING_STATUS_ORDER.indexOf(a.status) -
        SECRET_SCANNING_FINDING_STATUS_ORDER.indexOf(b.status)
      );
    case FindingsOrderBy.Detected:
    default:
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
};

const countBy = <T extends string>(
  items: TSecretScanningFinding[],
  key: (f: TSecretScanningFinding) => T
) =>
  items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

type Props = {
  findings: TSecretScanningFinding[];
  isPending: boolean;
  dataSource?: TSecretScanningDataSource;
  initialStatus?: FindingsStatusFilter;
  initialDataSourceId?: string;
  initialResourceId?: string;
  cardHeader?: ReactNode;
};

export const SecretScanningFindingsTable = ({
  findings,
  isPending,
  dataSource,
  initialStatus = SecretScanningFindingStatus.Unresolved,
  initialDataSourceId,
  initialResourceId,
  cardHeader
}: Props) => {
  const isScoped = Boolean(dataSource);

  const [statusFilter, setStatusFilter] = useState<FindingsStatusFilter>(initialStatus);
  const [dataSourceFilter, setDataSourceFilter] = useState<string | null>(
    initialDataSourceId ?? null
  );
  const [resourceFilter, setResourceFilter] = useState<string | null>(initialResourceId ?? null);
  const [sort, setSort] = useState<TSort>(DEFAULT_SORT);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);
  const [statusChange, setStatusChange] = useState<{
    findingIds: string[];
    status: SecretScanningFindingStatus;
  } | null>(null);

  const { page, setPage, perPage, setPerPage, offset } = usePagination(FindingsOrderBy.Detected, {
    initPerPage: 20
  });

  const reopenFinding = useUpdateMultipleSecretScanningFinding();

  const scopedFindings = useMemo(
    () => (dataSource ? findings.filter((f) => f.dataSourceId === dataSource.id) : findings),
    [findings, dataSource]
  );

  const dataSourceOptions = useMemo(() => {
    const counts = countBy(scopedFindings, (f) => f.dataSourceId);
    const seen = new Map<string, TSecretScanningFinding>();
    scopedFindings.forEach((f) => {
      if (!seen.has(f.dataSourceId)) seen.set(f.dataSourceId, f);
    });
    return [...seen.values()]
      .map((f) => ({
        id: f.dataSourceId,
        name: f.dataSourceName,
        type: f.dataSourceType,
        count: counts[f.dataSourceId]
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedFindings]);

  const sourceFilteredFindings = useMemo(
    () =>
      dataSourceFilter
        ? scopedFindings.filter((f) => f.dataSourceId === dataSourceFilter)
        : scopedFindings,
    [scopedFindings, dataSourceFilter]
  );

  const resourceOptions = useMemo(() => {
    const counts = countBy(sourceFilteredFindings, (f) => f.resourceId);
    const seen = new Map<string, string>();
    sourceFilteredFindings.forEach((f) => {
      if (!seen.has(f.resourceId)) seen.set(f.resourceId, f.resourceName);
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name, count: counts[id] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sourceFilteredFindings]);

  const inScopeFindings = useMemo(
    () =>
      resourceFilter
        ? sourceFilteredFindings.filter((f) => f.resourceId === resourceFilter)
        : sourceFilteredFindings,
    [sourceFilteredFindings, resourceFilter]
  );

  const statusCounts = useMemo(() => countBy(inScopeFindings, (f) => f.status), [inScopeFindings]);

  const filteredFindings = useMemo(() => {
    const direction = sort.direction === "ascending" ? 1 : -1;
    return inScopeFindings
      .filter((f) => statusFilter === "all" || f.status === statusFilter)
      .sort((a, b) => compareFindings(a, b, sort.column) * direction);
  }, [inScopeFindings, statusFilter, sort]);

  useResetPageHelper({ totalCount: filteredFindings.length, offset, setPage });

  const pageFindings = filteredFindings.slice(offset, offset + perPage);
  const pageIds = pageFindings.map((f) => f.id);
  const selectedFindings = filteredFindings.filter((f) => selectedIds.includes(f.id));
  const isPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const openFinding = findings.find((f) => f.id === openFindingId);
  const openIndex = openFindingId ? filteredFindings.findIndex((f) => f.id === openFindingId) : -1;

  const resourceLabel = dataSource
    ? RESOURCE_DESCRIPTION_HELPER[dataSource.type].singularTitle
    : "Resource";
  const selectedResourceName = resourceOptions.find((r) => r.id === resourceFilter)?.name;
  const selectedDataSourceName = dataSourceOptions.find((d) => d.id === dataSourceFilter)?.name;

  const resetSelection = () => setSelectedIds([]);

  const handleSortChange = (column: FindingsOrderBy, direction: TableSortDirection) => {
    setSort(direction === "none" ? DEFAULT_SORT : { column, direction });
  };

  const getSortDirection = (column: FindingsOrderBy): TableSortDirection =>
    sort.column === column ? sort.direction : "none";

  const getSortIconClassName = (column: FindingsOrderBy) =>
    twMerge(
      "transition-transform",
      getSortDirection(column) === "descending" && "rotate-180",
      getSortDirection(column) === "none" && "opacity-30"
    );

  const handleChangeStatus = (
    targetFindings: TSecretScanningFinding[],
    status: SecretScanningFindingStatus
  ) => {
    if (status !== SecretScanningFindingStatus.Unresolved) {
      setStatusChange({ findingIds: targetFindings.map((f) => f.id), status });
      return;
    }

    reopenFinding.mutate(
      targetFindings.map((f) => ({ findingId: f.id, projectId: f.projectId, status })),
      {
        onSuccess: () =>
          createNotification({
            type: "success",
            text:
              targetFindings.length === 1
                ? "Finding reopened"
                : `${targetFindings.length} findings reopened`
          })
      }
    );
  };

  const renderSortableHead = (column: FindingsOrderBy, label: string, className?: string) => (
    <TableHead
      className={className}
      sortDirection={getSortDirection(column)}
      onSortChange={(direction) => handleSortChange(column, direction)}
    >
      {label}
      <ChevronDownIcon className={getSortIconClassName(column)} />
    </TableHead>
  );

  const renderEmpty = () => {
    if (!scopedFindings.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>No secret leaks found</EmptyTitle>
            <EmptyDescription>
              {isScoped
                ? "Findings appear here when a scan of this data source detects a secret."
                : "Findings appear here when a scan detects a secret."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    const statusName =
      statusFilter === "all"
        ? ""
        : `${SECRET_SCANNING_FINDING_STATUS_MAP[statusFilter].name.toLowerCase()} `;
    const scopeName = selectedResourceName ?? selectedDataSourceName;

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheckIcon />
          </EmptyMedia>
          <EmptyTitle>
            No {statusName}findings{scopeName ? ` in ${scopeName}` : ""}
          </EmptyTitle>
        </EmptyHeader>
        {statusFilter !== "all" && (
          <EmptyContent>
            <Button variant="outline" size="xs" onClick={() => setStatusFilter("all")}>
              Show All Statuses
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  };

  const showEmpty = !isPending && filteredFindings.length === 0;

  return (
    <>
      <Card>
        {cardHeader}
        <CardContent className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <FilterIcon />
                Status:{" "}
                {statusFilter === "all"
                  ? "All"
                  : SECRET_SCANNING_FINDING_STATUS_MAP[statusFilter].name}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuRadioGroup
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as FindingsStatusFilter);
                  resetSelection();
                }}
              >
                {SECRET_SCANNING_FINDING_STATUS_ORDER.map((status) => {
                  const { Icon, className, name } = SECRET_SCANNING_FINDING_STATUS_MAP[status];
                  return (
                    <DropdownMenuRadioItem key={status} value={status}>
                      <Icon className={className} />
                      {name}
                      <DropdownMenuShortcut>{statusCounts[status] ?? 0}</DropdownMenuShortcut>
                    </DropdownMenuRadioItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value="all">
                  All
                  <DropdownMenuShortcut>{inScopeFindings.length}</DropdownMenuShortcut>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {!isScoped && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Data Source: {selectedDataSourceName ?? "All"}
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-80 thin-scrollbar min-w-64 overflow-y-auto"
              >
                <DropdownMenuRadioGroup
                  value={dataSourceFilter ?? ALL_OPTION}
                  onValueChange={(value) => {
                    setDataSourceFilter(value === ALL_OPTION ? null : value);
                    setResourceFilter(null);
                    resetSelection();
                  }}
                >
                  <DropdownMenuRadioItem value={ALL_OPTION}>
                    All Data Sources
                    <DropdownMenuShortcut>{scopedFindings.length}</DropdownMenuShortcut>
                  </DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  {dataSourceOptions.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      <ProviderIcon
                        alt={`${SECRET_SCANNING_DATA_SOURCE_MAP[option.type].name} data source`}
                        icon={SECRET_SCANNING_DATA_SOURCE_MAP[option.type].image}
                        className="size-4"
                      />
                      <span className="truncate">{option.name}</span>
                      <DropdownMenuShortcut>{option.count}</DropdownMenuShortcut>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {resourceLabel}: {selectedResourceName ?? "All"}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-80 thin-scrollbar min-w-64 overflow-y-auto"
            >
              <DropdownMenuRadioGroup
                value={resourceFilter ?? ALL_OPTION}
                onValueChange={(value) => {
                  setResourceFilter(value === ALL_OPTION ? null : value);
                  resetSelection();
                }}
              >
                <DropdownMenuRadioItem value={ALL_OPTION}>
                  All{" "}
                  {dataSource
                    ? RESOURCE_DESCRIPTION_HELPER[dataSource.type].pluralTitle
                    : "Resources"}
                  <DropdownMenuShortcut>{sourceFilteredFindings.length}</DropdownMenuShortcut>
                </DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                {resourceOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    <span className="truncate font-mono">{option.name}</span>
                    <DropdownMenuShortcut>{option.count}</DropdownMenuShortcut>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>

        {showEmpty ? (
          <CardContent>{renderEmpty()}</CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0">
                  <Checkbox
                    aria-label="Select all findings on this page"
                    isChecked={isPageSelected}
                    isDisabled={isPending || !pageIds.length}
                    onCheckedChange={() =>
                      setSelectedIds((prev) =>
                        isPageSelected
                          ? prev.filter((id) => !pageIds.includes(id))
                          : [...new Set([...prev, ...pageIds])]
                      )
                    }
                  />
                </TableHead>
                {renderSortableHead(FindingsOrderBy.Rule, "Rule")}
                {renderSortableHead(FindingsOrderBy.Resource, resourceLabel)}
                {renderSortableHead(FindingsOrderBy.Author, "Author")}
                {renderSortableHead(FindingsOrderBy.Detected, "Detected", "w-36")}
                {renderSortableHead(FindingsOrderBy.Status, "Status", "w-36")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`finding-skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={`finding-skeleton-cell-${j + 1}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                pageFindings.map((finding) => {
                  const isSelected = selectedIds.includes(finding.id);
                  const source = SECRET_SCANNING_DATA_SOURCE_MAP[finding.dataSourceType];

                  return (
                    <TableRow
                      key={finding.id}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={() => setOpenFindingId(finding.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select finding ${finding.rule}`}
                          isChecked={isSelected}
                          onCheckedChange={() =>
                            setSelectedIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== finding.id)
                                : [...prev, finding.id]
                            )
                          }
                        />
                      </TableCell>
                      <TableCell isTruncatable className="h-auto py-2">
                        <p className="truncate font-mono">{finding.rule}</p>
                        <p className="truncate font-mono text-xs text-muted">
                          {finding.details.file}:{finding.details.startLine}
                        </p>
                      </TableCell>
                      <TableCell isTruncatable className="h-auto py-2">
                        <p className="truncate font-mono">{finding.resourceName}</p>
                        {!isScoped && (
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                            <ProviderIcon
                              alt={`${source.name} data source`}
                              icon={source.image}
                              className="size-3.5"
                            />
                            {finding.dataSourceName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell isTruncatable>{finding.details.author}</TableCell>
                      <TableCell>
                        {formatDistanceToNowStrict(new Date(finding.createdAt), {
                          addSuffix: true
                        })}
                      </TableCell>
                      <TableCell>
                        <FindingStatusBadge status={finding.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}

        {!isPending && filteredFindings.length > 0 && (
          <CardContent className="-mt-5 pt-0">
            <Pagination
              count={filteredFindings.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
              }}
            />
          </CardContent>
        )}
      </Card>

      <SelectedActionBar
        selectedCount={selectedFindings.length}
        selectionLabel={`${selectedFindings.length} ${selectedFindings.length === 1 ? "Finding" : "Findings"} Selected`}
        onClearSelection={resetSelection}
      >
        <ProjectPermissionCan
          I={ProjectPermissionSecretScanningFindingActions.Update}
          a={ProjectPermissionSub.SecretScanningFindings}
        >
          {(isAllowed) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="project" size="xs" isDisabled={!isAllowed}>
                  Set Status
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SECRET_SCANNING_FINDING_STATUS_ORDER.map((status) => {
                  const { Icon, className, name } = SECRET_SCANNING_FINDING_STATUS_MAP[status];
                  return (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleChangeStatus(selectedFindings, status)}
                    >
                      <Icon className={className} />
                      {name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ProjectPermissionCan>
      </SelectedActionBar>

      <FindingDetailSheet
        finding={openFinding}
        position={openIndex >= 0 ? { index: openIndex, total: filteredFindings.length } : null}
        onClose={() => setOpenFindingId(null)}
        onPrevious={() => {
          if (openIndex > 0) setOpenFindingId(filteredFindings[openIndex - 1].id);
        }}
        onNext={() => {
          if (openIndex >= 0 && openIndex < filteredFindings.length - 1)
            setOpenFindingId(filteredFindings[openIndex + 1].id);
        }}
        onChangeStatus={(status) => openFinding && handleChangeStatus([openFinding], status)}
        isReopening={reopenFinding.isPending}
      />

      <FindingStatusDialog
        findings={findings.filter((f) => statusChange?.findingIds.includes(f.id))}
        status={statusChange?.status ?? null}
        onOpenChange={(isOpen) => !isOpen && setStatusChange(null)}
        onComplete={resetSelection}
      />
    </>
  );
};
