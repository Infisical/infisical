import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  EyeIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  HourglassIcon,
  LucideIcon,
  SearchIcon
} from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  useGetSecretApprovalRequestCount,
  useGetSecretApprovalRequests,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { secretApprovalRequestKeys } from "@app/hooks/api/secretApprovalRequest/queries";
import { ApprovalStatus } from "@app/hooks/api/types";

import {
  generateCommitText,
  SecretApprovalRequestChanges
} from "./components/SecretApprovalRequestChanges";

enum ChangeRequestOrderBy {
  Environment = "environment",
  SecretPath = "secret-path",
  Author = "author",
  OpenedAt = "opened-at"
}

export const SecretApprovalRequest = () => {
  const { currentProject, projectId } = useProject();
  const queryClient = useQueryClient();

  const navigate = useNavigate({
    from: ROUTE_PATHS.SecretManager.ApprovalPage.path
  });

  // filters
  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [envFilter, setEnvFilter] = useState<string>();
  const [committerFilter, setCommitterFilter] = useState<string>();
  const [sort, setSort] = useState<{
    column: ChangeRequestOrderBy;
    direction: Exclude<TableSortDirection, "none">;
  } | null>(null);

  const {
    debouncedSearch: debouncedSearchFilter,
    search: searchFilter,
    setSearch: setSearchFilter,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    limit
  } = usePagination("", {
    initPerPage: getUserTablePreference("changeRequestsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("changeRequestsTable", PreferenceKey.PerPage, newPerPage);
  };

  const {
    data,
    isPending: isApprovalRequestLoading,
    refetch
  } = useGetSecretApprovalRequests({
    projectId,
    status: statusFilter,
    environment: envFilter,
    committer: committerFilter,
    search: debouncedSearchFilter,
    limit,
    offset
  });

  const totalApprovalCount = data?.totalCount ?? 0;
  const secretApprovalRequests = data?.approvals ?? [];

  useResetPageHelper({
    totalCount: totalApprovalCount,
    offset,
    setPage
  });

  const { data: secretApprovalRequestCount } = useGetSecretApprovalRequestCount({ projectId });
  const { user: userSession } = useUser();
  const search = useSearch({
    from: ROUTE_PATHS.SecretManager.ApprovalPage.id
  });

  const { permission } = useProjectPermission();
  const { data: members, isPending: areMembersPending } = useGetWorkspaceUsers(projectId, true);
  const { requestId } = search;
  const handleCloseRequestDetail = () => {
    navigate({ search: (prev) => ({ ...prev, requestId: "" }) });
    refetch();
  };

  const isRequestListEmpty = !isApprovalRequestLoading && secretApprovalRequests?.length === 0;
  const isFiltered = Boolean(searchFilter || envFilter || committerFilter);

  const environmentNamesBySlug = useMemo(
    () =>
      (currentProject?.environments ?? []).reduce<Record<string, string>>(
        (prev, curr) => ({ ...prev, [curr.slug]: curr.name }),
        {}
      ),
    [currentProject?.environments]
  );
  const environmentOptions = (currentProject?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  const authorOptions = (members ?? []).map(({ user }) => ({
    value: user.id,
    label: user.username
  }));

  const sortedSecretApprovalRequests = useMemo(() => {
    if (!sort) return secretApprovalRequests;

    const getCommitterName = (request: (typeof secretApprovalRequests)[number]) =>
      request.committerUser
        ? [request.committerUser.firstName, request.committerUser.lastName]
            .filter(Boolean)
            .join(" ") || request.committerUser.email
        : (request.committerIdentity?.name ?? "");

    return [...secretApprovalRequests].sort((requestOne, requestTwo) => {
      let comparison = 0;

      switch (sort.column) {
        case ChangeRequestOrderBy.Environment:
          comparison = (
            environmentNamesBySlug[requestOne.environment] ?? requestOne.environment
          ).localeCompare(environmentNamesBySlug[requestTwo.environment] ?? requestTwo.environment);
          break;
        case ChangeRequestOrderBy.SecretPath:
          comparison = (requestOne.policy.secretPath ?? "").localeCompare(
            requestTwo.policy.secretPath ?? ""
          );
          break;
        case ChangeRequestOrderBy.Author:
          comparison = getCommitterName(requestOne).localeCompare(getCommitterName(requestTwo));
          break;
        case ChangeRequestOrderBy.OpenedAt:
          comparison =
            new Date(requestOne.createdAt).getTime() - new Date(requestTwo.createdAt).getTime();
          break;
        default:
          break;
      }

      return sort.direction === "ascending" ? comparison : -comparison;
    });
  }, [environmentNamesBySlug, secretApprovalRequests, sort]);

  const getSortDirection = (column: ChangeRequestOrderBy): TableSortDirection =>
    sort?.column === column ? sort.direction : "none";

  const handleSort = (column: ChangeRequestOrderBy, direction: TableSortDirection) => {
    setSort(direction === "none" ? null : { column, direction });
  };

  const getSortIconClassName = (column: ChangeRequestOrderBy) => {
    const direction = getSortDirection(column);

    return cn(
      "transition-transform",
      direction === "descending" && "rotate-180",
      direction === "none" && "opacity-30"
    );
  };

  useEffect(() => {
    if (
      envFilter &&
      currentProject?.environments &&
      !currentProject.environments.some(({ slug }) => slug === envFilter)
    ) {
      setEnvFilter(undefined);
    }
  }, [currentProject?.environments, envFilter]);

  useEffect(() => {
    if (
      committerFilter &&
      !areMembersPending &&
      members &&
      !members.some(({ user }) => user.id === committerFilter)
    ) {
      setCommitterFilter(undefined);
    }
  }, [areMembersPending, committerFilter, members]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Change Requests
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pr-workflows" />
          </CardTitle>
          <CardDescription>Review pending and closed change requests</CardDescription>
        </CardHeader>
        <CardContent className="@container flex flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2 @4xl:flex-nowrap">
            <InputGroup className="min-w-48 flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search by author, environment, path or secret..."
              />
            </InputGroup>
            <Tabs
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as "open" | "close");
                // Refetch both the lists and the open/closed counts on toggle so
                // the table rows and the tab-label counts reflect changes made
                // elsewhere. The target list is inactive here and the count query
                // only polls every 30s, so type: "all" forces both immediately.
                queryClient.refetchQueries({
                  queryKey: secretApprovalRequestKeys.listAllForProject({ projectId }),
                  type: "all"
                });
                queryClient.refetchQueries({
                  queryKey: secretApprovalRequestKeys.count({ projectId }),
                  type: "all"
                });
              }}
            >
              <TabsList variant="filled">
                <TabsTrigger value="open">
                  <GitPullRequestIcon className="size-3.5" />
                  Open {secretApprovalRequestCount?.open ?? 0}
                </TabsTrigger>
                <TabsTrigger value="close">
                  <CheckIcon className="size-3.5" />
                  Closed {secretApprovalRequestCount?.closed ?? 0}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="w-42 shrink-0">
              <Combobox
                aria-label="Filter environments"
                className="w-full"
                options={environmentOptions}
                value={environmentOptions.find((option) => option.value === envFilter) ?? null}
                onValueChange={(option) => setEnvFilter(option.value)}
                onClear={() => setEnvFilter(undefined)}
                getOptionValue={(option) => option.value}
                getOptionLabel={(option) => option.label}
                clearAriaLabel="Clear environment filter"
                searchPlaceholder="Filter environments"
                searchAriaLabel="Filter environments"
                placeholder="All Environments"
              />
            </div>
            {permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) && (
              <div className="w-42 shrink-0">
                <Combobox
                  aria-label="Filter authors"
                  className="w-full"
                  options={authorOptions}
                  value={authorOptions.find((option) => option.value === committerFilter) ?? null}
                  onValueChange={(option) => setCommitterFilter(option.value)}
                  onClear={() => setCommitterFilter(undefined)}
                  getOptionValue={(option) => option.value}
                  getOptionLabel={(option) => option.label}
                  clearAriaLabel="Clear author filter"
                  searchPlaceholder="Filter authors"
                  searchAriaLabel="Filter authors"
                  placeholder="All Authors"
                />
              </div>
            )}
          </div>
          {isRequestListEmpty && !isFiltered && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  No {statusFilter === "open" ? "Open" : "Closed"} Change Requests
                </EmptyTitle>
                <EmptyDescription>
                  {statusFilter === "open"
                    ? "Change requests awaiting review will appear here."
                    : "Merged and rejected change requests will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {Boolean(!secretApprovalRequests.length && isFiltered && !isApprovalRequestLoading) && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No Requests Match Filters</EmptyTitle>
                <EmptyDescription>
                  No change requests match your current search or filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {(isApprovalRequestLoading || !!secretApprovalRequests.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Change</TableHead>
                  <TableHead
                    sortDirection={getSortDirection(ChangeRequestOrderBy.Environment)}
                    onSortChange={(direction) =>
                      handleSort(ChangeRequestOrderBy.Environment, direction)
                    }
                  >
                    Environment
                    <ChevronDownIcon
                      className={getSortIconClassName(ChangeRequestOrderBy.Environment)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(ChangeRequestOrderBy.SecretPath)}
                    onSortChange={(direction) =>
                      handleSort(ChangeRequestOrderBy.SecretPath, direction)
                    }
                  >
                    Secret Path
                    <ChevronDownIcon
                      className={getSortIconClassName(ChangeRequestOrderBy.SecretPath)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(ChangeRequestOrderBy.Author)}
                    onSortChange={(direction) => handleSort(ChangeRequestOrderBy.Author, direction)}
                  >
                    Author
                    <ChevronDownIcon
                      className={getSortIconClassName(ChangeRequestOrderBy.Author)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(ChangeRequestOrderBy.OpenedAt)}
                    onSortChange={(direction) =>
                      handleSort(ChangeRequestOrderBy.OpenedAt, direction)
                    }
                  >
                    Opened
                    <ChevronDownIcon
                      className={getSortIconClassName(ChangeRequestOrderBy.OpenedAt)}
                    />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isApprovalRequestLoading &&
                  Array.from({ length: 3 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`change-request-skeleton-${idx}`}>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                      <TableCell variant="action">
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {sortedSecretApprovalRequests.map((secretApproval) => {
                  const {
                    id: reqId,
                    commits,
                    createdAt,
                    reviewers,
                    status,
                    committerUser,
                    committerUserId,
                    committerIdentity,
                    hasMerged,
                    updatedAt,
                    policy,
                    environment,
                    isReplicated
                  } = secretApproval;

                  const isMergable =
                    reviewers.filter(
                      ({ status: reviewStatus }) => reviewStatus === ApprovalStatus.APPROVED
                    ).length >= policy.approvals;

                  const requiresUserReview =
                    policy.approvers.find((approver) => approver.userId === userSession.id) &&
                    !reviewers.find(({ userId }) => userId === userSession.id);

                  const environmentDisplayName = environmentNamesBySlug[environment] ?? environment;
                  const committerName = committerUser
                    ? [committerUser.firstName, committerUser.lastName].filter(Boolean).join(" ") ||
                      committerUser.email
                    : (committerIdentity?.name ?? null);

                  let statusDisplay: {
                    label: string;
                    type: "success" | "danger" | "warning" | "info";
                    icon: LucideIcon;
                    tooltipContent?: string;
                  };

                  if (status === "close") {
                    const closedAt = updatedAt
                      ? format(new Date(updatedAt), "M/d/yyyy h:mm aa")
                      : undefined;
                    statusDisplay = hasMerged
                      ? {
                          label: "Merged",
                          type: "success",
                          icon: GitMergeIcon,
                          tooltipContent: closedAt
                        }
                      : {
                          label: "Rejected",
                          type: "danger",
                          icon: BanIcon,
                          tooltipContent: closedAt
                        };
                  } else if (requiresUserReview) {
                    statusDisplay = {
                      label: "Review Required",
                      type: "warning",
                      icon: ClipboardCheckIcon
                    };
                  } else if (isMergable) {
                    statusDisplay = { label: "Pending Merge", type: "info", icon: GitMergeIcon };
                  } else {
                    statusDisplay = {
                      label: "Review in Progress",
                      type: "warning",
                      icon: HourglassIcon
                    };
                  }

                  const StatusIcon = statusDisplay.icon;

                  return (
                    <TableRow
                      key={reqId}
                      tabIndex={0}
                      onClick={() =>
                        navigate({ search: (prev) => ({ ...prev, requestId: reqId }) })
                      }
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter")
                          navigate({ search: (prev) => ({ ...prev, requestId: reqId }) });
                      }}
                    >
                      <TableCell>{generateCommitText(commits, isReplicated, true)}</TableCell>
                      <TableCell title={environmentDisplayName}>{environmentDisplayName}</TableCell>
                      <TableCell title={policy.secretPath}>{policy.secretPath}</TableCell>
                      <TableCell>
                        {committerUser || committerIdentity ? (
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{committerName}</span>
                            {committerUser && committerUserId === userSession.id && (
                              <Badge variant="neutral">You</Badge>
                            )}
                            {committerIdentity && <Badge variant="neutral">Machine</Badge>}
                          </div>
                        ) : (
                          <span className="text-muted">Deleted User</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatDistance(new Date(createdAt), new Date())} ago</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(createdAt), "M/d/yyyy h:mm aa")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {statusDisplay.tooltipContent ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={statusDisplay.type}>
                                <StatusIcon />
                                <span className="whitespace-nowrap">{statusDisplay.label}</span>
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{statusDisplay.tooltipContent}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge variant={statusDisplay.type}>
                            <StatusIcon />
                            <span className="whitespace-nowrap">{statusDisplay.label}</span>
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        variant="action"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs" aria-label="Request actions">
                              <EllipsisIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({ search: (prev) => ({ ...prev, requestId: reqId }) })
                              }
                            >
                              <EyeIcon />
                              View Request
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {Boolean(totalApprovalCount) && (
            <Pagination
              count={totalApprovalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </CardContent>
      </Card>
      <SecretApprovalRequestChanges
        approvalRequestId={requestId || ""}
        isOpen={Boolean(requestId)}
        onOpenChange={(open) => {
          if (!open) handleCloseRequestDetail();
        }}
      />
    </>
  );
};
