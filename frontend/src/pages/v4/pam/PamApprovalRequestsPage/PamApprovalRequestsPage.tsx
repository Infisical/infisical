import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { PamAccessType, type TPamAccessRequest } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { ApprovalRequestSheet } from "./ApprovalRequestSheet";
import { formatDuration, formatRequestDate, requesterSubtitle, requestStatus } from "./status";

const route = v4Path("/organizations/$orgId/pam/approval-requests");
const TABLE_PREFERENCE = "pamApprovalRequestsTable";

export const PamApprovalRequestsPage = () => {
  const { orgId } = useParams({ from: route });
  const { requestId } = useSearch({ from: route });
  const navigate = useNavigate({ from: route });
  const pam = useV4Adapter("pam");
  const { data: requests = [], isPending } = pam.usePendingMyApproval();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 20)
  );

  const typeMap = useMemo(
    () => new Map(accountTypes.map((meta) => [meta.type as string, meta])),
    [accountTypes]
  );
  const folderOptions = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach((request) => {
      const folderId = request.requestData?.requestData?.folderId;
      if (folderId) map.set(folderId, request.folderName ?? folderId);
    });
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [requests]);

  const folderIds = filters.find((filter) => filter.field === "folder")?.values ?? [];
  const query = search.trim().toLowerCase();
  const filtered = requests.filter(
    (request) =>
      (!folderIds.length || folderIds.includes(request.requestData?.requestData?.folderId ?? "")) &&
      (!query ||
        `${request.requesterName} ${request.requesterEmail} ${request.accountName ?? ""} ${request.folderName ?? ""}`
          .toLowerCase()
          .includes(query))
  );
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const selected = requestId ? requests.find((request) => request.id === requestId) : undefined;

  const closeSheet = () =>
    navigate({ search: (prev) => ({ ...prev, requestId: undefined }), replace: true });

  const columns: DataTableColumn<TPamAccessRequest>[] = [
    {
      id: "requester",
      header: "Requester",
      primary: true,
      grow: true,
      text: (request) => request.requesterName,
      render: (request) => (
        <Stack gap={2}>
          <RowLink to={route} params={{ orgId }} search={{ requestId: request.id }} chevron={false}>
            {request.requesterName}
          </RowLink>
          <Meta mono={false}>{requesterSubtitle(request)}</Meta>
        </Stack>
      )
    },
    {
      id: "account",
      header: "Account",
      width: 220,
      text: (request) => request.accountName ?? "",
      render: (request) => {
        const meta = request.accountType ? typeMap.get(request.accountType) : undefined;
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <span>{request.accountName ?? "Unknown account"}</span>
          </Inline>
        );
      }
    },
    {
      id: "requesting",
      header: "Requesting",
      width: 128,
      render: (request) =>
        request.accessType === PamAccessType.Credential ? (
          <Badge tone="warn">Credentials</Badge>
        ) : (
          <Badge tone="soft">Session</Badge>
        )
    },
    {
      id: "folder",
      header: "Folder",
      width: 184,
      text: (request) => request.folderName ?? "",
      render: (request) => request.folderName ?? "None"
    },
    {
      id: "duration",
      header: "Duration",
      width: 112,
      render: (request) => formatDuration(request.requestData?.requestData?.duration)
    },
    {
      id: "requested",
      header: "Requested",
      width: 184,
      render: (request) => formatRequestDate(request.createdAt)
    },
    {
      id: "status",
      header: "Status",
      width: 152,
      render: (request) => {
        const status = requestStatus(request);
        return (
          <StatusText tone={status.tone} icon={status.icon}>
            {status.label}
          </StatusText>
        );
      }
    }
  ];

  const filtering = Boolean(query) || folderIds.length > 0;

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader title="Approval requests" />
        <FilterBar
          label="Approval request filters"
          fields={[
            { key: "folder", label: "Folder", type: "multi-select", options: folderOptions }
          ]}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search approval requests"
              placeholder="Search by requester, account or folder..."
              kbd="/"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <DataTable
          label="Approval requests"
          rows={pageRows}
          columns={columns}
          loading={isPending}
          loadingRows={5}
          getRowId={(request) => request.id}
          rowLabel={(request) => `${request.requesterName}, ${request.accountName ?? "account"}`}
          empty={
            filtering ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No requests match your filters"
                actions={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFilters([]);
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
                icon="inbox"
                title="No requests found"
                description="Requests awaiting your approval will appear here."
              />
            )
          }
          pagination={
            !isPending && filtered.length > 10 ? (
              <Pagination
                label="Approval request pages"
                variant="compact"
                page={page}
                total={filtered.length}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                  setUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, size);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      <ApprovalRequestSheet
        request={selected}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      />
    </TooltipProvider>
  );
};
