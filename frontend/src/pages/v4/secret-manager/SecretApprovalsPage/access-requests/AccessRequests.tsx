import { useEffect, useMemo, useState } from "react";
import { formatDistance } from "date-fns";

import { SecretAccessRequestsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge, Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { ApprovalStatus } from "@app/hooks/api/secretApprovalRequest/types";
import {
  type AccessRequestState,
  getAccessRequestState,
  parseAccessDurationMs
} from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { useProjectPermission } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { useUpgradeGate } from "../../../license";
import { displayOf, durationLabel, personName, stamp } from "./model";
import { RequestAccessSheet } from "./RequestAccessSheet";
import { ReviewRequestSheet } from "./ReviewRequestSheet";

const TABLE = "accessRequestsTable";

type ClosedState = Exclude<AccessRequestState, "pending">;

const CLOSED_STATES: { label: string; value: ClosedState }[] = [
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Revoked", value: "revoked" },
  { label: "Expired", value: "expired" },
  { label: "Policy deleted", value: "policy-deleted" }
];

type Sort = { columnId: string; direction: "asc" | "desc" };

export const AccessRequests = ({
  orgId,
  projectId,
  requestId,
  onOpenRequest,
  onConfigurePolicies
}: {
  orgId: string;
  projectId: string;
  requestId: string;
  onOpenRequest: (requestId: string) => void;
  onConfigurePolicies: () => void;
}) => {
  const approvals = useV4Adapter("accessApprovals");
  const { data: project } = useV4Adapter("secrets").useProject(projectId);
  const { user } = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const projectSlug = project?.slug ?? "";
  const environments = project?.environments ?? [];
  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );
  const canCreatePolicies = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );

  const [status, setStatus] = useState<"open" | "close">("open");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>();
  const [requesting, setRequesting] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );

  const { data: members, isPending: membersPending } = approvals.useMembers(projectId);
  const { data: license } = approvals.useLicense(orgId);
  const { data: policies, isPending: policiesPending } = approvals.usePolicies(projectSlug);
  const { data: count } = approvals.useRequestCount(projectSlug);
  const isRetrying = approvals.useIsDispatchRetrying();

  const filterValue = (field: string) => filters.find((filter) => filter.field === field)?.values;
  const envFilter = filterValue("environment")?.[0];
  const validEnv =
    envFilter && environments.some((environment) => environment.slug === envFilter)
      ? envFilter
      : undefined;
  const requesterFilter = filterValue("requestedBy")?.[0];
  const validRequester =
    requesterFilter &&
    canReadMembers &&
    (membersPending || members?.some((member) => member.id === requesterFilter))
      ? requesterFilter
      : undefined;
  const closedFilter = (filterValue("closedStatus") ?? []) as ClosedState[];

  const { data: requests, isPending } = approvals.useRequests({
    projectSlug,
    envSlug: validEnv,
    authorUserId: validRequester
  });
  const { data: delegatedOptions } = approvals.useDelegatedApprovalOptions(
    Boolean(requests?.some((request) => request.delegatedApproval))
  );
  const delegatedName = (request: TAccessApprovalRequest) =>
    delegatedOptions?.find((option) => option.type === request.policy.delegatedApproval?.type)
      ?.name;

  const environmentName = (slug: string) =>
    environments.find((environment) => environment.slug === slug)?.name ?? slug;
  const memberById = (id: string) => members?.find((member) => member.id === id);
  const requesterOf = (request: TAccessApprovalRequest) =>
    memberById(request.requestedByUserId) ?? request.requestedByUser;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (requests ?? []).filter((request) => {
      const state = getAccessRequestState(request);
      if (status === "open" ? state !== "pending" : state === "pending") return false;
      if (status === "close" && closedFilter.length && !closedFilter.includes(state as ClosedState))
        return false;
      if (!needle) return true;
      const by = request.requestedByUser;
      return [
        request.environmentName,
        environmentName(request.environmentName),
        `${by?.email ?? ""} ${by?.firstName ?? ""} ${by?.lastName ?? ""}`
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [requests, status, closedFilter, search, environments]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const key = (request: TAccessApprovalRequest): number | string => {
      if (sort.columnId === "duration")
        return request.isTemporary
          ? (parseAccessDurationMs(request.temporaryRange) ?? 0)
          : Number.MAX_SAFE_INTEGER;
      if (sort.columnId === "environment") return environmentName(request.environmentName);
      if (sort.columnId === "path") return request.policy.secretPath ?? "";
      if (sort.columnId === "requestedBy") return personName(requesterOf(request));
      return new Date(request.createdAt).getTime();
    };
    return [...filtered].sort((first, second) => {
      const a = key(first);
      const b = key(second);
      const comparison = typeof a === "number" ? a - (b as number) : a.localeCompare(b as string);
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filtered, sort, members, environments]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > lastPage) setPage(lastPage);
  }, [filtered.length, page, perPage]);

  const isFiltered = Boolean(
    search.trim() || validEnv || validRequester || (status === "close" && closedFilter.length)
  );

  const selected = requestId ? requests?.find((request) => request.id === requestId) : undefined;

  const columns: DataTableColumn<TAccessApprovalRequest>[] = [
    {
      id: "environment",
      header: "Environment",
      primary: true,
      sortable: true,
      width: 160,
      text: (request) => environmentName(request.environmentName),
      render: (request) => (
        <Button variant="link" underline="hover" onClick={() => onOpenRequest(request.id)}>
          {environmentName(request.environmentName)}
        </Button>
      )
    },
    {
      id: "path",
      header: "Secret path",
      sortable: true,
      mono: true,
      width: 160,
      text: (request) => request.policy.secretPath ?? "",
      render: (request) => request.policy.secretPath
    },
    {
      id: "duration",
      header: "Duration",
      sortable: true,
      width: 120,
      render: durationLabel
    },
    {
      id: "requestedBy",
      header: "Requested by",
      sortable: true,
      width: 180,
      text: (request) => personName(requesterOf(request)),
      render: (request) => {
        const name = personName(requesterOf(request));
        if (!name) return <Meta>-</Meta>;
        return (
          <Inline gap={8} align="center" wrap={false}>
            <span>{name}</span>
            {request.requestedByUserId === user.id && <Badge tone="soft">You</Badge>}
          </Inline>
        );
      }
    },
    {
      id: "requested",
      header: "Requested",
      sortable: true,
      width: 160,
      render: (request) => (
        <Tooltip content={stamp(request.createdAt)}>
          <span>{`${formatDistance(new Date(request.createdAt), new Date())} ago`}</span>
        </Tooltip>
      )
    },
    {
      id: "status",
      header: "Status",
      grow: true,
      minWidth: 280,
      render: (request) => {
        const display = displayOf({
          request,
          userId: user.id,
          isRetrying: isRetrying(request.id),
          delegatedName: delegatedName(request)
        });
        const statusText = (
          <StatusText tone={display.tone} icon={display.icon} loading={display.loading}>
            {display.label}
          </StatusText>
        );
        const expiresAt = request.expiresAt ? new Date(request.expiresAt) : undefined;
        const expiringSoon =
          expiresAt &&
          request.status === ApprovalStatus.PENDING &&
          getAccessRequestState(request) !== "expired";
        return (
          <Inline gap={8} align="center" wrap={false}>
            {display.tooltip ? (
              <Tooltip content={display.tooltip}>
                <span>{statusText}</span>
              </Tooltip>
            ) : (
              statusText
            )}
            {expiringSoon && (
              <Tooltip content={`Expires ${stamp(expiresAt)}`}>
                <Badge
                  tabIndex={0}
                  tone={expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000 ? "bad" : "warn"}
                >
                  {formatDistance(expiresAt, new Date())}
                </Badge>
              </Tooltip>
            )}
          </Inline>
        );
      }
    }
  ];

  const noPolicies = !policiesPending && !policies?.length;
  const fields = [
    {
      key: "environment",
      label: "Environment",
      type: "select" as const,
      options: environments.map((environment) => ({
        value: environment.slug,
        label: environment.name
      }))
    },
    ...(canReadMembers
      ? [
          {
            key: "requestedBy",
            label: "Requested by",
            type: "select" as const,
            searchable: true,
            options: (members ?? []).map((member) => ({ value: member.id, label: member.username }))
          }
        ]
      : []),
    ...(status === "close"
      ? [
          {
            key: "closedStatus",
            label: "Status",
            type: "multi-select" as const,
            options: CLOSED_STATES
          }
        ]
      : [])
  ];

  const clearFilters = () => {
    setSearch("");
    setFilters([]);
    setPage(1);
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Access request filters"
        fields={fields}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search access requests"
            placeholder="Search by requesting user or environment..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Inline gap={8} align="center" wrap={false}>
            <ToggleGroup
              type="single"
              aria-label="Request status"
              value={status}
              onValueChange={(next) => {
                if (!next) return;
                setStatus(next as "open" | "close");
                setFilters((current) =>
                  current.filter((filter) => filter.field !== "closedStatus")
                );
                setPage(1);
              }}
            >
              <ToggleGroupItem value="open">
                Pending <Count tone="neutral">{count?.pendingCount ?? 0}</Count>
              </ToggleGroupItem>
              <ToggleGroupItem value="close">
                Closed <Count tone="neutral">{count?.finalizedCount ?? 0}</Count>
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="accent"
              icon="plus"
              loading={policiesPending && Boolean(projectSlug)}
              disabledReason={
                noPolicies
                  ? "To submit access requests, your project needs access request policies first."
                  : undefined
              }
              onClick={() => {
                if (license && !license.secretApproval) {
                  openUpgradeGate({
                    intent: SecretAccessRequestsUpgradeIntent,
                    paywallKey: "secret-manager.access-approval-request"
                  });
                  return;
                }
                setRequesting(true);
              }}
            >
              Request access
            </Button>
          </Inline>
        }
      />
      <DataTable
        label="Access requests"
        rows={sorted.slice((page - 1) * perPage, page * perPage)}
        columns={columns}
        loading={isPending}
        getRowId={(request) => request.id}
        rowLabel={(request) =>
          `${environmentName(request.environmentName)} ${request.policy.secretPath ?? ""}`
        }
        sort={sort}
        onSortChange={setSort}
        onRowActivate={(request) => onOpenRequest(request.id)}
        empty={
          isFiltered ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="No requests match these filters"
              actions={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="inbox"
              title={status === "open" ? "No pending access requests" : "No closed access requests"}
              description={
                status === "close"
                  ? "Approved, rejected, revoked and expired requests show up here."
                  : undefined
              }
              actions={
                canCreatePolicies && noPolicies ? (
                  <Button variant="outline" icon="plus" onClick={onConfigurePolicies}>
                    Configure policy
                  </Button>
                ) : undefined
              }
            />
          )
        }
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Access request pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={filtered.length}
              pageSize={perPage}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPerPage(next);
                setPage(1);
                setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
              }}
            />
          ) : undefined
        }
      />
      {requesting && policies && project && (
        <RequestAccessSheet
          project={project}
          policies={policies}
          honeyTokens={Boolean(license?.honeyTokens)}
          onClose={() => setRequesting(false)}
        />
      )}
      {selected && project && (
        <ReviewRequestSheet
          key={selected.id}
          project={project}
          request={selected}
          policies={policies ?? []}
          members={members ?? []}
          requester={requesterOf(selected)}
          delegatedName={delegatedName(selected)}
          isRetrying={isRetrying(selected.id)}
          onClose={() => onOpenRequest("")}
        />
      )}
      {upgradeGate}
    </Stack>
  );
};
