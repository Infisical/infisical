/* eslint-disable no-nested-ternary */
/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useMemo, useState } from "react";
import { format, formatDistance } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  EyeIcon,
  FilterIcon,
  HourglassIcon,
  LucideIcon,
  PlusIcon,
  SearchIcon,
  ShieldBanIcon,
  TimerIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription,
  useUser
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  accessApprovalKeys,
  useGetAccessApprovalPolicies,
  useGetAccessApprovalRequests,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { queryClient } from "@app/hooks/api/reactQuery";
import { ApprovalStatus, TWorkspaceUser } from "@app/hooks/api/types";

import { RequestAccessModal } from "./components/RequestAccessModal";
import { ReviewAccessRequestModal } from "./components/ReviewAccessModal";
import { formatAccessDuration, parseAccessDurationMs } from "./AccessApprovalRequest.utils";

enum AccessRequestOrderBy {
  Duration = "duration",
  Environment = "environment",
  SecretPath = "secret-path",
  RequestedBy = "requested-by",
  RequestedAt = "requested-at"
}

type ClosedRequestFilter = "approved" | "expired";

const CLOSED_REQUEST_FILTERS: { label: string; value: ClosedRequestFilter }[] = [
  { label: "Approved", value: "approved" },
  { label: "Expired", value: "expired" }
];

export const AccessApprovalRequest = ({
  projectSlug,
  projectId
}: {
  projectSlug: string;
  projectId: string;
}) => {
  const [selectedRequest, setSelectedRequest] = useState<
    | (TAccessApprovalRequest & {
        user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
        isRequestedByCurrentUser: boolean;
        isSelfApproveAllowed: boolean;
        isApprover: boolean;
        isDisabled?: boolean;
      })
    | null
  >(null);

  const { handlePopUpOpen, popUp, handlePopUpClose } = usePopUp([
    "requestAccess",
    "reviewRequest",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const { data: members } = useGetWorkspaceUsers(projectId, true);
  const membersGroupById = useMemo(
    () =>
      members?.reduce<Record<string, TWorkspaceUser>>(
        (prev, curr) => ({ ...prev, [curr.user.id]: curr }),
        {}
      ),
    [members]
  );

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
  const requesterOptions = (members ?? []).map(({ user: membershipUser }) => ({
    value: membershipUser.id,
    label: membershipUser.username
  }));

  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [requestedByFilter, setRequestedByFilter] = useState<string | undefined>(undefined);
  const [envFilter, setEnvFilter] = useState<string | undefined>(undefined);
  const [closedRequestFilters, setClosedRequestFilters] = useState<ClosedRequestFilter[]>([
    "approved",
    "expired"
  ]);
  const [sort, setSort] = useState<{
    column: AccessRequestOrderBy;
    direction: Exclude<TableSortDirection, "none">;
  } | null>(null);

  const { data: requestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  const { data: policies, isPending: policiesLoading } = useGetAccessApprovalPolicies({
    projectSlug
  });

  const {
    data: requests,
    refetch: refetchRequests,
    isPending: areRequestsPending
  } = useGetAccessApprovalRequests({
    projectSlug,
    authorUserId: requestedByFilter,
    envSlug: envFilter
  });

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: getUserTablePreference("accessRequestsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("accessRequestsTable", PreferenceKey.PerPage, newPerPage);
  };

  const isRequestExpired = useCallback((request: TAccessApprovalRequest) => {
    return (
      request.status === ApprovalStatus.PENDING &&
      request.expiresAt &&
      new Date(request.expiresAt) < new Date()
    );
  }, []);

  const filteredRequests = useMemo(() => {
    let accessRequests: typeof requests;

    if (statusFilter === "open")
      accessRequests = requests?.filter(
        (request) =>
          !request.policy.deletedAt &&
          !request.isApproved &&
          request.status !== ApprovalStatus.REVOKED &&
          !request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED) &&
          !isRequestExpired(request)
      );
    else if (statusFilter === "close")
      accessRequests = requests?.filter(
        (request) =>
          request.policy.deletedAt ||
          request.isApproved ||
          request.status === ApprovalStatus.REVOKED ||
          request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED) ||
          isRequestExpired(request)
      );

    if (statusFilter === "close") {
      accessRequests = accessRequests?.filter((request) =>
        isRequestExpired(request)
          ? closedRequestFilters.includes("expired")
          : closedRequestFilters.includes("approved")
      );
    }

    return (
      accessRequests?.filter((request) => {
        const { environmentName, requestedByUser } = request;
        const environmentDisplayName = environmentNamesBySlug[environmentName] ?? environmentName;

        const searchValue = search.trim().toLowerCase();

        return (
          environmentName?.toLowerCase().includes(searchValue) ||
          environmentDisplayName?.toLowerCase().includes(searchValue) ||
          `${requestedByUser?.email ?? ""} ${requestedByUser?.firstName ?? ""} ${requestedByUser?.lastName ?? ""}`
            .toLowerCase()
            .includes(searchValue)
        );
      }) ?? []
    );
  }, [
    requests,
    statusFilter,
    requestedByFilter,
    envFilter,
    search,
    isRequestExpired,
    closedRequestFilters,
    environmentNamesBySlug
  ]);

  const sortedRequests = useMemo(() => {
    if (!sort) return filteredRequests;

    const getRequesterName = (request: TAccessApprovalRequest) => {
      const requester =
        membersGroupById?.[request.requestedByUserId]?.user || request.requestedByUser;

      return (
        [requester?.firstName, requester?.lastName].filter(Boolean).join(" ") ||
        requester?.email ||
        ""
      );
    };

    return [...filteredRequests].sort((requestOne, requestTwo) => {
      let comparison = 0;

      switch (sort.column) {
        case AccessRequestOrderBy.Duration:
          comparison =
            (requestOne.isTemporary
              ? (parseAccessDurationMs(requestOne.temporaryRange) ?? 0)
              : Number.MAX_SAFE_INTEGER) -
            (requestTwo.isTemporary
              ? (parseAccessDurationMs(requestTwo.temporaryRange) ?? 0)
              : Number.MAX_SAFE_INTEGER);
          break;
        case AccessRequestOrderBy.Environment:
          comparison = (
            environmentNamesBySlug[requestOne.environmentName] ?? requestOne.environmentName
          ).localeCompare(
            environmentNamesBySlug[requestTwo.environmentName] ?? requestTwo.environmentName
          );
          break;
        case AccessRequestOrderBy.SecretPath:
          comparison = (requestOne.policy.secretPath ?? "").localeCompare(
            requestTwo.policy.secretPath ?? ""
          );
          break;
        case AccessRequestOrderBy.RequestedBy:
          comparison = getRequesterName(requestOne).localeCompare(getRequesterName(requestTwo));
          break;
        case AccessRequestOrderBy.RequestedAt:
          comparison =
            new Date(requestOne.createdAt).getTime() - new Date(requestTwo.createdAt).getTime();
          break;
        default:
          break;
      }

      return sort.direction === "ascending" ? comparison : -comparison;
    });
  }, [environmentNamesBySlug, filteredRequests, membersGroupById, sort]);

  const getSortDirection = (column: AccessRequestOrderBy): TableSortDirection =>
    sort?.column === column ? sort.direction : "none";

  const handleSort = (column: AccessRequestOrderBy, direction: TableSortDirection) => {
    setSort(direction === "none" ? null : { column, direction });
  };

  const getSortIconClassName = (column: AccessRequestOrderBy) => {
    const direction = getSortDirection(column);

    return cn(
      "transition-transform",
      direction === "descending" && "rotate-180",
      direction === "none" && "opacity-30"
    );
  };

  useResetPageHelper({
    totalCount: filteredRequests.length,
    offset,
    setPage
  });

  const generateRequestDetails = useCallback(
    (request: TAccessApprovalRequest) => {
      const isReviewedByUser =
        request.reviewers.findIndex(({ userId }) => userId === user.id) !== -1;
      const isRejectedByAnyone = request.reviewers.some(
        ({ status }) => status === ApprovalStatus.REJECTED
      );
      const isApprover =
        request.policy.approvers.findIndex((el) => el.userId === user.id || "") !== -1;
      const isAccepted = request.isApproved;
      const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;
      const isRequestedByCurrentUser = request.requestedByUserId === user.id;
      const isSelfApproveAllowed = request.policy.allowedSelfApprovals;
      const userReviewStatus = request.reviewers.find(({ userId }) => userId === user.id)?.status;
      const canBypass =
        !request.policy.bypassers.length || request.policy.bypassers.includes(user.id);

      let displayData: {
        label: string;
        type: "warning" | "danger" | "success";
        tooltipContent?: string;
        icon: LucideIcon | null;
      } = {
        label: "",
        type: "warning",
        icon: null
      };

      const isRevoked = request.status === ApprovalStatus.REVOKED;

      const isAccessExpired =
        request.privilege &&
        request.isApproved &&
        new Date() > new Date(request.privilege.temporaryAccessEndTime || ("" as string));

      const hasRequestExpired =
        !isAccepted &&
        !isRejectedByAnyone &&
        !isRevoked &&
        request.expiresAt &&
        new Date(request.expiresAt) < new Date();

      if (hasRequestExpired)
        displayData = {
          label: "Expired",
          type: "danger",
          icon: TimerIcon,
          tooltipContent: `Expired ${format(request.expiresAt!, "M/d/yyyy h:mm aa")}`
        };
      else if (isRevoked)
        displayData = {
          label: "Revoked",
          type: "danger",
          icon: ShieldBanIcon,
          tooltipContent: request.revokedAt
            ? `Revoked ${format(request.revokedAt, "M/d/yyyy h:mm aa")}`
            : undefined
        };
      else if (isAccessExpired)
        displayData = {
          label: "Access Expired",
          type: "danger",
          icon: TimerIcon,
          tooltipContent: request.privilege?.temporaryAccessEndTime
            ? `Expired ${format(request.privilege.temporaryAccessEndTime, "M/d/yyyy h:mm aa")}`
            : undefined
        };
      else if (isAccepted)
        displayData = {
          label: "Access Granted",
          type: "success",
          icon: CheckIcon,
          tooltipContent: `Granted ${format(request.updatedAt, "M/d/yyyy h:mm aa")}`
        };
      else if (isRejectedByAnyone)
        displayData = {
          label: "Rejected",
          type: "danger",
          icon: BanIcon,
          tooltipContent: `Rejected ${format(request.updatedAt, "M/d/yyyy h:mm aa")}`
        };
      else if (userReviewStatus === ApprovalStatus.APPROVED) {
        displayData = {
          label: "Pending Additional Reviews",
          type: "warning",
          icon: ClipboardCheckIcon
        };
      } else if (!isReviewedByUser)
        displayData = {
          label: "Review Required",
          type: "warning",
          icon: ClipboardCheckIcon
        };

      return {
        displayData,
        isReviewedByUser,
        isRejectedByAnyone,
        isApprover,
        userReviewStatus,
        isAccepted,
        isSoftEnforcement,
        canBypass,
        isRequestedByCurrentUser,
        isSelfApproveAllowed
      };
    },
    [user]
  );

  const handleSelectRequest = useCallback(
    (request: TAccessApprovalRequest) => {
      const details = generateRequestDetails(request);
      const memberUser = membersGroupById?.[request.requestedByUserId]?.user;

      setSelectedRequest({
        ...request,
        user: details.isRequestedByCurrentUser
          ? user
          : memberUser || {
              firstName: request.requestedByUser?.firstName,
              lastName: request.requestedByUser?.lastName,
              email: request.requestedByUser?.email
            },
        isRequestedByCurrentUser: details.isRequestedByCurrentUser,
        isSelfApproveAllowed: details.isSelfApproveAllowed,
        isApprover: details.isApprover
      });

      handlePopUpOpen("reviewRequest");
    },
    [generateRequestDetails, membersGroupById, user, setSelectedRequest, handlePopUpOpen]
  );

  const isFiltered = Boolean(
    search ||
      envFilter ||
      requestedByFilter ||
      (statusFilter === "close" && closedRequestFilters.length < CLOSED_REQUEST_FILTERS.length)
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Access Requests
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/access-requests" />
          </CardTitle>
          <CardDescription>
            Request and review access to secrets in sensitive environments and folders
          </CardDescription>
          <CardAction>
            {(() => {
              const requestAccessButton = (
                <Button
                  onClick={() => {
                    if (subscription && !subscription?.secretApproval) {
                      handlePopUpOpen("upgradePlan", {
                        text: "Access requests feature can be unlocked if you upgrade to Infisical Pro plan."
                      });
                      return;
                    }
                    handlePopUpOpen("requestAccess");
                  }}
                  variant="project"
                  isDisabled={policiesLoading || !policies?.length}
                >
                  <PlusIcon />
                  Request Access
                </Button>
              );

              if (!policiesLoading && !policies?.length) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip surfaces on keyboard focus despite the inner button being disabled */}
                      <span tabIndex={0}>{requestAccessButton}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      To submit Access Requests, your project needs to create Access Request
                      policies first.
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return requestAccessButton;
            })()}
          </CardAction>
        </CardHeader>
        <CardContent className="@container flex flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2 @4xl:flex-nowrap">
            <InputGroup className="min-w-48 flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by requesting user or environment..."
              />
            </InputGroup>
            <div className="flex shrink-0 items-center">
              {statusFilter === "close" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      aria-label="Filter closed access requests by status"
                      className="mr-2"
                      variant={closedRequestFilters.length < 2 ? "project" : "outline"}
                    >
                      <FilterIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                    {CLOSED_REQUEST_FILTERS.map((filter) => (
                      <DropdownMenuCheckboxItem
                        key={filter.value}
                        checked={closedRequestFilters.includes(filter.value)}
                        onClick={(event) => {
                          event.preventDefault();
                          setClosedRequestFilters((currentFilters) =>
                            currentFilters.includes(filter.value)
                              ? currentFilters.filter((value) => value !== filter.value)
                              : [...currentFilters, filter.value]
                          );
                        }}
                      >
                        {filter.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Tabs
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as "open" | "close")}
              >
                <TabsList variant="filled">
                  <TabsTrigger value="open">
                    <HourglassIcon className="size-3.5" />
                    Pending {requestCount?.pendingCount ?? 0}
                  </TabsTrigger>
                  <TabsTrigger value="close">
                    <CheckIcon className="size-3.5" />
                    Closed {requestCount?.finalizedCount ?? 0}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
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
                emptyMessage="No results found."
                placeholder="All Environments"
              />
            </div>
            {permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) && (
              <div className="w-42 shrink-0">
                <Combobox
                  aria-label="Filter users"
                  className="w-full"
                  options={requesterOptions}
                  value={
                    requesterOptions.find((option) => option.value === requestedByFilter) ?? null
                  }
                  onValueChange={(option) => setRequestedByFilter(option.value)}
                  onClear={() => setRequestedByFilter(undefined)}
                  getOptionValue={(option) => option.value}
                  getOptionLabel={(option) => option.label}
                  clearAriaLabel="Clear user filter"
                  searchPlaceholder="Filter users"
                  searchAriaLabel="Filter users"
                  emptyMessage="No results found."
                  placeholder="All Users"
                />
              </div>
            )}
          </div>
          {!areRequestsPending && filteredRequests?.length === 0 && !isFiltered && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  No {statusFilter === "open" ? "Pending" : "Closed"} Access Requests
                </EmptyTitle>
                <EmptyDescription>
                  {statusFilter === "open"
                    ? "Access requests awaiting review will appear here."
                    : "Approved, rejected, revoked, or expired access requests will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {Boolean(!filteredRequests?.length && isFiltered && !areRequestsPending) && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No Requests Match Filters</EmptyTitle>
                <EmptyDescription>
                  No access requests match your current search or filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {(areRequestsPending || !!filteredRequests?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    sortDirection={getSortDirection(AccessRequestOrderBy.Duration)}
                    onSortChange={(direction) =>
                      handleSort(AccessRequestOrderBy.Duration, direction)
                    }
                  >
                    Duration
                    <ChevronDownIcon
                      className={getSortIconClassName(AccessRequestOrderBy.Duration)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(AccessRequestOrderBy.Environment)}
                    onSortChange={(direction) =>
                      handleSort(AccessRequestOrderBy.Environment, direction)
                    }
                  >
                    Environment
                    <ChevronDownIcon
                      className={getSortIconClassName(AccessRequestOrderBy.Environment)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(AccessRequestOrderBy.SecretPath)}
                    onSortChange={(direction) =>
                      handleSort(AccessRequestOrderBy.SecretPath, direction)
                    }
                  >
                    Secret Path
                    <ChevronDownIcon
                      className={getSortIconClassName(AccessRequestOrderBy.SecretPath)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(AccessRequestOrderBy.RequestedBy)}
                    onSortChange={(direction) =>
                      handleSort(AccessRequestOrderBy.RequestedBy, direction)
                    }
                  >
                    Requested By
                    <ChevronDownIcon
                      className={getSortIconClassName(AccessRequestOrderBy.RequestedBy)}
                    />
                  </TableHead>
                  <TableHead
                    sortDirection={getSortDirection(AccessRequestOrderBy.RequestedAt)}
                    onSortChange={(direction) =>
                      handleSort(AccessRequestOrderBy.RequestedAt, direction)
                    }
                  >
                    Requested
                    <ChevronDownIcon
                      className={getSortIconClassName(AccessRequestOrderBy.RequestedAt)}
                    />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {areRequestsPending &&
                  Array.from({ length: 3 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`access-request-skeleton-${idx}`}>
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
                {sortedRequests.slice(offset, perPage * page).map((request) => {
                  const details = generateRequestDetails(request);
                  const StatusIcon = details.displayData.icon;
                  const memberUser = membersGroupById?.[request.requestedByUserId]?.user;
                  const requester = memberUser || request.requestedByUser;
                  const requesterName =
                    [requester?.firstName, requester?.lastName].filter(Boolean).join(" ") ||
                    requester?.email;
                  const isExpiringSoon =
                    request.expiresAt &&
                    request.status === ApprovalStatus.PENDING &&
                    !isRequestExpired(request);
                  const environmentDisplayName =
                    environmentNamesBySlug[request.environmentName] ?? request.environmentName;

                  return (
                    <TableRow
                      key={request.id}
                      tabIndex={0}
                      onClick={() => handleSelectRequest(request)}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") handleSelectRequest(request);
                      }}
                    >
                      <TableCell>
                        {request.isTemporary ? (
                          <Badge variant="info">
                            <TimerIcon />
                            <span className="whitespace-nowrap">
                              {(() => {
                                const rangeMs = parseAccessDurationMs(request.temporaryRange);
                                return rangeMs ? formatAccessDuration(rangeMs) : "Temporary";
                              })()}
                            </span>
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Permanent</Badge>
                        )}
                      </TableCell>
                      <TableCell title={environmentDisplayName}>{environmentDisplayName}</TableCell>
                      <TableCell title={request.policy.secretPath ?? undefined}>
                        {request.policy.secretPath}
                      </TableCell>
                      <TableCell>
                        {requester ? (
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{requesterName}</span>
                            {request.requestedByUserId === user.id && (
                              <Badge variant="neutral">You</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              {formatDistance(new Date(request.createdAt), new Date())} ago
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(request.createdAt), "M/d/yyyy h:mm aa")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {details.displayData.tooltipContent ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={details.displayData.type}>
                                  {StatusIcon && <StatusIcon />}
                                  <span className="whitespace-nowrap">
                                    {details.displayData.label}
                                  </span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{details.displayData.tooltipContent}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant={details.displayData.type}>
                              {StatusIcon && <StatusIcon />}
                              <span className="whitespace-nowrap">{details.displayData.label}</span>
                            </Badge>
                          )}
                          {isExpiringSoon && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant={
                                    new Date(request.expiresAt!).getTime() - Date.now() <
                                    24 * 60 * 60 * 1000
                                      ? "danger"
                                      : "warning"
                                  }
                                >
                                  <TimerIcon />
                                  {formatDistance(new Date(request.expiresAt!), new Date())}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Expires {format(request.expiresAt!, "M/d/yyyy h:mm aa")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
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
                            <DropdownMenuItem onClick={() => handleSelectRequest(request)}>
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
          {Boolean(filteredRequests.length) && (
            <Pagination
              count={filteredRequests.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </CardContent>
      </Card>
      {!!policies && (
        <RequestAccessModal
          policies={policies}
          isOpen={popUp.requestAccess.isOpen}
          onOpenChange={() => {
            queryClient.invalidateQueries({
              queryKey: accessApprovalKeys.getAccessApprovalRequests(
                projectSlug,
                envFilter,
                requestedByFilter
              )
            });
            handlePopUpClose("requestAccess");
          }}
        />
      )}

      {!!selectedRequest && (
        <ReviewAccessRequestModal
          policies={policies || []}
          projectSlug={projectSlug}
          request={selectedRequest}
          members={members || []}
          isOpen={popUp.reviewRequest.isOpen}
          onOpenChange={() => {
            handlePopUpClose("reviewRequest");
            setSelectedRequest(null);
            refetchRequests();
          }}
          onUpdate={(request) => {
            // scott: this isn't ideal but our current use of state makes this complicated...
            // we shouldn't be using state like this...
            handleSelectRequest({
              ...selectedRequest,
              isTemporary: request.isTemporary,
              temporaryRange: request.temporaryRange,
              reviewers: []
            });
          }}
          canBypass={generateRequestDetails(selectedRequest).canBypass}
        />
      )}

      <UpgradePlanModal
        text={popUp.upgradePlan.data?.text}
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={() => handlePopUpClose("upgradePlan")}
      />
    </>
  );
};
