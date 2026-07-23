/* eslint-disable no-nested-ternary */
/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useMemo, useState } from "react";
import { format, formatDistance } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  EyeIcon,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
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
  Label,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Switch,
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

type FilterMenuProps = {
  className?: string;
  searchPlaceholder: string;
  allLabel: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (value?: string) => void;
};

const FilterMenu = ({
  className,
  searchPlaceholder,
  allLabel,
  options,
  value,
  onChange
}: FilterMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className={cn("justify-between", className)}
        >
          <span className="truncate">{selectedOption ? selectedOption.label : allLabel}</span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[220px] p-0">
        <Command>
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {!inputValue && (
              <>
                <CommandGroup>
                  <CommandItem
                    forceMount
                    keywords={[]}
                    onSelect={() => {
                      onChange(undefined);
                      setIsOpen(false);
                    }}
                  >
                    <CheckIcon className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                    {allLabel}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => {
                    onChange(value === option.value ? undefined : option.value);
                    setIsOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr.user.id]: curr }),
    {}
  );

  const environmentNamesBySlug = useMemo(
    () =>
      (currentProject?.environments ?? []).reduce<Record<string, string>>(
        (prev, curr) => ({ ...prev, [curr.slug]: curr.name }),
        {}
      ),
    [currentProject?.environments]
  );

  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [requestedByFilter, setRequestedByFilter] = useState<string | undefined>(undefined);
  const [envFilter, setEnvFilter] = useState<string | undefined>(undefined);
  const [showExpired, setShowExpired] = useState(true);

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

    if (!showExpired && statusFilter === "close") {
      accessRequests = accessRequests?.filter((request) => !isRequestExpired(request));
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
    showExpired,
    environmentNamesBySlug
  ]);

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

  const isFiltered = Boolean(search || envFilter || requestedByFilter);

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
        <CardContent className="flex flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2 2xl:flex-nowrap">
            <Tabs
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as "open" | "close")}
            >
              <TabsList variant="filled">
                <TabsTrigger value="open">
                  <HourglassIcon className="mr-1.5 size-3.5" />
                  {requestCount?.pendingCount ?? 0} Pending
                </TabsTrigger>
                <TabsTrigger value="close">
                  <CheckIcon className="mr-1.5 size-3.5" />
                  {requestCount?.finalizedCount ?? 0} Closed
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2 2xl:mr-auto 2xl:flex-nowrap">
              <InputGroup className="xl:w-[26rem]">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by requesting user or environment..."
                />
              </InputGroup>
              {statusFilter === "close" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-expired-toggle"
                    variant="project"
                    size="sm"
                    checked={showExpired}
                    onCheckedChange={setShowExpired}
                  />
                  <Label
                    htmlFor="show-expired-toggle"
                    className="cursor-pointer text-sm font-normal"
                  >
                    Show Expired
                  </Label>
                </div>
              )}
            </div>
            <FilterMenu
              className="w-[200px]"
              searchPlaceholder="Filter environments"
              allLabel="All Environments"
              value={envFilter}
              onChange={setEnvFilter}
              options={(currentProject?.environments ?? []).map((env) => ({
                value: env.slug,
                label: env.name
              }))}
            />
            {permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) && (
              <FilterMenu
                className="w-[220px]"
                searchPlaceholder="Filter users"
                allLabel="All Users"
                value={requestedByFilter}
                onChange={setRequestedByFilter}
                options={(members ?? []).map(({ user: membershipUser }) => ({
                  value: membershipUser.id,
                  label: membershipUser.username
                }))}
              />
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
                  <TableHead>Duration</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Secret Path</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-5" />
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
                      <TableCell>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {filteredRequests?.slice(offset, perPage * page).map((request) => {
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
                      <TableCell isTruncatable className="w-1/2">
                        {environmentDisplayName}
                      </TableCell>
                      <TableCell isTruncatable className="w-1/2">
                        <p className="truncate text-foreground">{request.policy.secretPath}</p>
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
