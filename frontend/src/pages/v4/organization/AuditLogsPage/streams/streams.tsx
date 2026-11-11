import { useMemo, useState } from "react";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import { AuditLogStreamsUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getProviderUrl } from "@app/helpers/auditLogStreams";
import type { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import type { TAuditLogStream } from "@app/hooks/api/auditLogStreams/types";

import { useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { AccessRestricted, RESTRICTED, type Sort } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { UpgradeGate } from "../../../license";
import { PRODUCT_LABELS, sortProducts } from "./stream-model";
import { ProviderMedia, providerName, StreamSheet, type StreamSheetState } from "./stream-sheet";

const MAX_PRODUCTS = 2;

const compare = (a: TAuditLogStream, b: TAuditLogStream, columnId: string) =>
  columnId === "url"
    ? getProviderUrl(a).toLowerCase().localeCompare(getProviderUrl(b).toLowerCase())
    : providerName(a.provider).toLowerCase().localeCompare(providerName(b.provider).toLowerCase());

const Products = ({ stream }: { stream: TAuditLogStream }) => {
  const products = sortProducts(stream.filters?.products ?? []);
  if (!products.length) return <Meta mono={false}>All products</Meta>;
  const overflow = products.slice(MAX_PRODUCTS);
  return (
    <Inline gap={4} align="center" wrap={false}>
      {products.slice(0, MAX_PRODUCTS).map((product) => (
        <Badge key={product} tone="outline">
          {PRODUCT_LABELS[product]}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Tooltip content={overflow.map((product) => PRODUCT_LABELS[product]).join(", ")}>
          <Badge tone="soft" tabIndex={0}>
            +{overflow.length}
          </Badge>
        </Tooltip>
      )}
    </Inline>
  );
};

const Failing = ({ stream }: { stream: TAuditLogStream }) => {
  if (!stream.failingSince) return null;
  return (
    <Tooltip
      content={
        <Stack gap={4}>
          <span>Failing since {format(new Date(stream.failingSince), "PPpp")}</span>
          {stream.lastDeliveryError && <span>{stream.lastDeliveryError}</span>}
        </Stack>
      }
    >
      <StatusText tone="bad" icon="alert" tabIndex={0}>
        Failing
      </StatusText>
    </Tooltip>
  );
};

export const AuditLogStreamsTab = () => {
  const { organization } = useV4Session();
  const adapter = useV4Adapter("auditLogs");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: plan } = adapter.usePlan(organization.id);
  const { data: streams = [], isPending } = adapter.useStreams();
  const deleteStream = adapter.useDeleteStream();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "provider", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sheet, setSheet] = useState<StreamSheetState>();
  const [deleting, setDeleting] = useState<TAuditLogStream>();
  const [deletePending, setDeletePending] = useState(false);
  const [upgrade, setUpgrade] = useState<string>();

  const providerFilter = (filters.find((filter) => filter.field === "provider")?.values ??
    []) as LogProvider[];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return streams
      .filter(
        (stream) =>
          (!providerFilter.length || providerFilter.includes(stream.provider)) &&
          (providerName(stream.provider).toLowerCase().includes(needle) ||
            getProviderUrl(stream).toLowerCase().includes(needle))
      )
      .sort((a, b) => compare(a, b, sort.columnId) * (sort.direction === "asc" ? 1 : -1));
  }, [streams, query, providerFilter, sort]);

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  if (!permissionPending && !canRead)
    return <AccessRestricted requirement="read organization settings" />;

  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const canDelete = permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const isFiltered = Boolean(query.trim()) || providerFilter.length > 0;
  const edit = (stream: TAuditLogStream) => setSheet({ mode: "edit", stream });

  const columns: DataTableColumn<TAuditLogStream>[] = [
    {
      id: "provider",
      header: "Provider",
      primary: true,
      sortable: true,
      width: 240,
      text: (stream) => providerName(stream.provider),
      render: (stream) => (
        <Inline gap={8} align="center" wrap={false}>
          <ProviderMedia provider={stream.provider} size="sm" />
          {canEdit ? (
            <Button variant="link" underline="hover" onClick={() => edit(stream)}>
              {providerName(stream.provider)}
            </Button>
          ) : (
            providerName(stream.provider)
          )}
          <Failing stream={stream} />
        </Inline>
      )
    },
    {
      id: "url",
      header: "Endpoint URL",
      sortable: true,
      grow: true,
      text: (stream) => getProviderUrl(stream),
      render: (stream) => <MiddleTruncate text={getProviderUrl(stream)} />
    },
    {
      id: "products",
      header: "Products",
      width: 320,
      render: (stream) => <Products stream={stream} />
    }
  ];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Log stream filters"
        fields={[
          {
            key: "provider",
            label: "Provider",
            type: "multi-select",
            options: [...new Set(streams.map((stream) => stream.provider))].map((provider) => ({
              value: provider,
              label: providerName(provider)
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
            aria-label="Search log streams"
            placeholder="Search log streams..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Button
            variant="accent"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => {
              if (plan && !plan.auditLogStreams) {
                setUpgrade("organization.audit-log-stream");
                return;
              }
              setSheet({ mode: "create" });
            }}
          >
            Add log stream
          </Button>
        }
      />
      <DataTable
        label="Audit log streams"
        rows={filtered.slice((current - 1) * pageSize, current * pageSize)}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(stream) => stream.id}
        rowLabel={(stream) => `${providerName(stream.provider)} log stream`}
        onRowActivate={canEdit ? edit : undefined}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          inline: [
            {
              label: "Edit log stream",
              icon: PencilIcon,
              disabledReason: () => (canEdit ? undefined : RESTRICTED),
              onSelect: edit
            }
          ],
          menuLabel: "Log stream options",
          renderMenu: (stream) => (
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              description={canDelete ? undefined : RESTRICTED}
              onSelect={() => setDeleting(stream)}
            >
              <Icon name="trash" />
              Delete log stream
            </DropdownMenuItem>
          )
        }}
        empty={
          isFiltered && streams.length ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="No log streams match your filters"
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
              icon="upload"
              title="No log streams yet"
              description="Add a log stream to send audit logs to an external destination."
            />
          )
        }
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Log stream pages"
              variant="compact"
              page={current}
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
      <StreamSheet
        state={sheet}
        onClose={() => setSheet(undefined)}
        onPlanned={() => setUpgrade("organization.log-stream-provider-select")}
      />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Delete ${deleting ? providerName(deleting.provider) : ""} log stream?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Audit logs stop going to this destination. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                const name = providerName(deleting.provider);
                setDeletePending(true);
                try {
                  await deleteStream.mutateAsync({
                    auditLogStreamId: deleting.id,
                    provider: deleting.provider
                  });
                } catch (error) {
                  failed(`Failed to delete the ${name} log stream`, error);
                  return;
                } finally {
                  setDeletePending(false);
                }
                saved(`${name} log stream deleted`);
                setDeleting(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UpgradeGate
        intent={AuditLogStreamsUpgradeIntent}
        paywallKey={upgrade ?? "organization.audit-log-stream"}
        isOpen={Boolean(upgrade)}
        onOpenChange={(open) => !open && setUpgrade(undefined)}
      />
    </Stack>
  );
};
