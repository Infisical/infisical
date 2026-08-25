import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import {
  BanIcon,
  CheckIcon,
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
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  const { data: members } = useGetWorkspaceUsers(projectId, true);
  const { requestId } = search;
  const handleCloseRequestDetail = () => {
    navigate({ search: (prev) => ({ ...prev, requestId: "" }) });
    refetch();
  };

  const isRequestListEmpty = !isApprovalRequestLoading && secretApprovalRequests?.length === 0;
  const isFiltered = Boolean(searchFilter || envFilter || committerFilter);

  const environmentNamesBySlug = (currentProject?.environments ?? []).reduce<
    Record<string, string>
  >((prev, curr) => ({ ...prev, [curr.slug]: curr.name }), {});
  const environmentOptions = (currentProject?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  const authorOptions = (members ?? []).map(({ user }) => ({
    value: user.id,
    label: user.username
  }));

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
          <div className="mb-4 flex flex-wrap items-center gap-2 @6xl:flex-nowrap">
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
                  <GitPullRequestIcon className="mr-1.5 size-3.5" />
                  {secretApprovalRequestCount?.open ?? 0} Open
                </TabsTrigger>
                <TabsTrigger value="close">
                  <CheckIcon className="mr-1.5 size-3.5" />
                  {secretApprovalRequestCount?.closed ?? 0} Closed
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2 @6xl:mr-auto @6xl:flex-nowrap">
              <InputGroup className="@6xl:w-[26rem]">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search by author, environment, path or secret..."
                />
              </InputGroup>
            </div>
            <Combobox
              aria-label="Filter environments"
              className="w-[200px]"
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
            {permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) && (
              <Combobox
                aria-label="Filter authors"
                className="w-[220px]"
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
                  <TableHead>Environment</TableHead>
                  <TableHead>Secret Path</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-5" />
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
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {secretApprovalRequests.map((secretApproval) => {
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
                    slug,
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GitPullRequestIcon className="size-3.5 shrink-0 text-muted" />
                          <span className="text-foreground">
                            {generateCommitText(commits, isReplicated)}
                          </span>
                          <span className="text-xs text-muted">#{slug}</span>
                        </div>
                      </TableCell>
                      <TableCell isTruncatable className="w-1/2">
                        {environmentDisplayName}
                      </TableCell>
                      <TableCell isTruncatable className="w-1/2">
                        <p className="truncate text-foreground">{policy.secretPath}</p>
                      </TableCell>
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
