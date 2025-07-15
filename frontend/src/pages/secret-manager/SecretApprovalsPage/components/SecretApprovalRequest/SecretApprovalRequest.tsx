import { useEffect, useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faCodeBranch,
  faCodeMerge,
  faMagnifyingGlass,
  faSearch,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSearch } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProjectPermission,
  useUser,
  useWorkspace
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination } from "@app/hooks";
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

export const SecretApprovalRequest = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);

  // filters
  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [envFilter, setEnvFilter] = useState<string>();
  const [committerFilter, setCommitterFilter] = useState<string>();
  const [usingUrlRequestId, setUsingUrlRequestId] = useState(false);

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
    workspaceId,
    status: statusFilter,
    environment: envFilter,
    committer: committerFilter,
    search: debouncedSearchFilter,
    limit,
    offset
  });

  const totalApprovalCount = data?.totalCount ?? 0;
  const secretApprovalRequests = data?.approvals ?? [];

  const { data: secretApprovalRequestCount, isSuccess: isSecretApprovalReqCountSuccess } =
    useGetSecretApprovalRequestCount({ workspaceId });
  const { user: userSession } = useUser();
  const search = useSearch({
    from: ROUTE_PATHS.SecretManager.ApprovalPage.id
  });

  const { permission } = useProjectPermission();
  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const isSecretApprovalScreen = Boolean(selectedApprovalId);
  const { requestId } = search;

  useEffect(() => {
    if (!requestId || usingUrlRequestId) return;

    setSelectedApprovalId(requestId as string);
    setUsingUrlRequestId(true);
  }, [requestId]);

  const handleGoBackSecretRequestDetail = () => {
    setSelectedApprovalId(null);
    refetch();
  };

  const isRequestListEmpty = !isApprovalRequestLoading && secretApprovalRequests?.length === 0;

  const isFiltered = Boolean(searchFilter || envFilter || committerFilter);

  return (
    <AnimatePresence mode="wait">
      {isSecretApprovalScreen ? (
        <motion.div
          key="approval-changes-details"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: 30 }}
        >
          <SecretApprovalRequestChanges
            workspaceId={workspaceId}
            approvalRequestId={selectedApprovalId || ""}
            onGoBack={handleGoBackSecretRequestDetail}
          />
        </motion.div>
      ) : (
        <motion.div
          key="approval-changes-list"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: 30 }}
          className="rounded-md text-gray-300"
        >
          <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-start gap-1">
                  <p className="text-xl font-semibold text-mineshaft-100">Change Requests</p>
                  <a
                    href="https://infisical.com/docs/documentation/platform/pr-workflows"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                      <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                      <span>Docs</span>
                      <FontAwesomeIcon
                        icon={faArrowUpRightFromSquare}
                        className="mb-[0.07rem] ml-1.5 text-[10px]"
                      />
                    </div>
                  </a>
                </div>
                <p className="text-sm text-bunker-300">Review pending and closed change requests</p>
              </div>
            </div>
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search change requests by author, environment or policy path..."
              className="flex-1"
              containerClassName="mb-4"
            />
            <div className="flex items-center space-x-8 rounded-t-md border-x border-t border-mineshaft-600 bg-mineshaft-800 px-8 py-3 text-sm">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setStatusFilter("open")}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter") setStatusFilter("open");
                }}
                className={twMerge(
                  "font-medium",
                  statusFilter === "close" && "text-gray-500 duration-100 hover:text-gray-400"
                )}
              >
                <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
                {isSecretApprovalReqCountSuccess && secretApprovalRequestCount?.open} Open
              </div>
              <div
                className={twMerge(
                  "font-medium",
                  statusFilter === "open" && "text-gray-500 duration-100 hover:text-gray-400"
                )}
                role="button"
                tabIndex={0}
                onClick={() => setStatusFilter("close")}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter") setStatusFilter("close");
                }}
              >
                <FontAwesomeIcon icon={faCheck} className="mr-2" />
                {isSecretApprovalReqCountSuccess && secretApprovalRequestCount.closed} Closed
              </div>
              <div className="flex flex-grow justify-end space-x-8">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="plain"
                      colorSchema="secondary"
                      className={envFilter ? "text-white" : "text-bunker-300"}
                      rightIcon={
                        <FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />
                      }
                    >
                      Environments
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={1}
                    className="thin-scrollbar max-h-[20rem] overflow-y-auto"
                  >
                    <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                      Select an Environment
                    </DropdownMenuLabel>
                    {currentWorkspace?.environments.map(({ slug, name }) => (
                      <DropdownMenuItem
                        onClick={() => setEnvFilter((state) => (state === slug ? undefined : slug))}
                        key={`request-filter-${slug}`}
                        icon={envFilter === slug && <FontAwesomeIcon icon={faCheckCircle} />}
                        iconPos="right"
                      >
                        {name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {!!permission.can(
                  ProjectPermissionMemberActions.Read,
                  ProjectPermissionSub.Member
                ) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button
                        variant="plain"
                        colorSchema="secondary"
                        className={committerFilter ? "text-white" : "text-bunker-300"}
                        rightIcon={
                          <FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />
                        }
                      >
                        Author
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={1}
                      className="thin-scrollbar max-h-[20rem] overflow-y-auto"
                    >
                      <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                        Select an Author
                      </DropdownMenuLabel>
                      {members?.map(({ user, id }) => (
                        <DropdownMenuItem
                          onClick={() =>
                            setCommitterFilter((state) => (state === user.id ? undefined : user.id))
                          }
                          key={`request-filter-member-${id}`}
                          icon={
                            committerFilter === user.id && <FontAwesomeIcon icon={faCheckCircle} />
                          }
                          iconPos="right"
                        >
                          {user.username}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            <div className="flex flex-col rounded-b-md border-x border-b border-t border-mineshaft-600 bg-mineshaft-800">
              {isRequestListEmpty && !isFiltered && (
                <div className="py-12">
                  <EmptyState
                    title={`No ${statusFilter === "open" ? "Open" : "Closed"} Change Requests`}
                  />
                </div>
              )}
              {secretApprovalRequests.map((secretApproval) => {
                const {
                  id: reqId,
                  commits,
                  createdAt,
                  reviewers,
                  status,
                  committerUser,
                  hasMerged,
                  updatedAt
                } = secretApproval;
                const isReviewed = reviewers.some(
                  ({ status: reviewStatus, userId }) =>
                    userId === userSession.id && reviewStatus === ApprovalStatus.APPROVED
                );
                return (
                  <div
                    key={reqId}
                    className="flex border-b border-mineshaft-600 px-8 py-3 last:border-b-0 hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedApprovalId(secretApproval.id)}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") setSelectedApprovalId(secretApproval.id);
                    }}
                  >
                    <div className="flex flex-col">
                      <div className="mb-1 text-sm">
                        <FontAwesomeIcon
                          icon={faCodeBranch}
                          size="sm"
                          className="mr-1.5 text-mineshaft-300"
                        />
                        {secretApproval.isReplicated
                          ? `${commits.length} secret pending import`
                          : generateCommitText(commits)}
                        <span className="text-xs text-bunker-300"> #{secretApproval.slug}</span>
                      </div>
                      <span className="text-xs leading-3 text-gray-500">
                        Opened {formatDistance(new Date(createdAt), new Date())} ago by{" "}
                        {committerUser ? (
                          <>
                            {committerUser?.firstName || ""} {committerUser?.lastName || ""} (
                            {committerUser?.email})
                          </>
                        ) : (
                          <span className="text-gray-600">Deleted User</span>
                        )}
                        {!isReviewed && status === "open" && " - Review required"}
                      </span>
                    </div>
                    {status === "close" && (
                      <Tooltip
                        content={updatedAt ? format(new Date(updatedAt), "M/dd/yyyy h:mm a") : ""}
                      >
                        <div className="my-auto ml-auto">
                          <Badge
                            variant={hasMerged ? "success" : "danger"}
                            className="flex h-min items-center gap-1"
                          >
                            <FontAwesomeIcon icon={hasMerged ? faCodeMerge : faXmark} />
                            {hasMerged ? "Merged" : "Rejected"}
                          </Badge>
                        </div>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
              {Boolean(
                !secretApprovalRequests.length && isFiltered && !isApprovalRequestLoading
              ) && (
                <div className="py-12">
                  <EmptyState title="No Requests Match Filters" icon={faSearch} />
                </div>
              )}
              {Boolean(totalApprovalCount) && (
                <Pagination
                  className="border-none"
                  count={totalApprovalCount}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
              {isApprovalRequestLoading && (
                <div>
                  {Array.apply(0, Array(3)).map((_x, index) => (
                    <div
                      key={`approval-request-loading-${index + 1}`}
                      className="flex flex-col px-8 py-4 hover:bg-mineshaft-700"
                    >
                      <div className="mb-2 flex items-center">
                        <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
                        <Skeleton className="w-1/4 bg-mineshaft-600" />
                      </div>
                      <Skeleton className="w-1/2 bg-mineshaft-600" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
