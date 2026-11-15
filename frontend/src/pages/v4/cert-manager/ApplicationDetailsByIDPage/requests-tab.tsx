import { useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";

import { CertificateRequestStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificateRequestListItem } from "@app/hooks/api/certificates/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication
} from "@app/hooks/api/pkiApplications/types";

import { formatDate, formatDateTime } from "../../access/roles";
import { failed, toast } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { orgHref, v4Path } from "../../links";
import { RequestCertificateSheet } from "../components/certificate-requests/request-sheet";
import { appCan, plural } from "./shared";

const certificatePath = v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId");

type StatusFilter = "pending" | "issued" | "failed";

const statusField: FilterBarField = {
  key: "status",
  label: "Status",
  type: "select",
  options: [
    { value: "pending", label: "Pending" },
    { value: "issued", label: "Issued" },
    { value: "failed", label: "Failed" }
  ]
};

const statusMeta: Record<string, { label: string; tone: BadgeTone; fallback?: string }> = {
  [CertificateRequestStatus.ISSUED]: { label: "Issued", tone: "ok" },
  [CertificateRequestStatus.FAILED]: {
    label: "Failed",
    tone: "bad",
    fallback: "Certificate request failed"
  },
  [CertificateRequestStatus.REJECTED]: {
    label: "Failed",
    tone: "bad",
    fallback: "Certificate request failed"
  },
  [CertificateRequestStatus.PENDING]: {
    label: "Pending issuance",
    tone: "info",
    fallback: "Awaiting issuance"
  },
  [CertificateRequestStatus.PENDING_VALIDATION]: {
    label: "Pending validation",
    tone: "warn",
    fallback: "Awaiting CA validation"
  },
  [CertificateRequestStatus.PENDING_APPROVAL]: { label: "Pending approval", tone: "warn" }
};

const requestName = (request: TCertificateRequestListItem) =>
  request.commonName || request.altNames?.split(",")[0]?.trim() || "Unnamed request";

const shortSerial = (serial?: string) =>
  serial && serial.length > 12 ? `${serial.slice(0, 5)}…${serial.slice(-5)}` : serial;

const RequestStatus = ({
  request,
  orgId,
  applicationName
}: {
  request: TCertificateRequestListItem;
  orgId: string;
  applicationName: string;
}) => {
  const meta = statusMeta[request.status] ?? { label: request.status, tone: "outline" };
  if (request.status === CertificateRequestStatus.PENDING_APPROVAL && request.approvalRequestId)
    return (
      <Badge tone="warn" dot icon="external" asChild>
        <a
          href={orgHref(
            orgId,
            `/cert-manager/approvals/${request.approvalRequestId}?applicationName=${encodeURIComponent(applicationName)}`
          )}
        >
          Pending approval
        </a>
      </Badge>
    );
  const badge = (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
  const detail = request.errorMessage || request.pendingMessage || meta.fallback;
  return detail && request.status !== CertificateRequestStatus.ISSUED ? (
    <Tooltip content={detail}>
      <span>{badge}</span>
    </Tooltip>
  ) : (
    badge
  );
};

export const RequestsTab = ({
  orgId,
  application,
  access
}: {
  orgId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const [requesting, setRequesting] = useState(false);
  const canRequest = appCan(
    access,
    PkiApplicationResourceActions.Create,
    PkiApplicationResourceSub.Certificates
  );
  const navigate = useNavigate();
  const adapter = useV4Adapter("pkiApplications");
  const cancel = adapter.useCancelCertificateRequest();
  const trigger = adapter.useTriggerRequestValidation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busyId, setBusyId] = useState<string>();
  const status = filters.find((filter) => filter.field === "status")?.values[0] as
    | StatusFilter
    | undefined;
  const { data, isPending } = adapter.useCertificateRequests({
    applicationId: application.id,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    sortBy: "createdAt",
    sortOrder: "desc",
    search: query.trim() || undefined,
    status
  });
  const rows = data?.certificateRequests ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtered = Boolean(query.trim() || status);

  const runValidation = async (request: TCertificateRequestListItem) => {
    setBusyId(request.id);
    try {
      const result = await trigger.mutateAsync({ requestId: request.id });
      const suffix = result.orderStatus ? ` (${result.orderStatus})` : "";
      if (result.status === CertificateRequestStatus.ISSUED)
        toast({ tone: "ok", title: "Certificate issued" });
      else if (result.status === CertificateRequestStatus.FAILED)
        toast({ tone: "bad", title: `Validation failed${suffix}` });
      else toast({ tone: "neutral", title: `Still pending validation${suffix}` });
    } catch (error) {
      failed("Failed to trigger validation", error);
    } finally {
      setBusyId(undefined);
    }
  };

  const cancelRequest = async (request: TCertificateRequestListItem) => {
    setBusyId(request.id);
    try {
      const result = await cancel.mutateAsync({ requestId: request.id });
      toast(
        result.cancelled
          ? { tone: "ok", title: "Certificate request cancelled" }
          : {
              tone: "neutral",
              title: "The request already finished, so it can't be cancelled"
            }
      );
    } catch (error) {
      failed("Failed to cancel certificate request", error);
    } finally {
      setBusyId(undefined);
    }
  };

  const columns: DataTableColumn<TCertificateRequestListItem>[] = [
    {
      id: "name",
      header: "SAN / CN",
      primary: true,
      grow: true,
      text: requestName,
      render: requestName
    },
    {
      id: "serial",
      header: "Serial number",
      width: 144,
      mono: true,
      text: (request) => request.certificate?.serialNumber ?? "",
      render: (request) => shortSerial(request.certificate?.serialNumber) ?? "None"
    },
    {
      id: "status",
      header: "Status",
      width: 176,
      render: (request) => (
        <RequestStatus request={request} orgId={orgId} applicationName={application.name} />
      )
    },
    {
      id: "profile",
      header: "Profile",
      width: 144,
      mono: true,
      text: (request) => request.profileName ?? "",
      render: (request) => request.profileName ?? "None"
    },
    {
      id: "created",
      header: "Requested",
      width: 128,
      render: (request) => (
        <Tooltip content={formatDateTime(request.createdAt)}>
          <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
        </Tooltip>
      )
    }
  ];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Request filters"
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
            placeholder="Search by SAN or CN"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Button
            variant="primary"
            icon="plus"
            disabledReason={canRequest ? undefined : RESTRICTED}
            onClick={() => setRequesting(true)}
          >
            Request certificate
          </Button>
        }
      />
      {requesting && (
        <RequestCertificateSheet
          applicationId={application.id}
          applicationName={application.name}
          onClose={() => setRequesting(false)}
        />
      )}
      <DataTable
        label={`Certificate requests in ${application.name}`}
        rows={rows}
        loading={isPending}
        columns={columns}
        getRowId={(request) => request.id}
        rowLabel={requestName}
        rowActions={{
          menuDisabledReason: (request) =>
            (request.status === CertificateRequestStatus.ISSUED && request.certificateId) ||
            request.status === CertificateRequestStatus.PENDING ||
            request.status === CertificateRequestStatus.PENDING_VALIDATION
              ? undefined
              : "No actions for this request",
          renderMenu: (request) => {
            const cancellable =
              request.status === CertificateRequestStatus.PENDING ||
              request.status === CertificateRequestStatus.PENDING_VALIDATION;
            const busy = busyId === request.id;
            return (
              <>
                {request.status === CertificateRequestStatus.ISSUED && request.certificateId && (
                  <DropdownMenuItem
                    onSelect={() =>
                      navigate({
                        to: certificatePath,
                        params: { orgId, certificateId: request.certificateId ?? "" },
                        search: { fromApplication: application.name }
                      })
                    }
                  >
                    <Icon name="eye" />
                    View certificate
                  </DropdownMenuItem>
                )}
                {request.status === CertificateRequestStatus.PENDING_VALIDATION && (
                  <DropdownMenuItem disabled={busy} onSelect={() => runValidation(request)}>
                    <Icon name="sync" />
                    Trigger validation
                  </DropdownMenuItem>
                )}
                {cancellable && (
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busy}
                    onSelect={() => cancelRequest(request)}
                  >
                    <Icon name="x" />
                    Cancel request
                  </DropdownMenuItem>
                )}
              </>
            );
          }
        }}
        empty={
          filtered ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No certificate requests match"
              actions={
                <Button
                  variant="link"
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
            <EmptyState size="sm" icon="inbox" title="No certificate requests yet" />
          )
        }
        persistentStatus={totalCount ? plural(totalCount, "request", "requests") : undefined}
        pagination={
          totalCount > pageSize ? (
            <Pagination
              label="Certificate request pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[20, 50, 100]}
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
