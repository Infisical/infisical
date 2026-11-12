import { useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { StatusText } from "@infisical/cipher/ui/text";

import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import {
  ApprovalRequestStatus,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
import { certDataOf, needsApprovalFrom, RequestStatus, requestedAgo } from "../components/approval";

const detailPath = v4Path("/organizations/$orgId/cert-manager/approvals/$approvalRequestId");

const statusField: FilterBarField = {
  key: "status",
  label: "Status",
  type: "select",
  options: [
    { value: ApprovalRequestStatus.Pending, label: "Open" },
    { value: ApprovalRequestStatus.Approved, label: "Approved" },
    { value: ApprovalRequestStatus.Cancelled, label: "Cancelled" },
    { value: ApprovalRequestStatus.Rejected, label: "Rejected" },
    { value: ApprovalRequestStatus.Expired, label: "Expired" }
  ]
};

const openOnly: FilterBarFilter[] = [{ field: "status", values: [ApprovalRequestStatus.Pending] }];

export const RequestsTab = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const approvals = useV4Adapter("approvalRequests");
  const { user } = useV4Session();
  const { data: viewer } = approvals.useViewer(projectId);
  const { data: requests = [], isPending } = approvals.useRequests({
    policyType: ApprovalPolicyType.CertRequest,
    scope: ApprovalPolicyScope.Project,
    scopeId: projectId
  });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>(openOnly);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const me = { userId: user.id, groupIds: viewer?.groupIds ?? [] };
  const status = filters.find((filter) => filter.field === "status")?.values[0];
  const term = query.trim().toLowerCase();
  const rows = requests
    .filter((request) => !status || request.status === status)
    .filter((request) => {
      if (!term) return true;
      const data = certDataOf(request);
      return [
        request.requesterName,
        request.requesterEmail,
        request.justification,
        data?.profileName,
        data?.certificateRequest?.commonName
      ].some((value) => value?.toLowerCase().includes(term));
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const columns: DataTableColumn<TApprovalRequest>[] = [
    {
      id: "requester",
      header: "Requester",
      primary: true,
      grow: true,
      text: (request) => request.requesterName || request.requesterEmail,
      render: (request) => (
        <RowLink
          link={{
            to: detailPath,
            params: { orgId, approvalRequestId: request.id },
            search: { policyType: ApprovalPolicyType.CertRequest }
          }}
        >
          {request.requesterName || "Unknown"}
        </RowLink>
      )
    },
    {
      id: "email",
      header: "Email",
      width: 208,
      render: (request) => request.requesterEmail || "None"
    },
    {
      id: "profile",
      header: "Profile",
      width: 152,
      render: (request) => certDataOf(request)?.profileName ?? "None"
    },
    {
      id: "commonName",
      header: "Common name",
      width: 224,
      render: (request) => certDataOf(request)?.certificateRequest?.commonName || "None"
    },
    {
      id: "status",
      header: "Status",
      width: 168,
      render: (request) =>
        needsApprovalFrom(request, me) ? (
          <StatusText tone="warn" icon="alert-c">
            Approval required
          </StatusText>
        ) : (
          <RequestStatus status={request.status} />
        )
    },
    {
      id: "requested",
      header: "Requested",
      width: 144,
      render: (request) => requestedAgo(request.createdAt)
    }
  ];
  const filtered = Boolean(term) || status !== ApprovalRequestStatus.Pending;
  return (
    <Stack gap={16}>
      <FilterBar
        label="Certificate request filters"
        fields={[statusField]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search certificate requests"
            placeholder="Search certificate requests"
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
        label="Certificate approval requests"
        rows={rows.slice((page - 1) * pageSize, page * pageSize)}
        loading={isPending}
        columns={columns}
        getRowId={(request) => request.id}
        rowLabel={(request) => request.requesterName || request.id}
        empty={
          filtered && requests.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No certificate approval requests match"
              actions={
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilters(openOnly);
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState size="sm" icon="inbox" title="No certificate approval requests found" />
          )
        }
        pagination={
          rows.length > pageSize ? (
            <Pagination
              label="Certificate approval request pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={rows.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 25, 50]}
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
