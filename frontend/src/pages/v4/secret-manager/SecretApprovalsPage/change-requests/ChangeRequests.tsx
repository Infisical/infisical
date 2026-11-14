import { useEffect, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format, formatDistanceToNowStrict } from "date-fns";

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
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  ApprovalStatus,
  SecretApprovalRequestOrderBy,
  type TBulkChangeRequestResult
} from "@app/hooks/api/secretApprovalRequest/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../../access/permissions";
import { toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { useGo } from "../../../links";
import { BulkReviewSheet } from "./BulkReviewSheet";
import { authorName, type ChangeRequest, ChangeSummary, pathOf } from "./parts";

const TABLE = "changeRequestsTable";
const MAX_SELECTION = 25;
const sortable: Record<string, SecretApprovalRequestOrderBy> = {
  environment: SecretApprovalRequestOrderBy.Environment,
  author: SecretApprovalRequestOrderBy.Author,
  opened: SecretApprovalRequestOrderBy.CreatedAt
};
const stamp = (value: string) => format(new Date(value), "M/d/yyyy h:mm aa");

const listStatus = (request: ChangeRequest, userId: string) => {
  if (request.status === "close")
    return request.hasMerged
      ? { label: "Merged", tone: "ok" as const, at: stamp(request.updatedAt) }
      : { label: "Rejected", tone: "bad" as const, at: stamp(request.updatedAt) };
  const needsMe =
    request.policy.approvers.some((approver) => approver.userId === userId) &&
    !request.reviewers.some((reviewer) => reviewer.userId === userId);
  if (needsMe) return { label: "Needs review", tone: "warn" as const };
  const approved = request.reviewers.filter(
    (reviewer) => reviewer.status === ApprovalStatus.APPROVED
  ).length;
  if (approved >= request.policy.approvals)
    return { label: "Pending merge", tone: "info" as const };
  return { label: "Review in progress", tone: "warn" as const };
};

export const ChangeRequests = ({
  projectId,
  environmentName,
  hrefFor,
  onConfigurePolicies
}: {
  projectId: string;
  environmentName: (slug: string) => string;
  hrefFor: (id: string) => string;
  onConfigurePolicies: () => void;
}) => {
  const secrets = useV4Adapter("secrets");
  const go = useGo();
  const { user } = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const [status, setStatus] = useState<"open" | "close">("open");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim());
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [selected, setSelected] = useState<Record<string, ChangeRequest>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);

  const { data: project } = secrets.useProject(projectId);
  const environmentFilter = filters.find((filter) => filter.field === "environment")?.values[0];
  const authorFilter = filters.find((filter) => filter.field === "author")?.values[0];
  const { data, isPending, error } = secrets.useApprovalRequests({
    projectId,
    status,
    environment: environmentFilter,
    committer: authorFilter,
    search: debouncedSearch,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy: sort ? sortable[sort.columnId] : undefined,
    orderDirection: sort?.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC
  });
  const { data: count } = secrets.useApprovalRequestCount({ projectId });
  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );
  const { data: members } = useV4Adapter("access").useProjectUsers(projectId, true);
  const canReadPolicies = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );
  const canCreatePolicies = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );
  const { data: policies } = useV4Adapter("approvalPolicies").useChangePolicies(projectId, {
    enabled: canReadPolicies && canCreatePolicies
  });
  const policiesLoaded = policies !== undefined;
  const showConfigurePolicy =
    canCreatePolicies && (!canReadPolicies || (policiesLoaded && policies?.length === 0));

  const requests = data?.approvals ?? [];
  const totalCount = data?.totalCount ?? 0;
  const isOpen = status === "open";
  const isFiltered = Boolean(debouncedSearch || environmentFilter || authorFilter);
  const selectedList = Object.values(selected).map(
    (request) => requests.find(({ id }) => id === request.id) ?? request
  );

  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(1, Math.ceil(data.totalCount / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [data, page, pageSize]);

  const clearSelection = () => {
    setSelected({});
    setFailures({});
  };
  const tooMany = () =>
    toast({
      tone: "bad",
      title: `You can select up to ${MAX_SELECTION} change requests at once`
    });
  const changeSelection = (ids: string[]) => {
    const pageIds = new Set(requests.map(({ id }) => id));
    const kept = Object.values(selected).filter(({ id }) => !pageIds.has(id));
    const picked = requests.filter(({ id }) => ids.includes(id));
    const room = MAX_SELECTION - kept.length;
    if (picked.length > room) tooMany();
    const next = [...kept, ...picked.slice(0, Math.max(0, room))];
    setSelected(Object.fromEntries(next.map((request) => [request.id, request])));
    setFailures((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => next.some((r) => r.id === id)))
    );
  };
  const refilter = () => {
    setPage(1);
  };
  const handleBulkComplete = (results: TBulkChangeRequestResult[]) => {
    const succeeded = new Set(results.filter(({ isSuccess }) => isSuccess).map(({ id }) => id));
    setSelected((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !succeeded.has(id)))
    );
    setFailures(
      Object.fromEntries(
        results
          .filter(({ isSuccess }) => !isSuccess)
          .map(({ id, errorMessage }) => [id, errorMessage ?? "This request could not be updated"])
      )
    );
  };

  const environmentOptions = (project?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  const authorOptions = (members ?? []).map(({ user: member }) => ({
    value: member.id,
    label: member.username
  }));

  const columns: DataTableColumn<ChangeRequest>[] = [
    {
      id: "change",
      header: "Change",
      primary: true,
      width: 240,
      text: (row) => row.commits.map((commit) => commit.secretKey).join(", "),
      render: (row) => (
        <RowLink link={go.link(hrefFor(row.id))} title={`Change request #${row.slug}`}>
          <ChangeSummary commits={row.commits} isReplicated={row.isReplicated} />
        </RowLink>
      )
    },
    {
      id: "environment",
      header: "Environment",
      sortable: true,
      width: 160,
      text: (row) => environmentName(row.environment),
      render: (row) => environmentName(row.environment)
    },
    {
      id: "path",
      header: "Secret path",
      mono: true,
      grow: true,
      text: pathOf,
      render: (row) => <Meta>{pathOf(row)}</Meta>
    },
    {
      id: "author",
      header: "Author",
      sortable: true,
      width: 220,
      text: authorName,
      render: (row) => (
        <Inline gap={8} wrap={false}>
          {row.committerUser || row.committerIdentity ? (
            <span>{authorName(row)}</span>
          ) : (
            <Meta mono={false}>Deleted user</Meta>
          )}
          {row.committerUser && row.committerUserId === user.id && <Badge tone="soft">You</Badge>}
          {row.committerIdentity && <Badge tone="soft">Machine</Badge>}
        </Inline>
      )
    },
    {
      id: "opened",
      header: "Opened",
      sortable: true,
      width: 132,
      render: (row) => (
        <Tooltip content={stamp(row.createdAt)}>
          <Meta mono={false}>
            {formatDistanceToNowStrict(new Date(row.createdAt), { addSuffix: true })}
          </Meta>
        </Tooltip>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 184,
      render: (row) => {
        const state = listStatus(row, user.id);
        const badge = <Badge tone={state.tone}>{state.label}</Badge>;
        return (
          <Inline gap={8} wrap={false}>
            {state.at ? <Tooltip content={state.at}>{badge}</Tooltip> : badge}
            {failures[row.id] && (
              <Tooltip content={failures[row.id]}>
                <span role="img" aria-label={`Review failed: ${failures[row.id]}`}>
                  <Icon name="alert-c" size={16} />
                </span>
              </Tooltip>
            )}
          </Inline>
        );
      }
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="inbox"
      title={isOpen ? "No open change requests" : "No closed change requests"}
      actions={
        isOpen && showConfigurePolicy ? (
          <Button onClick={onConfigurePolicies}>Configure policy</Button>
        ) : undefined
      }
    />
  );
  if (isFiltered)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No change requests match these filters"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setFilters([]);
              setSearch("");
              refilter();
            }}
          >
            Clear filters
          </Button>
        }
      />
    );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert"
        title="Change requests could not be loaded"
        description="Refresh the page to try again."
      />
    );

  return (
    <Stack gap={16}>
      <FilterBar
        label="Change request filters"
        fields={[
          {
            key: "environment",
            label: "Environment",
            type: "select",
            searchable: true,
            options: environmentOptions
          },
          ...(canReadMembers
            ? [
                {
                  key: "author",
                  label: "Author",
                  type: "select" as const,
                  searchable: true,
                  options: authorOptions
                }
              ]
            : [])
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          refilter();
        }}
        search={
          <Input
            icon="search"
            aria-label="Search change requests"
            placeholder="Search by author, environment, path or secret"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              refilter();
            }}
          />
        }
        actions={
          <ToggleGroup
            type="single"
            aria-label="Change request status"
            value={status}
            onValueChange={(next) => {
              if (!next) return;
              setStatus(next as "open" | "close");
              clearSelection();
              refilter();
            }}
          >
            <ToggleGroupItem value="open">{`Open ${count?.open ?? 0}`}</ToggleGroupItem>
            <ToggleGroupItem value="close">{`Closed ${count?.closed ?? 0}`}</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <DataTable
        label={isOpen ? "Open change requests" : "Closed change requests"}
        rows={requests}
        columns={columns}
        loading={isPending && !error}
        getRowId={(row) => row.id}
        rowLabel={(row) => `Change request #${row.slug}`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          refilter();
        }}
        selectable={isOpen}
        selectedIds={isOpen ? Object.keys(selected) : undefined}
        onSelectionChange={changeSelection}
        empty={empty}
        pagination={
          totalCount > 0 ? (
            <Pagination
              label="Change request pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                setPage(1);
              }}
            />
          ) : undefined
        }
        actionBar={
          isOpen ? (
            <FloatingActionBar
              count={selectedList.length}
              total={Math.min(
                MAX_SELECTION,
                selectedList.length + requests.filter(({ id }) => !selected[id]).length
              )}
              onSelectAll={() => changeSelection(requests.map(({ id }) => id))}
              onClear={clearSelection}
              noun={selectedList.length === 1 ? "change request" : "change requests"}
              actions={[
                { label: "Review and merge", icon: "git", onClick: () => setReviewing(true) }
              ]}
            />
          ) : undefined
        }
      />
      <BulkReviewSheet
        open={reviewing}
        onOpenChange={setReviewing}
        projectId={projectId}
        requests={selectedList}
        environmentName={environmentName}
        onComplete={handleBulkComplete}
      />
    </Stack>
  );
};
