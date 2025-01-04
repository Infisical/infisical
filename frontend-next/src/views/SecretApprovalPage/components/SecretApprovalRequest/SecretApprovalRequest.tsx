import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  faCheck,
  faCheckCircle,
  faChevronDown,
  faCodeBranch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useUser,
  useWorkspace
} from "@app/context";
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
    data: secretApprovalRequests,
    isFetchingNextPage: isFetchingNextApprovalRequest,
    fetchNextPage: fetchNextApprovalRequest,
    hasNextPage: hasNextApprovalPage,
    isLoading: isApprovalRequestLoading,
    refetch
  } = useGetSecretApprovalRequests({
    workspaceId,
    status: statusFilter,
    environment: envFilter,
    committer: committerFilter
  });
  const { data: secretApprovalRequestCount, isSuccess: isSecretApprovalReqCountSuccess } =
    useGetSecretApprovalRequestCount({ workspaceId });
  const { user: userSession } = useUser();
  const router = useRouter();
  const { permission } = useProjectPermission();
  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const isSecretApprovalScreen = Boolean(selectedApprovalId);
  const { requestId } = router.query;

  useEffect(() => {
    if (!requestId || usingUrlRequestId) return;

    setSelectedApprovalId(requestId as string);
    setUsingUrlRequestId(true);
  }, [requestId]);

  const handleGoBackSecretRequestDetail = () => {
    setSelectedApprovalId(null);
    refetch({ refetchPage: (_page, index) => index === 0 });
  };

  const isRequestListEmpty =
    !isApprovalRequestLoading && secretApprovalRequests?.pages[0]?.length === 0;

  return (
    <AnimatePresence exitBeforeEnter>
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
          <div className="flex items-center space-x-8 rounded-t-md border-x border-t border-mineshaft-600 bg-mineshaft-800 p-4 px-8">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter("open")}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") setStatusFilter("open");
              }}
              className={
                statusFilter === "close" ? "text-gray-500 duration-100 hover:text-gray-400" : ""
              }
            >
              <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
              {isSecretApprovalReqCountSuccess && secretApprovalRequestCount?.open} Open
            </div>
            <div
              className={
                statusFilter === "open" ? "text-gray-500 duration-100 hover:text-gray-400" : ""
              }
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
                <DropdownMenuTrigger>
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    className={envFilter ? "text-white" : "text-bunker-300"}
                    rightIcon={<FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />}
                  >
                    Environments
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Select an environment</DropdownMenuLabel>
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
              {!!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Member) && (
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
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Select an author</DropdownMenuLabel>
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
          <div className="flex flex-col rounded-b-md border-x border-t border-b border-mineshaft-600 bg-mineshaft-800">
            {isRequestListEmpty && (
              <div className="py-12">
                <EmptyState title="No more requests pending." />
              </div>
            )}
            {secretApprovalRequests?.pages?.map((group, i) => (
              <Fragment key={`secret-approval-request-${i + 1}`}>
                {group?.map((secretApproval) => {
                  const {
                    id: reqId,
                    commits,
                    createdAt,
                    reviewers,
                    status,
                    committerUser,
                    isReplicated: isReplication
                  } = secretApproval;
                  const isReviewed = reviewers.some(
                    ({ status: reviewStatus, userId }) =>
                      userId === userSession.id && reviewStatus === ApprovalStatus.APPROVED
                  );
                  return (
                    <div
                      key={reqId}
                      className="flex flex-col px-8 py-4 hover:bg-mineshaft-700"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedApprovalId(secretApproval.id)}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") setSelectedApprovalId(secretApproval.id);
                      }}
                    >
                      <div className="mb-1">
                        <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
                        {generateCommitText(commits)}
                        <span className="text-xs text-bunker-300"> #{secretApproval.slug}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        Opened {formatDistance(new Date(createdAt), new Date())} ago by{" "}
                        {committerUser?.firstName || ""} {committerUser?.lastName || ""} (
                        {committerUser?.email}){isReplication && " via replication"}
                        {!isReviewed && status === "open" && " - Review required"}
                      </span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
            {(isFetchingNextApprovalRequest || isApprovalRequestLoading) && (
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
          {hasNextApprovalPage && (
            <Button
              className="mt-4 text-sm"
              isFullWidth
              variant="star"
              isLoading={isFetchingNextApprovalRequest}
              isDisabled={isFetchingNextApprovalRequest || !hasNextApprovalPage}
              onClick={() => fetchNextApprovalRequest()}
            >
              {hasNextApprovalPage ? "Load More" : "End of history"}
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
