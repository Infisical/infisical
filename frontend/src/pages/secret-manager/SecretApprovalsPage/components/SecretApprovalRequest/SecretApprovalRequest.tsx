import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ChevronsUpDownIcon,
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
  Button,
  Card,
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
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { ApprovalStatus } from "@app/hooks/api/types";

import {
  generateCommitText,
  SecretApprovalRequestChanges
} from "./components/SecretApprovalRequestChanges";

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
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setInputValue("");
      }}
    >
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

export const SecretApprovalRequest = () => {
  const { currentProject, projectId } = useProject();

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
        <CardContent className="flex flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2 2xl:flex-nowrap">
            <Tabs
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as "open" | "close")}
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
            <div className="flex flex-wrap items-center gap-2 2xl:mr-auto 2xl:flex-nowrap">
              <InputGroup className="xl:w-[26rem]">
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
                searchPlaceholder="Filter authors"
                allLabel="All Authors"
                value={committerFilter}
                onChange={setCommitterFilter}
                options={(members ?? []).map(({ user }) => ({
                  value: user.id,
                  label: user.username
                }))}
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
                    : null;

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
                        {committerUser ? (
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{committerName}</span>
                            {committerUserId === userSession.id && (
                              <Badge variant="neutral">You</Badge>
                            )}
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
