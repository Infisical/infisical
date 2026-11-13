import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format, formatDistanceStrict, formatDistanceToNowStrict } from "date-fns";

import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import {
  SecretScanningScanStatus,
  SecretScanningScanType
} from "@app/hooks/api/secretScanningV2/enums";
import type {
  TSecretScanningDataSource,
  TSecretScanningScanWithDetails
} from "@app/hooks/api/secretScanningV2/types";

import { useProjectPermission } from "../../access/permissions";
import { toast } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

type Sort = { columnId: string; direction: "asc" | "desc" };

const total = (scan: TSecretScanningScanWithDetails) =>
  scan.unresolvedFindings + scan.resolvedFindings;

const compare = (
  a: TSecretScanningScanWithDetails,
  b: TSecretScanningScanWithDetails,
  columnId: string
) => {
  if (columnId === "findings") return total(a) - total(b);
  if (columnId === "resource")
    return a.resourceName.toLowerCase().localeCompare(b.resourceName.toLowerCase());
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

const ScanStatus = ({ scan }: { scan: TSecretScanningScanWithDetails }) => {
  if (scan.status === SecretScanningScanStatus.Queued)
    return <StatusText icon="clock">Queued</StatusText>;
  if (scan.status === SecretScanningScanStatus.Scanning)
    return <StatusText icon="sync">Running</StatusText>;
  if (scan.status === SecretScanningScanStatus.Failed)
    return (
      <Tooltip content={scan.statusMessage ?? "The scan failed."} side="left">
        <StatusText tone="bad" icon="x" tabIndex={0}>
          Failed
        </StatusText>
      </Tooltip>
    );
  return (
    <StatusText tone="ok" icon="check-c">
      Completed
    </StatusText>
  );
};

export const ScanHistoryTab = ({ dataSource }: { dataSource: TSecretScanningDataSource }) => {
  const { permission } = useProjectPermission(dataSource.projectId);
  const canRead = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadScans,
    ProjectPermissionSub.SecretScanningDataSources
  );
  const { data: scans = [], isPending } = useV4Adapter("secretScanning").useScans(
    { dataSourceId: dataSource.id, type: dataSource.type },
    { enabled: canRead, refetchInterval: 30000 }
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ columnId: "started", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return scans
      .filter(({ resourceName }) => resourceName.toLowerCase().includes(search))
      .sort((a, b) =>
        sort.direction === "asc" ? compare(a, b, sort.columnId) : compare(b, a, sort.columnId)
      );
  }, [scans, query, sort]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [filtered.length, page, pageSize]);

  if (!canRead) return <AccessRestricted requirement="Read scans" />;

  const columns: DataTableColumn<TSecretScanningScanWithDetails>[] = [
    {
      id: "resource",
      header: resource.singularTitle,
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => row.resourceName,
      render: (row) => <code>{row.resourceName}</code>
    },
    {
      id: "type",
      header: "Type",
      width: 136,
      render: (row) =>
        row.type === SecretScanningScanType.Historical ? (
          <Tooltip content="The full history was scanned">
            <StatusText icon="history" tabIndex={0}>
              Historical
            </StatusText>
          </Tooltip>
        ) : (
          <Tooltip content="New commits were scanned">
            <StatusText icon="git" tabIndex={0}>
              Realtime
            </StatusText>
          </Tooltip>
        )
    },
    {
      id: "started",
      header: "Started",
      sortable: true,
      width: 160,
      render: (row) => (
        <Tooltip content={format(new Date(row.createdAt), "MMM d, yyyy h:mm a")}>
          <Meta mono={false} tabIndex={0}>
            {formatDistanceToNowStrict(new Date(row.createdAt), { addSuffix: true })}
          </Meta>
        </Tooltip>
      )
    },
    {
      id: "duration",
      header: "Duration",
      width: 120,
      render: (row) => (
        <Meta mono={false}>
          {row.startedAt && row.completedAt
            ? formatDistanceStrict(new Date(row.completedAt), new Date(row.startedAt))
            : "-"}
        </Meta>
      )
    },
    {
      id: "findings",
      header: "New findings",
      sortable: true,
      width: 136,
      render: (row) => {
        if (row.status !== SecretScanningScanStatus.Completed) return <Meta mono={false}>-</Meta>;
        if (!row.unresolvedFindings) return String(total(row));
        return (
          <StatusText tone="bad" icon="alert">
            {total(row)}
          </StatusText>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (row) => <ScanStatus scan={row} />
    }
  ];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Scan filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label={`Search scans by ${resource.singularNoun}`}
            placeholder={`Search by ${resource.singularNoun}...`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
      />
      <DataTable
        label="Scan history"
        rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(row) => row.id}
        rowLabel={(row) => `Scan of ${row.resourceName}`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          inline: [
            {
              label: "Copy scan ID",
              icon: "copy",
              onSelect: (row) => {
                navigator.clipboard.writeText(row.id);
                toast({ tone: "ok", title: "Scan ID copied to clipboard" });
              }
            }
          ]
        }}
        empty={
          scans.length ? (
            <EmptyState size="sm" media="bare" icon="search" title="No scans match your search" />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="history"
              title="No scans yet"
              description={`Scans appear here when a ${resource.singularNoun} is scanned.`}
            />
          )
        }
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Scan pages"
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
    </Stack>
  );
};
