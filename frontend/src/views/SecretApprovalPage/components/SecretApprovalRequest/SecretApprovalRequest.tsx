import { Fragment, useState } from "react";
import {
  faCheck,
  faCheckCircle,
  faChevronDown,
  faCodeBranch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetSecretApprovalRequests, useGetWorkspaceUsers } from "@app/hooks/api";
import { TSecretApprovalRequest, TWorkspaceUser } from "@app/hooks/api/types";

import {
  generateCommitText,
  SecretApprovalRequestChanges
} from "./components/SecretApprovalRequestChanges";

export const SecretApprovalRequest = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";
  const [selectedApproval, setSelectedApproval] = useState<TSecretApprovalRequest | null>(null);

  // filters
  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [envFilter, setEnvFilter] = useState<string>();
  const [committerFilter, setCommitterFilter] = useState<string>();

  const {
    data: secretApprovalRequests,
    isFetchingNextPage: isFetchingNextApprovalRequest,
    fetchNextPage: fetchNextApprovalRequest,
    hasNextPage: hasNextApprovalPage,
    refetch
  } = useGetSecretApprovalRequests({
    workspaceId,
    status: statusFilter,
    environment: envFilter,
    committer: committerFilter
  });
  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr._id]: curr }),
    {}
  );
  const isSecretApprovalScreen = Boolean(selectedApproval);

  const handleGoBackSecretRequestDetail = () => {
    setSelectedApproval(null);
    refetch({ refetchPage: (_page, index) => index === 0 });
  };

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
            members={membersGroupById}
            approvalRequestId={selectedApproval?._id || ""}
            onGoBack={handleGoBackSecretRequestDetail}
            committer={membersGroupById?.[selectedApproval?.committer || ""]}
          />
        </motion.div>
      ) : (
        <motion.div
          key="approval-changes-list"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: -30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
          className="rounded-md text-gray-300"
        >
          <div className="p-4 px-8 flex items-center space-x-8 bg-mineshaft-800">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter("open")}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") setStatusFilter("open");
              }}
              className={statusFilter === "close" ? "text-gray-500" : ""}
            >
              <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
              27 Open
            </div>
            <div
              className={statusFilter === "open" ? "text-gray-500" : ""}
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter("close")}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") setStatusFilter("close");
              }}
            >
              <FontAwesomeIcon icon={faCheck} className="mr-2" />
              27 Closed
            </div>
            <div className="flex-grow flex justify-end space-x-8">
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
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    className={committerFilter ? "text-white" : "text-bunker-300"}
                    rightIcon={<FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />}
                  >
                    Author
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Select an author</DropdownMenuLabel>
                  {members?.map(({ user, _id }) => (
                    <DropdownMenuItem
                      onClick={() =>
                        setCommitterFilter((state) => (state === _id ? undefined : _id))
                      }
                      key={`request-filter-member-${_id}`}
                      icon={committerFilter === _id && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      {user.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-col border-t border-mineshaft-600 bg-mineshaft-800">
            {secretApprovalRequests?.pages?.map((group, i) => (
              <Fragment key={`secret-approval-request-${i + 1}`}>
                {group?.map((secretApproval) => {
                  const { _id: reqId, commits, committer } = secretApproval;
                  return (
                    <div
                      key={reqId}
                      className="flex flex-col px-8 py-4 hover:bg-mineshaft-700"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedApproval(secretApproval)}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") setSelectedApproval(secretApproval);
                      }}
                    >
                      <div className="mb-1">
                        <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
                        {generateCommitText(commits)}
                      </div>
                      <span className="text-xs text-gray-500">
                        Opened 2 hours ago by {membersGroupById?.[committer]?.user?.firstName}{" "}
                        {membersGroupById?.[committer]?.user?.lastName} (
                        {membersGroupById?.[committer]?.user?.email}) - Review required
                      </span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
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
