import { useEffect, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuLabel } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Heading, Meta } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { format, formatDistanceToNowStrict } from "date-fns";

import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_MAP
} from "@app/helpers/secretScanningV2";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type {
  TSecretScanningDataSource,
  TSecretScanningFinding,
  TSecretScanningFindingLocation
} from "@app/hooks/api/secretScanningV2/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useProjectPermission } from "../../access/permissions";
import { failed, toast } from "../../access/toast";
import { ShowMoreFooter } from "../../components/show-more-footer";
import { useV4Adapter } from "../../data/adapters";

export type FindingsStatusFilter = SecretScanningFindingStatus | "all";
export type FindingsFilters = {
  status: FindingsStatusFilter;
  dataSourceId?: string;
  resourceId?: string;
};

const NO_UPDATE = "You don't have permission to update findings";

export const statuses: {
  value: SecretScanningFindingStatus;
  label: string;
  tone: BadgeTone;
  action: string;
}[] = [
  {
    value: SecretScanningFindingStatus.Unresolved,
    label: "Unresolved",
    tone: "warn",
    action: "Reopen"
  },
  {
    value: SecretScanningFindingStatus.Resolved,
    label: "Resolved",
    tone: "ok",
    action: "Mark resolved"
  },
  {
    value: SecretScanningFindingStatus.FalsePositive,
    label: "False positive",
    tone: "soft",
    action: "Mark false positive"
  },
  { value: SecretScanningFindingStatus.Ignore, label: "Ignored", tone: "soft", action: "Ignore" }
];
const statusOf = (value: SecretScanningFindingStatus) =>
  statuses.find((item) => item.value === value) ?? statuses[0];
const plural = (count: number) => (count === 1 ? "finding" : "findings");
const relative = (date: string) => formatDistanceToNowStrict(new Date(date), { addSuffix: true });
const formatDate = (date: string) => format(new Date(date), "MMM d, yyyy h:mm a");
const formatRange = (start: number, end: number) =>
  start === end ? `${start}` : `${start}-${end}`;
const locationsLabel = (count: number) => (count === 1 ? "1 location" : `${count} locations`);
const sortable: Record<string, SecretScanningFindingOrderBy> = {
  resource: SecretScanningFindingOrderBy.ResourceName,
  rule: SecretScanningFindingOrderBy.Rule,
  detected: SecretScanningFindingOrderBy.LastDetectedAt,
  status: SecretScanningFindingOrderBy.Status
};

const StatusBadge = ({ status }: { status: SecretScanningFindingStatus }) => (
  <Badge tone={statusOf(status).tone}>{statusOf(status).label}</Badge>
);

const StatusDialog = ({
  findings,
  status,
  onClose,
  onDone
}: {
  findings: TSecretScanningFinding[];
  status: SecretScanningFindingStatus | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateFindings();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const open = Boolean(status && findings.length);

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  const tooLong = comment.trim().length > 1024;
  const label = status ? statusOf(status).label.toLowerCase() : "";
  const bulk = findings.length > 1;

  const submit = async () => {
    if (!status || tooLong) return;
    const triageComment = comment.trim() || null;
    setPending(true);
    try {
      await update.mutateAsync(
        findings.map((finding) => ({
          findingId: finding.id,
          projectId: finding.projectId,
          status,
          triageComment
        }))
      );
    } catch (error) {
      failed(`Failed to update ${plural(findings.length)}`, error);
      return;
    } finally {
      setPending(false);
    }
    toast({
      tone: "ok",
      title: bulk ? `${findings.length} findings marked as ${label}` : `Finding marked as ${label}`
    });
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>
            {bulk ? `Mark ${findings.length} findings as ${label}` : `Mark as ${label}`}
          </DialogTitle>
          {status && (
            <DialogDescription>
              {SECRET_SCANNING_FINDING_STATUS_MAP[status].description}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          id="finding-status"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field
            label="Comment"
            optional
            error={tooLong ? "Comment cannot exceed 1024 characters" : undefined}
            description={
              findings.some((finding) => finding.triageComment)
                ? `Leave blank to remove the current ${bulk ? "comments" : "comment"}.`
                : undefined
            }
          >
            <Textarea
              autoFocus
              rows={3}
              value={comment}
              placeholder="Explain why, such as rotated in the provider and redeployed."
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="finding-status" loading={pending}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LocationDetails = ({ location }: { location: TSecretScanningFindingLocation }) => {
  const { details } = location;
  const position = `${details.file}:${details.startLine}`;
  return (
    <DataList
      variant="props"
      density="compact"
      items={[
        [
          "File",
          <Stack key="file" gap={2}>
            {details.link ? (
              <div>
                <Button asChild variant="link" underline="hover" icon="external">
                  <a href={details.link} target="_blank" rel="noopener noreferrer">
                    <code>{position}</code>
                  </a>
                </Button>
              </div>
            ) : (
              <code>{position}</code>
            )}
            {details.symlinkFile && <Meta mono={false}>Linked from {details.symlinkFile}</Meta>}
          </Stack>
        ],
        [
          "Lines",
          <Stack key="lines" gap={2}>
            <span>{formatRange(details.startLine, details.endLine)}</span>
            <Meta mono={false}>Columns {formatRange(details.startColumn, details.endColumn)}</Meta>
          </Stack>
        ],
        [
          "Commit",
          <Stack key="commit" gap={2}>
            <Meta>{details.commit.slice(0, 7)}</Meta>
            {details.message && <Meta mono={false}>{details.message}</Meta>}
          </Stack>
        ],
        [
          "Author",
          <Stack key="author" gap={2}>
            <span>{details.author}</span>
            {details.email && <Meta mono={false}>{details.email}</Meta>}
          </Stack>
        ],
        ["Committed", details.date ? formatDate(details.date) : "-"],
        ["First found", formatDate(location.createdAt)],
        ["Rule", <code key="rule">{location.rule}</code>],
        ...(details.tags?.length ? ([["Tags", details.tags.join(", ")]] as const) : [])
      ]}
    />
  );
};

const FindingLocations = ({
  findingId,
  locationCount
}: {
  findingId: string;
  locationCount: number;
}) => {
  const { data, isPending, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useV4Adapter("secretScanning").useFindingLocations(findingId);

  const loadedCount = data?.totalCount;
  useEffect(() => {
    if (loadedCount !== undefined && loadedCount !== locationCount) refetch();
  }, [locationCount, loadedCount]);

  return (
    <Stack gap={8}>
      <Heading level={3} size="subsection">
        {locationsLabel(locationCount)}
      </Heading>
      {isPending && <Skeleton height={64} />}
      {Boolean(error) && !data && (
        <Inline gap={8} align="center" justify="between">
          <Meta mono={false}>Could not load the locations.</Meta>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </Inline>
      )}
      {data && (
        <Accordion type="multiple">
          {data.locations.map((location) => (
            <AccordionItem key={location.id} value={location.id}>
              <AccordionTrigger>
                <Inline gap={8} align="center" justify="between">
                  <code>
                    {location.details.file}:{location.details.startLine}
                  </code>
                  <Inline gap={12} wrap={false}>
                    <Meta>{location.details.commit.slice(0, 7)}</Meta>
                    {location.details.date && <Meta>{relative(location.details.date)}</Meta>}
                  </Inline>
                </Inline>
              </AccordionTrigger>
              <AccordionContent>
                <LocationDetails location={location} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {data && hasNextPage && (
        <ShowMoreFooter
          status={`Showing ${data.locations.length.toLocaleString()} of ${data.totalCount.toLocaleString()} locations`}
          loading={isFetchingNextPage}
          onShowMore={() => fetchNextPage()}
        />
      )}
    </Stack>
  );
};

const FindingSheet = ({
  finding,
  position,
  canUpdate,
  reopening,
  onClose,
  onMove,
  onChangeStatus
}: {
  finding: TSecretScanningFinding | null;
  position: { index: number; total: number } | null;
  canUpdate: boolean;
  reopening: boolean;
  onClose: () => void;
  onMove: (offset: number) => void;
  onChangeStatus: (status: SecretScanningFindingStatus) => void;
}) => {
  const reason = canUpdate ? undefined : NO_UPDATE;
  const source = finding ? SECRET_SCANNING_DATA_SOURCE_MAP[finding.dataSourceType] : undefined;
  const { data: locations } = useV4Adapter("secretScanning").useFindingLocations(finding?.id ?? "");
  const latestLocation = locations?.locations[0];
  return (
    <Sheet open={Boolean(finding)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent size="lg" onOpenAutoFocus={(event) => event.preventDefault()}>
        {finding && source && (
          <>
            <SheetHeader>
              <SheetTitle>
                <code>{finding.rule}</code>
              </SheetTitle>
              {latestLocation && (
                <SheetDescription>{latestLocation.details.description}</SheetDescription>
              )}
            </SheetHeader>
            <SheetSubheader>
              <Inline gap={8} align="center" justify="between" wrap={false}>
                <Inline gap={8} align="center" wrap={false}>
                  <ProviderIcon icon={source.image} alt={`${source.name} data source`} size="sm" />
                  <Meta mono={false}>{finding.dataSourceName}</Meta>
                </Inline>
                <Inline gap={4} align="center" wrap={false}>
                  {position && (
                    <Meta mono={false}>
                      {position.index + 1} of {position.total}
                    </Meta>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    icon="arrow-up"
                    iconOnly
                    disabled={!position || position.index === 0}
                    onClick={() => onMove(-1)}
                  >
                    Previous finding
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    icon="arrow-down"
                    iconOnly
                    disabled={!position || position.index >= position.total - 1}
                    onClick={() => onMove(1)}
                  >
                    Next finding
                  </Button>
                </Inline>
              </Inline>
            </SheetSubheader>
            <SheetBody>
              <Stack gap={24}>
                <DataList
                  variant="props"
                  items={[
                    ["Status", <StatusBadge key="status" status={finding.status} />],
                    [
                      RESOURCE_DESCRIPTION_HELPER[finding.dataSourceType].singularTitle,
                      <code key="resource">{finding.resourceName}</code>
                    ],
                    ["Last detected", formatDate(finding.lastDetectedAt)],
                    ["First detected", formatDate(finding.createdAt)],
                    ...(finding.triageComment
                      ? ([["Comment", finding.triageComment]] as const)
                      : [])
                  ]}
                />
                <FindingLocations findingId={finding.id} locationCount={finding.locationCount} />
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} align="center" justify="end">
                {finding.status === SecretScanningFindingStatus.Unresolved ? (
                  <Inline gap={8} align="center">
                    <Button
                      variant="ghost"
                      disabledReason={reason}
                      onClick={() => onChangeStatus(SecretScanningFindingStatus.Ignore)}
                    >
                      Ignore
                    </Button>
                    <Button
                      variant="outline"
                      disabledReason={reason}
                      onClick={() => onChangeStatus(SecretScanningFindingStatus.FalsePositive)}
                    >
                      Mark false positive
                    </Button>
                    <Button
                      variant="primary"
                      disabledReason={reason}
                      onClick={() => onChangeStatus(SecretScanningFindingStatus.Resolved)}
                    >
                      Mark resolved
                    </Button>
                  </Inline>
                ) : (
                  <Button
                    variant="outline"
                    disabledReason={reason}
                    loading={reopening}
                    onClick={() => onChangeStatus(SecretScanningFindingStatus.Unresolved)}
                  >
                    Reopen
                  </Button>
                )}
              </Inline>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export const FindingsTable = ({
  projectId,
  scope,
  filters,
  onFiltersChange
}: {
  projectId: string;
  scope?: TSecretScanningDataSource;
  filters: FindingsFilters;
  onFiltersChange: (change: Partial<FindingsFilters>) => void;
}) => {
  const scanning = useV4Adapter("secretScanning");
  const { permission } = useProjectPermission(projectId);
  const canUpdate = permission.can(
    ProjectPermissionSecretScanningFindingActions.Update,
    ProjectPermissionSub.SecretScanningFindings
  );
  const { status } = filters;
  const dataSourceId = scope?.id ?? filters.dataSourceId;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<TSecretScanningFinding | null>(null);
  const [change, setChange] = useState<{
    findings: TSecretScanningFinding[];
    status: SecretScanningFindingStatus;
  } | null>(null);
  const [reopening, setReopening] = useState(false);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "detected",
    direction: "desc"
  });
  const { data, isPending, isPlaceholderData } = scanning.useFindings(
    {
      projectId,
      status: status === "all" ? undefined : status,
      dataSourceId,
      resourceId: filters.resourceId,
      orderBy: sortable[sort.columnId],
      orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
      offset: (page - 1) * pageSize,
      limit: pageSize
    },
    { refetchInterval: 30000 }
  );
  const { data: dataSources = [] } = scanning.useDataSources(projectId);
  const dataSource = scope ?? dataSources.find((item) => item.id === dataSourceId);
  const { data: resources = [] } = scanning.useResources(
    {
      dataSourceId: dataSource?.id ?? "",
      type: dataSource?.type ?? SecretScanningDataSource.GitHub
    },
    { enabled: Boolean(dataSource) }
  );
  const updateFindings = scanning.useUpdateFindings();
  const findings = data?.findings ?? [];
  const totalCount = data?.totalCount ?? 0;
  const openFinding = opened ? (findings.find((item) => item.id === opened.id) ?? opened) : null;
  const openIndex = opened ? findings.findIndex((item) => item.id === opened.id) : -1;
  const resourceTitle = dataSource
    ? RESOURCE_DESCRIPTION_HELPER[dataSource.type].singularTitle
    : "Resource";

  const toolbarFilters = (): FilterBarFilter[] => [
    ...(!scope && filters.dataSourceId
      ? [{ field: "dataSource", values: [filters.dataSourceId] }]
      : []),
    ...(filters.resourceId ? [{ field: "resource", values: [filters.resourceId] }] : [])
  ];
  const [chips, setChips] = useState<FilterBarFilter[]>(toolbarFilters);
  const chipValue = (field: string) => chips.find((chip) => chip.field === field)?.values[0];

  useEffect(() => {
    if (
      chipValue("resource") === filters.resourceId &&
      (scope || chipValue("dataSource") === filters.dataSourceId)
    )
      return;
    setChips(toolbarFilters());
  }, [filters.dataSourceId, filters.resourceId]);

  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const lastPage = Math.max(1, Math.ceil(data.totalCount / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [data, isPlaceholderData, page, pageSize]);

  const resetView = () => {
    setPage(1);
    setSelected([]);
  };
  const refilter = (next: Partial<FindingsFilters>) => {
    onFiltersChange(next);
    resetView();
  };

  const reopen = async (targets: TSecretScanningFinding[]) => {
    const next = SecretScanningFindingStatus.Unresolved;
    setReopening(true);
    try {
      await updateFindings.mutateAsync(
        targets.map((finding) => ({
          findingId: finding.id,
          projectId: finding.projectId,
          status: next
        }))
      );
    } catch (error) {
      failed(`Failed to reopen ${plural(targets.length)}`, error);
      return;
    } finally {
      setReopening(false);
    }
    setOpened((current) =>
      current && targets.some((finding) => finding.id === current.id)
        ? { ...current, status: next }
        : current
    );
    setSelected([]);
    toast({
      tone: "ok",
      title: targets.length === 1 ? "Finding reopened" : `${targets.length} findings reopened`
    });
  };
  const changeStatus = (targets: TSecretScanningFinding[], next: SecretScanningFindingStatus) => {
    if (next === SecretScanningFindingStatus.Unresolved) {
      reopen(targets);
      return;
    }
    setChange({ findings: targets, status: next });
  };
  const selectedFindings = findings.filter((finding) => selected.includes(finding.id));
  const reason = canUpdate ? undefined : NO_UPDATE;

  const columns: DataTableColumn<TSecretScanningFinding>[] = [
    {
      id: "resource",
      header: resourceTitle,
      primary: true,
      sortable: true,
      width: 340,
      maxWidth: 340,
      text: (row) => `${row.resourceName} ${locationsLabel(row.locationCount)}`,
      render: (row) => {
        const source = SECRET_SCANNING_DATA_SOURCE_MAP[row.dataSourceType];
        return (
          <Inline gap={12} align="center" wrap={false}>
            <ProviderIcon
              icon={source.image}
              alt={`${source.name} data source ${row.dataSourceName}`}
              size="sm"
            />
            <Stack gap={0} style={{ minWidth: 0 }}>
              <div>
                <Button variant="link" underline="hover" onClick={() => setOpened(row)}>
                  <code>{row.resourceName}</code>
                </Button>
              </div>
              <Meta mono={false}>{locationsLabel(row.locationCount)}</Meta>
            </Stack>
          </Inline>
        );
      }
    },
    {
      id: "rule",
      header: "Rule",
      sortable: true,
      width: 184,
      render: (row) => <code>{row.rule}</code>
    },
    {
      id: "detected",
      header: "Last detected",
      sortable: true,
      width: 140,
      render: (row) => <Meta mono={false}>{relative(row.lastDetectedAt)}</Meta>
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 136,
      render: (row) => <StatusBadge status={row.status} />
    }
  ];

  const statusLabel = status === "all" ? "" : `${statusOf(status).label.toLowerCase()} `;
  const scopeLabel = scope ? "" : (dataSource?.name ?? "");
  const filtered = status !== "all" || Boolean(filters.resourceId) || Boolean(scopeLabel);

  return (
    <>
      <FilterBar
        label="Finding filters"
        fields={[
          ...(scope
            ? []
            : [
                {
                  key: "dataSource",
                  label: "Data source",
                  type: "select" as const,
                  options: dataSources.map((item) => ({ value: item.id, label: item.name }))
                }
              ]),
          ...(dataSource
            ? [
                {
                  key: "resource",
                  label: resourceTitle,
                  type: "select" as const,
                  searchable: true,
                  options: resources.map((item) => ({ value: item.id, label: item.name }))
                }
              ]
            : [])
        ]}
        value={chips}
        onChange={(next) => {
          const nextSource = next.find((chip) => chip.field === "dataSource")?.values[0];
          const sourceChanged = !scope && nextSource !== filters.dataSourceId;
          const kept = sourceChanged ? next.filter((chip) => chip.field !== "resource") : next;
          setChips(kept);
          refilter({
            ...(scope ? {} : { dataSourceId: nextSource }),
            resourceId: kept.find((chip) => chip.field === "resource")?.values[0]
          });
        }}
        actions={
          <div style={{ width: 200 }}>
            <Select
              label="Status"
              options={[
                ...statuses.map((item) => ({ value: item.value, label: item.label })),
                { value: "all", label: "All" }
              ]}
              value={status}
              onChange={(value) => refilter({ status: value as FindingsStatusFilter })}
            />
          </div>
        }
      />
      <DataTable
        filtered={filtered}
        label={`${statusLabel}findings`}
        rows={findings}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => `${row.rule} in ${row.resourceName}`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          resetView();
        }}
        rowActions={{
          menuLabel: "Status actions",
          renderMenu: (row) => (
            <>
              <DropdownMenuLabel>Set status</DropdownMenuLabel>
              {statuses
                .filter((item) => item.value !== row.status)
                .map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    disabledReason={reason}
                    onSelect={() => changeStatus([row], item.value)}
                  >
                    {item.action}
                  </DropdownMenuItem>
                ))}
            </>
          )
        }}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowActivate={(row) => setOpened(row)}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="check-c"
            title={
              filtered
                ? `No ${statusLabel}findings${scopeLabel && !filters.resourceId ? ` in ${scopeLabel}` : ""}`
                : "No secret leaks found"
            }
            actions={
              status !== "all" ? (
                <Button variant="outline" onClick={() => refilter({ status: "all" })}>
                  Show all statuses
                </Button>
              ) : undefined
            }
          />
        }
        pagination={
          totalCount > 0 ? (
            <Pagination
              label="Findings pages"
              variant="compact"
              page={page}
              onPageChange={(next) => {
                setPage(next);
                setSelected([]);
              }}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                resetView();
              }}
            />
          ) : undefined
        }
        actionBar={
          <FloatingActionBar
            count={selected.length}
            total={findings.length}
            onSelectAll={() => setSelected(findings.map((row) => row.id))}
            onClear={() => setSelected([])}
            noun={plural(selected.length)}
            actions={[
              {
                label: "Mark resolved",
                icon: "check-c",
                disabledReason: reason,
                onClick: () => changeStatus(selectedFindings, SecretScanningFindingStatus.Resolved)
              },
              {
                label: "False positive",
                icon: "x",
                disabledReason: reason,
                onClick: () =>
                  changeStatus(selectedFindings, SecretScanningFindingStatus.FalsePositive)
              }
            ]}
            moreActions={[
              {
                label: "Ignore",
                disabledReason: reason,
                onClick: () => changeStatus(selectedFindings, SecretScanningFindingStatus.Ignore)
              },
              {
                label: "Reopen",
                disabledReason: reason,
                onClick: () =>
                  changeStatus(selectedFindings, SecretScanningFindingStatus.Unresolved)
              }
            ]}
          />
        }
      />
      <FindingSheet
        finding={openFinding}
        position={openIndex >= 0 ? { index: openIndex, total: findings.length } : null}
        canUpdate={canUpdate}
        reopening={reopening}
        onClose={() => setOpened(null)}
        onMove={(offset) => {
          const next = findings[openIndex + offset];
          if (next) setOpened(next);
        }}
        onChangeStatus={(next) => openFinding && changeStatus([openFinding], next)}
      />
      <StatusDialog
        findings={change?.findings ?? []}
        status={change?.status ?? null}
        onClose={() => setChange(null)}
        onDone={() => {
          setOpened((current) =>
            current && change?.findings.some((finding) => finding.id === current.id)
              ? null
              : current
          );
          setChange(null);
          setSelected([]);
        }}
      />
    </>
  );
};
