import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDownIcon, FilterIcon, ShieldCheckIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import { useProject } from "@app/context";
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
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus,
  TSecretScanningDataSource,
  TSecretScanningFinding,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningFindings,
  useUpdateMultipleSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

import { FindingDetailSheet } from "./FindingDetailSheet";
import { FindingStatusBadge } from "./FindingStatusBadge";
import { FindingStatusDialog } from "./FindingStatusDialog";

export type FindingsStatusFilter = SecretScanningFindingStatus | "all";

type TSort = { orderBy: SecretScanningFindingOrderBy; orderDirection: OrderByDirection };

const DEFAULT_SORT: TSort = {
  orderBy: SecretScanningFindingOrderBy.CreatedAt,
  orderDirection: OrderByDirection.DESC
};

const ALL_OPTION = "all";

type ResourceFilterProps = {
  dataSource: Pick<TSecretScanningDataSource, "id" | "type">;
  value: string | null;
  onChange: (resourceId: string | null) => void;
};

const ResourceFilter = ({ dataSource, value, onChange }: ResourceFilterProps) => {
  const { data: resources = [], refetch } = useListSecretScanningBasicResources({
    dataSourceId: dataSource.id,
    type: dataSource.type
  });

  const { singularTitle, pluralTitle } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const selectedName = resources.find((r) => r.id === value)?.name;

  return (
    // scans add resources after the fact, so refresh the options whenever the menu opens
    <DropdownMenu onOpenChange={(open) => open && refetch()}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {singularTitle}: {selectedName ?? "All"}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value ?? ALL_OPTION}
          onValueChange={(next) => onChange(next === ALL_OPTION ? null : next)}
        >
          <DropdownMenuRadioItem value={ALL_OPTION}>All {pluralTitle}</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {resources.map((resource) => (
            <DropdownMenuRadioItem key={resource.id} value={resource.id}>
              <span className="truncate">{resource.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

type Props = {
  dataSource?: TSecretScanningDataSource;
  initialStatus?: FindingsStatusFilter;
  initialDataSourceId?: string;
  initialResourceId?: string;
  description: string;
};

export const SecretScanningFindingsTable = ({
  dataSource,
  initialStatus = SecretScanningFindingStatus.Unresolved,
  initialDataSourceId,
  initialResourceId,
  description
}: Props) => {
  const { currentProject } = useProject();
  const isScoped = Boolean(dataSource);

  const [statusFilter, setStatusFilter] = useState<FindingsStatusFilter>(initialStatus);
  const [dataSourceFilter, setDataSourceFilter] = useState<string | null>(
    dataSource?.id ?? initialDataSourceId ?? null
  );
  const [resourceFilter, setResourceFilter] = useState<string | null>(initialResourceId ?? null);
  const [sort, setSort] = useState<TSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // a snapshot keeps the sheet open when reopening moves the finding out of the current filter
  const [openFinding, setOpenFinding] = useState<TSecretScanningFinding | null>(null);
  const [statusChange, setStatusChange] = useState<{
    findings: TSecretScanningFinding[];
    status: SecretScanningFindingStatus;
  } | null>(null);

  const { data, isPending, isPlaceholderData } = useListSecretScanningFindings(
    {
      projectId: currentProject.id,
      status: statusFilter === "all" ? undefined : statusFilter,
      dataSourceId: dataSourceFilter ?? undefined,
      resourceId: resourceFilter ?? undefined,
      ...sort,
      offset: (page - 1) * perPage,
      limit: perPage
    },
    { refetchInterval: 30000 }
  );

  // closing the last findings on a page shrinks the total, which can leave the current page empty
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const lastPage = Math.max(1, Math.ceil(data.totalCount / perPage));
    if (page > lastPage) setPage(lastPage);
  }, [data, isPlaceholderData, page, perPage]);

  const { data: dataSources = [], refetch: refetchDataSources } =
    useListSecretScanningBasicDataSources(currentProject.id, {
      enabled: !isScoped
    });

  const selectedDataSource = dataSource ?? dataSources.find((d) => d.id === dataSourceFilter);

  const reopenFinding = useUpdateMultipleSecretScanningFinding();

  const findings = data?.findings ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageIds = findings.map((f) => f.id);
  const selectedFindings = findings.filter((f) => selectedIds.includes(f.id));
  const isPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const visibleOpenFinding = openFinding
    ? (findings.find((f) => f.id === openFinding.id) ?? openFinding)
    : undefined;
  const openIndex = openFinding ? pageIds.indexOf(openFinding.id) : -1;

  const resourceLabel = selectedDataSource
    ? RESOURCE_DESCRIPTION_HELPER[selectedDataSource.type].singularTitle
    : "Resource";
  const isFiltered =
    statusFilter !== "all" || Boolean(resourceFilter) || (!isScoped && Boolean(dataSourceFilter));

  const resetSelection = () => setSelectedIds([]);

  const applyFilterChange = (change: () => void) => {
    change();
    setPage(1);
    resetSelection();
  };

  // TableHead's none/ascending/descending cycle can't leave the default column's default direction,
  // so clicks toggle direction here instead
  const handleSortChange = (orderBy: SecretScanningFindingOrderBy) =>
    applyFilterChange(() =>
      setSort((prev) => {
        if (prev.orderBy === orderBy) {
          return {
            orderBy,
            orderDirection:
              prev.orderDirection === OrderByDirection.ASC
                ? OrderByDirection.DESC
                : OrderByDirection.ASC
          };
        }
        return {
          orderBy,
          orderDirection:
            orderBy === SecretScanningFindingOrderBy.CreatedAt
              ? OrderByDirection.DESC
              : OrderByDirection.ASC
        };
      })
    );

  const getSortDirection = (orderBy: SecretScanningFindingOrderBy): TableSortDirection => {
    if (sort.orderBy !== orderBy) return "none";
    return sort.orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const renderSortableHead = (
    orderBy: SecretScanningFindingOrderBy,
    label: string,
    className?: string
  ) => {
    const direction = getSortDirection(orderBy);
    return (
      <TableHead
        className={className}
        sortDirection={direction}
        onSortChange={() => handleSortChange(orderBy)}
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

  const reopenFindings = (targetFindings: TSecretScanningFinding[]) => {
    const status = SecretScanningFindingStatus.Unresolved;

    reopenFinding.mutate(
      targetFindings.map((f) => ({ findingId: f.id, projectId: f.projectId, status })),
      {
        onSuccess: () => {
          setOpenFinding((prev) =>
            prev && targetFindings.some((f) => f.id === prev.id) ? { ...prev, status } : prev
          );
          resetSelection();
          createNotification({
            type: "success",
            text:
              targetFindings.length === 1
                ? "Finding reopened"
                : `${targetFindings.length} findings reopened`
          });
        }
      }
    );
  };

  const handleChangeStatus = (
    targetFindings: TSecretScanningFinding[],
    status: SecretScanningFindingStatus
  ) => {
    if (status !== SecretScanningFindingStatus.Unresolved) {
      setStatusChange({ findings: targetFindings, status });
      return;
    }

    reopenFindings(targetFindings);
  };

  const renderEmpty = () => {
    if (!isFiltered) {
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
    const scopeName = !resourceFilter && !isScoped ? selectedDataSource?.name : undefined;

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
            <Button
              variant="outline"
              size="xs"
              onClick={() => applyFilterChange(() => setStatusFilter("all"))}
            >
              Show All Statuses
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  };

  const showEmpty = !isPending && totalCount === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Findings
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/findings" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
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
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(value) =>
                    applyFilterChange(() => setStatusFilter(value as FindingsStatusFilter))
                  }
                >
                  {SECRET_SCANNING_FINDING_STATUS_ORDER.map((status) => {
                    const { Icon, className, name } = SECRET_SCANNING_FINDING_STATUS_MAP[status];
                    return (
                      <DropdownMenuRadioItem key={status} value={status}>
                        <Icon className={className} />
                        {name}
                      </DropdownMenuRadioItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioItem value={ALL_OPTION}>All</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {!isScoped && (
              <DropdownMenu onOpenChange={(open) => open && refetchDataSources()}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Data Source: {selectedDataSource?.name ?? "All"}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={dataSourceFilter ?? ALL_OPTION}
                    onValueChange={(value) =>
                      applyFilterChange(() => {
                        setDataSourceFilter(value === ALL_OPTION ? null : value);
                        setResourceFilter(null);
                      })
                    }
                  >
                    <DropdownMenuRadioItem value={ALL_OPTION}>
                      All Data Sources
                    </DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    {dataSources.map((option) => (
                      <DropdownMenuRadioItem key={option.id} value={option.id}>
                        <ProviderIcon
                          alt={`${SECRET_SCANNING_DATA_SOURCE_MAP[option.type].name} data source`}
                          icon={SECRET_SCANNING_DATA_SOURCE_MAP[option.type].image}
                          className="size-4"
                        />
                        <span className="truncate">{option.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {selectedDataSource && (
              <ResourceFilter
                dataSource={selectedDataSource}
                value={resourceFilter}
                onChange={(value) => applyFilterChange(() => setResourceFilter(value))}
              />
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {showEmpty ? (
            renderEmpty()
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0">
                    <Checkbox
                      aria-label="Select all findings on this page"
                      isChecked={isPageSelected}
                      isDisabled={isPending || isPlaceholderData || !pageIds.length}
                      onCheckedChange={() => setSelectedIds(isPageSelected ? [] : pageIds)}
                    />
                  </TableHead>
                  {renderSortableHead(SecretScanningFindingOrderBy.ResourceName, resourceLabel)}
                  {renderSortableHead(SecretScanningFindingOrderBy.Rule, "Rule")}
                  {renderSortableHead(SecretScanningFindingOrderBy.Author, "Author")}
                  {renderSortableHead(SecretScanningFindingOrderBy.CreatedAt, "Detected", "w-36")}
                  {renderSortableHead(SecretScanningFindingOrderBy.Status, "Status", "w-36")}
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
                  findings.map((finding) => {
                    const isSelected = selectedIds.includes(finding.id);
                    const source = SECRET_SCANNING_DATA_SOURCE_MAP[finding.dataSourceType];

                    return (
                      <TableRow
                        key={finding.id}
                        data-state={isSelected ? "selected" : undefined}
                        onClick={isPlaceholderData ? undefined : () => setOpenFinding(finding)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={`Select finding ${finding.rule}`}
                            isChecked={isSelected}
                            isDisabled={isPlaceholderData}
                            onCheckedChange={() =>
                              setSelectedIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== finding.id)
                                  : [...prev, finding.id]
                              )
                            }
                          />
                        </TableCell>
                        <TableCell isTruncatable>
                          <p className="flex items-center gap-1.5 truncate">
                            {!isScoped && (
                              <ProviderIcon
                                alt={`${source.name} data source ${finding.dataSourceName}`}
                                title={finding.dataSourceName}
                                icon={source.image}
                                className="size-3.5"
                              />
                            )}
                            {finding.resourceName}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {finding.details.file}:{finding.details.startLine}
                          </p>
                        </TableCell>
                        <TableCell isTruncatable>{finding.rule}</TableCell>
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

          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => {
                setPage(newPage);
                resetSelection();
              }}
              onChangePerPage={(newPerPage) => applyFilterChange(() => setPerPage(newPerPage))}
            />
          )}
        </CardContent>
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
                <Button variant="ss" size="xs" isDisabled={!isAllowed || isPlaceholderData}>
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
        finding={visibleOpenFinding}
        position={openIndex >= 0 ? { index: openIndex, total: findings.length } : null}
        onClose={() => setOpenFinding(null)}
        onPrevious={() => {
          if (openIndex > 0) setOpenFinding(findings[openIndex - 1]);
        }}
        onNext={() => {
          if (openIndex >= 0 && openIndex < findings.length - 1)
            setOpenFinding(findings[openIndex + 1]);
        }}
        onChangeStatus={(status) =>
          visibleOpenFinding && handleChangeStatus([visibleOpenFinding], status)
        }
        isReopening={reopenFinding.isPending}
      />

      <FindingStatusDialog
        findings={statusChange?.findings ?? []}
        status={statusChange?.status ?? null}
        onOpenChange={(isOpen) => !isOpen && setStatusChange(null)}
        onComplete={() => {
          setOpenFinding((prev) =>
            prev && statusChange?.findings.some((f) => f.id === prev.id) ? null : prev
          );
          resetSelection();
        }}
      />
    </>
  );
};
