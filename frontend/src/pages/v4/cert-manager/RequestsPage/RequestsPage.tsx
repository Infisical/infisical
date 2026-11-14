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
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import {
  ApprovalRequestStatus,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { certDataOf, RequestStatus, requestedAgo, signingDataOf } from "../components/approval";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";

const routeId = v4Path("/organizations/$orgId/cert-manager/requests");
const detailPath = v4Path("/organizations/$orgId/cert-manager/approvals/$approvalRequestId");

type Tab = "application-requests" | "signing-requests";

const statusMatches: Record<string, (status: ApprovalRequestStatus) => boolean> = {
  pending: (status) => status === ApprovalRequestStatus.Pending,
  approved: (status) => status === ApprovalRequestStatus.Approved,
  rejected: (status) =>
    status === ApprovalRequestStatus.Rejected ||
    status === ApprovalRequestStatus.Cancelled ||
    status === ApprovalRequestStatus.Expired
};

const statusField: FilterBarField = {
  key: "status",
  label: "Status",
  type: "multi-select",
  options: [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" }
  ]
};

const pendingOnly: FilterBarFilter[] = [{ field: "status", values: ["pending"] }];

const RequestsTable = ({
  orgId,
  policyType,
  requests,
  loading
}: {
  orgId: string;
  policyType: ApprovalPolicyType;
  requests: TApprovalRequest[];
  loading: boolean;
}) => {
  const isSigning = policyType === ApprovalPolicyType.CertCodeSigning;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>(pendingOnly);
  const appIds = [
    ...new Set(
      requests.flatMap((request) =>
        request.scopeType === ApprovalPolicyScope.PkiApplication && request.scopeId
          ? [request.scopeId]
          : []
      )
    )
  ];
  const { data: applications = [] } = useV4Adapter("approvalRequests").useApplications(
    isSigning ? [] : appIds
  );
  const statuses = filters.find((filter) => filter.field === "status")?.values ?? [];
  const term = query.trim().toLowerCase();
  const rows = requests
    .filter(
      (request) => !statuses.length || statuses.some((key) => statusMatches[key]?.(request.status))
    )
    .filter((request) => {
      if (!term) return true;
      const requester = `${request.requesterName} ${request.requesterEmail}`;
      const haystack = isSigning
        ? [signingDataOf(request)?.signerName, requester]
        : [
            certDataOf(request)?.certificateRequest?.commonName,
            certDataOf(request)?.profileName,
            requester
          ];
      return haystack.some((value) => value?.toLowerCase().includes(term));
    });
  const applicationOf = (request: TApprovalRequest) =>
    request.scopeType === ApprovalPolicyScope.PkiApplication
      ? applications.find((application) => application.id === request.scopeId)
      : undefined;
  const link = (request: TApprovalRequest, text: string) => (
    <RowLink
      link={{
        to: detailPath,
        params: { orgId, approvalRequestId: request.id },
        search: { policyType, from: "root-requests" }
      }}
    >
      {text}
    </RowLink>
  );
  const requester: DataTableColumn<TApprovalRequest> = {
    id: "requester",
    header: "Requester",
    width: 240,
    text: (request) => request.requesterName || request.requesterEmail,
    render: (request) => request.requesterName || request.requesterEmail || "Unknown"
  };
  const tail: DataTableColumn<TApprovalRequest>[] = [
    {
      id: "status",
      header: "Status",
      width: 152,
      render: (request) => <RequestStatus status={request.status} />
    },
    {
      id: "requested",
      header: "Requested",
      width: 144,
      render: (request) => requestedAgo(request.createdAt)
    }
  ];
  const columns: DataTableColumn<TApprovalRequest>[] = isSigning
    ? [
        {
          id: "signer",
          header: "Signer",
          primary: true,
          grow: true,
          text: (request) => signingDataOf(request)?.signerName ?? "",
          render: (request) => link(request, signingDataOf(request)?.signerName ?? "Unknown signer")
        },
        requester,
        ...tail
      ]
    : [
        {
          id: "commonName",
          header: "Common name",
          primary: true,
          grow: true,
          text: (request) => certDataOf(request)?.certificateRequest?.commonName ?? "",
          render: (request) =>
            link(request, certDataOf(request)?.certificateRequest?.commonName || "No common name")
        },
        {
          id: "profile",
          header: "Profile",
          width: 152,
          render: (request) => certDataOf(request)?.profileName ?? "None"
        },
        {
          id: "application",
          header: "Application",
          width: 160,
          render: (request) => {
            const application = applicationOf(request);
            if (!application) return "None";
            return (
              <Button variant="link" asChild>
                <a href={orgHref(orgId, `/cert-manager/applications/${application.name}`)}>
                  {application.name}
                </a>
              </Button>
            );
          }
        },
        requester,
        ...tail
      ];
  const filtered = Boolean(term) || statuses.length !== 1 || statuses[0] !== "pending";
  const onlyPending = statuses.length === 1 && statuses[0] === "pending";
  return (
    <Stack gap={16}>
      <FilterBar
        label={isSigning ? "Signing request filters" : "Application request filters"}
        fields={[statusField]}
        value={filters}
        onChange={setFilters}
        search={
          <Input
            icon="search"
            aria-label={isSigning ? "Search signing requests" : "Search application requests"}
            placeholder={
              isSigning
                ? "Search by signer or requester"
                : "Search by common name, profile or requester"
            }
            kbd="/"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      />
      <DataTable
        label={isSigning ? "Signing requests" : "Application requests"}
        rows={rows}
        loading={loading}
        columns={columns}
        getRowId={(request) => request.id}
        rowLabel={(request) =>
          (isSigning
            ? signingDataOf(request)?.signerName
            : certDataOf(request)?.certificateRequest?.commonName) ?? request.id
        }
        empty={
          filtered && requests.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No requests match"
              actions={
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilters(pendingOnly);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon="inbox"
              title={onlyPending ? "No requests pending review" : "No requests"}
              description={
                isSigning
                  ? "Code signing requests from any signer appear here."
                  : "Certificate requests from any application appear here."
              }
            />
          )
        }
        persistentStatus={
          requests.length ? `${rows.length} of ${requests.length} requests` : undefined
        }
      />
    </Stack>
  );
};

export const RequestsPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { selectedTab } = useSearch({ from: routeId });
  const navigate = useNavigate({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const approvals = useV4Adapter("approvalRequests");
  const scope = { scope: ApprovalPolicyScope.Project, scopeId: projectId ?? "" };
  const certRequests = approvals.useRequests({
    policyType: ApprovalPolicyType.CertRequest,
    ...scope
  });
  const signingRequests = approvals.useRequests({
    policyType: ApprovalPolicyType.CertCodeSigning,
    ...scope
  });
  if (isResolving) return <Loader size="page" label="Loading approval requests" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  const tab: Tab = selectedTab ?? "application-requests";
  const pendingCount = (requests?: TApprovalRequest[]) =>
    requests?.filter((request) => request.status === ApprovalRequestStatus.Pending).length ||
    undefined;
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Approval requests"
          tabs={
            <Tabs
              label="Approval request sections"
              value={tab}
              onValueChange={(next) =>
                navigate({
                  search: next === "signing-requests" ? { selectedTab: next } : {}
                })
              }
              tabs={[
                {
                  value: "application-requests",
                  label: "Application requests",
                  count: pendingCount(certRequests.data)
                },
                {
                  value: "signing-requests",
                  label: "Signing requests",
                  count: pendingCount(signingRequests.data)
                }
              ]}
            />
          }
        />
        {tab === "application-requests" ? (
          <RequestsTable
            key="application-requests"
            orgId={orgId}
            policyType={ApprovalPolicyType.CertRequest}
            requests={certRequests.data ?? []}
            loading={certRequests.isPending}
          />
        ) : (
          <RequestsTable
            key="signing-requests"
            orgId={orgId}
            policyType={ApprovalPolicyType.CertCodeSigning}
            requests={signingRequests.data ?? []}
            loading={signingRequests.isPending}
          />
        )}
      </Stack>
    </TooltipProvider>
  );
};
