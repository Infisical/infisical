import { useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type { TSecretScanningDataSourceWithDetails } from "@app/hooks/api/secretScanningV2/types";

import { useV4Adapter } from "../../data/adapters";

const route = "/v4/organizations/$orgId/secret-scanning/data-sources/";

type Sort = { columnId: string; direction: "asc" | "desc" };

const compare = (
  a: TSecretScanningDataSourceWithDetails,
  b: TSecretScanningDataSourceWithDetails,
  columnId: string
) => {
  if (columnId === "lastScan") {
    if (a.lastScannedAt === null && b.lastScannedAt === null) return 0;
    if (a.lastScannedAt === null) return 1;
    if (b.lastScannedAt === null) return -1;
    return new Date(b.lastScannedAt).getTime() - new Date(a.lastScannedAt).getTime();
  }
  if (columnId === "findings") {
    if (a.unresolvedFindings === null && b.unresolvedFindings === null) return 0;
    if (a.unresolvedFindings === null) return 1;
    if (b.unresolvedFindings === null) return -1;
    if (a.unresolvedFindings === 0 && a.lastScanStatus === SecretScanningScanStatus.Failed)
      return 1;
    if (b.unresolvedFindings === 0 && b.lastScanStatus === SecretScanningScanStatus.Failed)
      return -1;
    return b.unresolvedFindings - a.unresolvedFindings;
  }
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
};

const LastScan = ({ dataSource }: { dataSource: TSecretScanningDataSourceWithDetails }) => {
  const { lastScanStatus, lastScanStatusMessage, lastScannedAt } = dataSource;
  if (lastScanStatus === SecretScanningScanStatus.Failed)
    return (
      <Tooltip
        content={
          <Stack gap={4}>
            <span>{lastScanStatusMessage ?? "The scan failed."}</span>
            {lastScannedAt && (
              <span>
                Attempted {formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true })}
              </span>
            )}
          </Stack>
        }
        side="left"
      >
        <StatusText tone="bad" icon="x" tabIndex={0}>
          Scan error
        </StatusText>
      </Tooltip>
    );
  if (lastScanStatus === SecretScanningScanStatus.Queued)
    return <StatusText icon="clock">Queued</StatusText>;
  if (lastScanStatus === SecretScanningScanStatus.Scanning)
    return <StatusText icon="sync">Scanning</StatusText>;
  if (!lastScannedAt) return <Meta mono={false}>Never</Meta>;
  return (
    <Meta mono={false}>
      {formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true })}
    </Meta>
  );
};

const DataSourceStatus = ({ dataSource }: { dataSource: TSecretScanningDataSourceWithDetails }) => {
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  if (dataSource.isDisconnected)
    return (
      <Tooltip content="The external data source has been removed and can no longer be scanned. Delete this data source and reconnect it.">
        <StatusText tone="bad" icon="alert" tabIndex={0}>
          Disconnected
        </StatusText>
      </Tooltip>
    );
  if (!dataSource.isScanNewCommitsEnabled)
    return (
      <Tooltip
        content={`Auto-scan is disabled. Scans are not triggered when a ${resource.verb} occurs to ${resource.pluralNoun} in this data source.`}
      >
        <StatusText icon="clock" tabIndex={0}>
          Paused
        </StatusText>
      </Tooltip>
    );
  return (
    <StatusText tone="ok" icon="check-c">
      Active
    </StatusText>
  );
};

const EditDataSourceSheet = ({
  dataSource,
  onClose,
  onSaved
}: {
  dataSource?: TSecretScanningDataSourceWithDetails;
  onClose: () => void;
  onSaved: (message: string) => void;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateDataSource();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scanNewCommits, setScanNewCommits] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!dataSource) return;
    setName(dataSource.name);
    setDescription(dataSource.description ?? "");
    setScanNewCommits(dataSource.isScanNewCommitsEnabled);
    setError(undefined);
  }, [dataSource]);

  const submit = async () => {
    if (!dataSource) return;
    if (!name.trim()) {
      setError("Required");
      return;
    }
    setPending(true);
    try {
      await update.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId,
        name: name.trim(),
        description: description.trim() || null,
        isScanNewCommitsEnabled: scanNewCommits
      });
      onSaved(`Updated ${name.trim()}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update data source");
    } finally {
      setPending(false);
    }
  };

  const resource = dataSource ? RESOURCE_DESCRIPTION_HELPER[dataSource.type] : undefined;

  return (
    <Sheet open={Boolean(dataSource)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>Edit data source</SheetTitle>
          <SheetDescription>
            {dataSource
              ? `${SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name} data source`
              : ""}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="edit-secret-scanning-data-source"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={error}>
                <Input
                  autoFocus
                  autoComplete="off"
                  value={name}
                  invalid={Boolean(error)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(undefined);
                  }}
                />
              </Field>
              <Field label="Description" optional>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Switch
                layout="row"
                label="Auto-scan"
                description={
                  resource
                    ? `Scan ${resource.pluralNoun} when a ${resource.verb} occurs.`
                    : undefined
                }
                checked={scanNewCommits}
                onCheckedChange={setScanNewCommits}
              />
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="edit-secret-scanning-data-source"
              loading={pending}
            >
              Save
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const DataSources = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const scanning = useV4Adapter("secretScanning");
  const { data: dataSources = [], isPending } = scanning.useDashboardDataSources(projectId, {
    refetchInterval: 30000
  });
  const deleteDataSource = scanning.useDeleteDataSource();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<TSecretScanningDataSourceWithDetails>();
  const [deleting, setDeleting] = useState<TSecretScanningDataSourceWithDetails>();
  const [notice, setNotice] = useState("");

  const typeFilter = (filters.find((filter) => filter.field === "type")?.values ??
    []) as SecretScanningDataSource[];
  const availableTypes = [...new Set(dataSources.map(({ type }) => type))];

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return dataSources
      .filter(({ type, name, connection }) => {
        if (typeFilter.length && !typeFilter.includes(type)) return false;
        return (
          SECRET_SCANNING_DATA_SOURCE_MAP[type].name.toLowerCase().includes(search) ||
          name.toLowerCase().includes(search) ||
          Boolean(connection?.name.toLowerCase().includes(search))
        );
      })
      .sort((a, b) =>
        sort.direction === "asc" ? compare(a, b, sort.columnId) : compare(b, a, sort.columnId)
      );
  }, [dataSources, query, typeFilter, sort]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [filtered.length, page, pageSize]);

  const columns: DataTableColumn<TSecretScanningDataSourceWithDetails>[] = [
    {
      id: "type",
      header: "Type",
      width: 152,
      text: (row) => SECRET_SCANNING_DATA_SOURCE_MAP[row.type].name,
      render: (row) => {
        const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[row.type];
        return (
          <Inline gap={8} align="center" wrap={false}>
            <ProviderIcon icon={image} alt={`${name} data source`} size="sm" />
            {name}
          </Inline>
        );
      }
    },
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <Stack gap={0} style={{ minWidth: 0 }}>
          <RowLink
            to="/v4/organizations/$orgId/$"
            params={{ orgId, _splat: `secret-scanning/data-sources/${row.type}/${row.id}` }}
          >
            {row.name}
          </RowLink>
          {row.description && (
            <Meta mono={false} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.description}
            </Meta>
          )}
        </Stack>
      )
    },
    {
      id: "resources",
      header: "Resources",
      width: 152,
      render: (row) => {
        const resource = RESOURCE_DESCRIPTION_HELPER[row.type];
        return `${row.resourceCount} ${row.resourceCount === 1 ? resource.singularTitle : resource.pluralTitle}`;
      }
    },
    {
      id: "findings",
      header: "Unresolved findings",
      sortable: true,
      width: 184,
      render: (row) => {
        if (!row.lastScannedAt || row.unresolvedFindings === null) return <Meta>-</Meta>;
        if (row.unresolvedFindings === 0) return "0";
        return (
          <StatusText tone="bad" icon="alert">
            {row.unresolvedFindings}
          </StatusText>
        );
      }
    },
    {
      id: "lastScan",
      header: "Last scan",
      sortable: true,
      width: 152,
      render: (row) => <LastScan dataSource={row} />
    },
    {
      id: "status",
      header: "Status",
      width: 144,
      render: (row) => <DataSourceStatus dataSource={row} />
    }
  ];

  const isFiltered = Boolean(query.trim()) || typeFilter.length > 0;

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Data sources"
          description="Connected systems Secret Scanning reads from."
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/overview" />
          }
          actions={
            <Tooltip content="Connecting a data source is not available here yet.">
              <Button variant="accent" icon="plus" aria-disabled>
                Add data source
              </Button>
            </Tooltip>
          }
        />
        <FilterBar
          label="Data source filters"
          fields={[
            {
              key: "type",
              label: "Platform",
              type: "multi-select",
              options: availableTypes.map((type) => ({
                value: type,
                label: SECRET_SCANNING_DATA_SOURCE_MAP[type].name
              }))
            }
          ]}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search data sources"
              placeholder="Search data sources..."
              kbd="/"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <DataTable
          label="Data sources"
          rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
          columns={columns}
          loading={isPending}
          loadingRows={3}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          rowActions={{
            menuLabel: "Data source options",
            renderMenu: (row) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(row.id);
                    setNotice("Data source ID copied to clipboard");
                  }}
                >
                  Copy data source ID
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setEditing(row)}>
                  Edit data source
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                  Delete data source
                </DropdownMenuItem>
              </>
            )
          }}
          footer={notice || undefined}
          empty={
            isFiltered && dataSources.length ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No data sources match your filters"
                description="Try a different search term or platform filter."
                actions={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setFilters([]);
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="git"
                title="No data sources yet"
                description="Add a data source to start scanning it for leaked secrets."
              />
            )
          }
          pagination={
            filtered.length > 0 ? (
              <Pagination
                label="Data source pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={filtered.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            ) : undefined
          }
        />
        <EditDataSourceSheet
          dataSource={editing}
          onClose={() => setEditing(undefined)}
          onSaved={setNotice}
        />
        <AlertDialog
          open={Boolean(deleting)}
          onOpenChange={(next) => !next && setDeleting(undefined)}
        >
          <AlertDialogContent tone="danger" confirmText={deleting?.name ?? ""}>
            <AlertDialogHeader>
              <AlertDialogTitle>{`Delete ${deleting?.name ?? "data source"}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the findings and scan history of this data source. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  if (!deleting) return;
                  await deleteDataSource.mutateAsync({
                    dataSourceId: deleting.id,
                    type: deleting.type,
                    projectId: deleting.projectId
                  });
                  setNotice(
                    `Deleted ${SECRET_SCANNING_DATA_SOURCE_MAP[deleting.type].name} data source ${deleting.name}`
                  );
                  setDeleting(undefined);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Stack>
    </TooltipProvider>
  );
};

export const SecretScanningDataSourcesPage = () => {
  const { orgId } = useParams({ from: route });
  const { data: projectId } = useV4Adapter("secretScanning").useProjectId(orgId);
  if (!projectId) return <Loader size="page" label="Loading data sources" />;
  return <DataSources orgId={orgId} projectId={projectId} />;
};
