import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Meta } from "@app/components/v4/ui/text";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type {
  TSecretScanningDataSource,
  TSecretScanningFinding
} from "@app/hooks/api/secretScanningV2/types";

import { useV4Adapter } from "../../data/adapters";

const route = "/v4/organizations/$orgId/secret-scanning/findings";

const statuses: {
  value: SecretScanningFindingStatus;
  label: string;
  tone: BadgeTone;
  action: string;
}[] = [
  {
    value: SecretScanningFindingStatus.Unresolved,
    label: "Unresolved",
    tone: "outline",
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
const detected = (finding: TSecretScanningFinding) =>
  formatDistanceToNowStrict(new Date(finding.createdAt), { addSuffix: true });
const sortable: Record<string, SecretScanningFindingOrderBy> = {
  repo: SecretScanningFindingOrderBy.ResourceName,
  rule: SecretScanningFindingOrderBy.Rule,
  author: SecretScanningFindingOrderBy.Author,
  detected: SecretScanningFindingOrderBy.CreatedAt,
  status: SecretScanningFindingOrderBy.Status
};

const ResourceSelect = ({
  dataSource,
  value,
  onChange
}: {
  dataSource: TSecretScanningDataSource;
  value?: string;
  onChange: (value?: string) => void;
}) => {
  const { data: resources = [] } = useV4Adapter("secretScanning").useResources({
    dataSourceId: dataSource.id,
    type: dataSource.type
  });
  const { pluralTitle } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  return (
    <Select
      label={RESOURCE_DESCRIPTION_HELPER[dataSource.type].singularTitle}
      options={[
        { value: "all", label: `All ${pluralTitle}` },
        ...resources.map((resource) => ({ value: resource.id, label: resource.name }))
      ]}
      value={value ?? "all"}
      onChange={(next) => onChange(next === "all" ? undefined : next)}
    />
  );
};

const Findings = ({ projectId }: { projectId: string }) => {
  const navigate = useNavigate({ from: route });
  const search = useSearch({ from: route });
  const status = search.status ?? SecretScanningFindingStatus.Unresolved;
  const scanning = useV4Adapter("secretScanning");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<TSecretScanningFinding | null>(null);
  const [notice, setNotice] = useState("");
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "detected",
    direction: "desc"
  });
  const { data, isPending, isPlaceholderData } = scanning.useFindings({
    projectId,
    status: status === "all" ? undefined : status,
    dataSourceId: search.dataSourceId,
    resourceId: search.resourceId,
    orderBy: sortable[sort.columnId],
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    offset: (page - 1) * pageSize,
    limit: pageSize
  });
  const { data: unresolved = 0 } = scanning.useUnresolvedFindingCount(projectId);
  const { data: dataSources = [] } = scanning.useDataSources(projectId);
  const updateFindings = scanning.useUpdateFindings();
  const findings = data?.findings ?? [];
  const totalCount = data?.totalCount ?? 0;
  const dataSource = dataSources.find((item) => item.id === search.dataSourceId);
  const openFinding = opened ? (findings.find((item) => item.id === opened.id) ?? opened) : null;

  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const lastPage = Math.max(1, Math.ceil(data.totalCount / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [data, isPlaceholderData, page, pageSize]);

  const setStatusFor = async (ids: readonly string[], next: SecretScanningFindingStatus) => {
    await updateFindings.mutateAsync(
      ids.map((findingId) => ({ findingId, projectId, status: next }))
    );
    setOpened((current) =>
      current && ids.includes(current.id) ? { ...current, status: next } : current
    );
    setSelected([]);
    setNotice(
      `${ids.length} ${ids.length === 1 ? "finding" : "findings"} set to ${statusOf(next).label.toLowerCase()}`
    );
  };
  const refilter = (change: Partial<typeof search>) => {
    navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
    setPage(1);
    setSelected([]);
  };

  const columns: DataTableColumn<TSecretScanningFinding>[] = [
    {
      id: "repo",
      header: dataSource ? RESOURCE_DESCRIPTION_HELPER[dataSource.type].singularTitle : "Resource",
      primary: true,
      sortable: true,
      width: 340,
      maxWidth: 340,
      text: (row) => `${row.resourceName} ${row.details.file}:${row.details.startLine}`,
      render: (row) => (
        <Inline gap={12} align="center" wrap={false}>
          <Media icon="git" size="sm" />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <code>{row.resourceName}</code>
            <Meta style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.details.file}:{row.details.startLine}
            </Meta>
          </Stack>
        </Inline>
      )
    },
    {
      id: "rule",
      header: "Rule",
      sortable: true,
      width: 184,
      render: (row) => <code>{row.rule}</code>
    },
    {
      id: "author",
      header: "Author",
      sortable: true,
      grow: true,
      text: (row) => row.details.author,
      render: (row) => row.details.author
    },
    {
      id: "commit",
      header: "Commit",
      width: 96,
      render: (row) => <Meta>{row.details.commit.slice(0, 7)}</Meta>
    },
    {
      id: "detected",
      header: "Detected",
      sortable: true,
      width: 120,
      render: (row) => <Meta mono={false}>{detected(row)}</Meta>
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 136,
      render: (row) => <Badge tone={statusOf(row.status).tone}>{statusOf(row.status).label}</Badge>
    }
  ];

  const statusLabel = status === "all" ? "" : `${statusOf(status).label.toLowerCase()} `;
  const scopeLabel = dataSource?.name ?? "";
  const filtered = status !== "all" || Boolean(search.dataSourceId);

  return (
    <Stack gap={24}>
      <PageHeader
        title="Findings"
        badges={
          unresolved > 0 && (
            <Badge tone="warn" dot>
              {unresolved} need attention
            </Badge>
          )
        }
        description="Secrets detected across every data source. Review and triage leaked secrets."
        tabs={
          <Tabs
            label="Finding status"
            value={status}
            onChange={(value) => refilter({ status: value as SecretScanningFindingStatus | "all" })}
            tabs={[
              ...statuses.map((item) => ({
                value: item.value,
                label: item.label,
                count:
                  item.value === SecretScanningFindingStatus.Unresolved ? unresolved : undefined,
                content: null
              })),
              { value: "all", label: "All", content: null }
            ]}
          />
        }
      />
      <Inline gap={8} align="center">
        <div style={{ width: 240 }}>
          <Select
            label="Data source"
            options={[
              { value: "all", label: "All data sources" },
              ...dataSources.map((item) => ({
                value: item.id,
                label: item.name,
                description: SECRET_SCANNING_DATA_SOURCE_MAP[item.type].name
              }))
            ]}
            value={search.dataSourceId ?? "all"}
            onChange={(value) =>
              refilter({ dataSourceId: value === "all" ? undefined : value, resourceId: undefined })
            }
          />
        </div>
        <div style={{ width: 280 }}>
          {dataSource ? (
            <ResourceSelect
              dataSource={dataSource}
              value={search.resourceId}
              onChange={(resourceId) => refilter({ resourceId })}
            />
          ) : (
            <Select
              label="Repository"
              options={[{ value: "all", label: "All repositories" }]}
              value="all"
              disabled
            />
          )}
        </div>
        <Meta mono={false} role="status">
          {notice || (dataSource ? "" : "Choose a data source to filter by repository")}
        </Meta>
      </Inline>
      <DataTable
        label={`${statusLabel}findings`}
        rows={findings}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => `${row.rule} in ${row.resourceName}`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
          setSelected([]);
        }}
        rowActions={{
          inline: [
            { label: "Open finding", icon: "chev-right", onSelect: (row) => setOpened(row) }
          ],
          menuLabel: "Status actions",
          renderMenu: (row) => (
            <>
              <DropdownMenuLabel>Set status</DropdownMenuLabel>
              {statuses
                .filter((item) => item.value !== row.status)
                .map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    onSelect={() => setStatusFor([row.id], item.value)}
                  >
                    {item.action}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setOpened(row)}>View details</DropdownMenuItem>
            </>
          )
        }}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowActivate={(row) => setOpened(row)}
        footer={
          totalCount > pageSize
            ? undefined
            : `${totalCount} ${statusLabel}${totalCount === 1 ? "finding" : "findings"}${scopeLabel ? ` in ${scopeLabel}` : ` across ${dataSources.length} data sources`}`
        }
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="check-c"
            title={
              filtered
                ? `No ${statusLabel}findings${scopeLabel ? ` in ${scopeLabel}` : ""}`
                : "No secret leaks found"
            }
            description={
              filtered ? undefined : "Findings appear here when a scan detects a secret."
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
                setPage(1);
                setSelected([]);
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
            noun={selected.length === 1 ? "finding" : "findings"}
            actions={[
              {
                label: "Mark resolved",
                icon: "check-c",
                onClick: () => setStatusFor(selected, SecretScanningFindingStatus.Resolved)
              },
              {
                label: "False positive",
                icon: "x",
                onClick: () => setStatusFor(selected, SecretScanningFindingStatus.FalsePositive)
              }
            ]}
            moreActions={[
              {
                label: "Ignore",
                onClick: () => setStatusFor(selected, SecretScanningFindingStatus.Ignore)
              },
              {
                label: "Reopen",
                onClick: () => setStatusFor(selected, SecretScanningFindingStatus.Unresolved)
              }
            ]}
          />
        }
      />
      <Sheet open={Boolean(openFinding)} onOpenChange={(next) => !next && setOpened(null)}>
        <SheetContent size="lg">
          {openFinding && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <code>{openFinding.rule}</code>
                </SheetTitle>
                <SheetDescription>
                  Detected {detected(openFinding)} in {openFinding.resourceName}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <DataList
                  variant="props"
                  items={[
                    [
                      "Status",
                      <Badge key="status" tone={statusOf(openFinding.status).tone}>
                        {statusOf(openFinding.status).label}
                      </Badge>
                    ],
                    [
                      "File",
                      <code key="file">
                        {openFinding.details.file}:{openFinding.details.startLine}
                      </code>
                    ],
                    ["Commit", <Meta key="commit">{openFinding.details.commit}</Meta>],
                    ["Author", openFinding.details.author],
                    [
                      "Data source",
                      `${openFinding.dataSourceName} on ${SECRET_SCANNING_DATA_SOURCE_MAP[openFinding.dataSourceType].name}`
                    ],
                    ["Fingerprint", <Meta key="fingerprint">{openFinding.fingerprint}</Meta>]
                  ]}
                />
              </SheetBody>
              <SheetFooter>
                {openFinding.status === SecretScanningFindingStatus.Unresolved ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setStatusFor([openFinding.id], SecretScanningFindingStatus.FalsePositive)
                      }
                    >
                      Mark false positive
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() =>
                        setStatusFor([openFinding.id], SecretScanningFindingStatus.Resolved)
                      }
                    >
                      Mark resolved
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setStatusFor([openFinding.id], SecretScanningFindingStatus.Unresolved)
                    }
                  >
                    Reopen
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Stack>
  );
};

export const SecretScanningFindingsPage = () => {
  const { orgId } = useParams({ from: route });
  const { data: projectId } = useV4Adapter("secretScanning").useProjectId(orgId);
  if (!projectId) return <Loader size="page" label="Loading findings" />;
  return <Findings projectId={projectId} />;
};
