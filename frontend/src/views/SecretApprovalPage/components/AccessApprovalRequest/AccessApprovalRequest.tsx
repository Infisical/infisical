/* eslint-disable no-nested-ternary */
/* eslint-disable react/jsx-no-useless-fragment */
import { useMemo, useState } from "react";
import {
  faCheck,
  faCheckCircle,
  faChevronDown,
  faLock,
  faPlus
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
  Tooltip,
  UpgradePlanModal
} from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useUser,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  accessApprovalKeys,
  useGetAccessApprovalPolicies,
  useGetAccessApprovalRequests,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { ApprovalStatus, TWorkspaceUser } from "@app/hooks/api/types";
import { queryClient } from "@app/reactQuery";

import { RequestAccessModal } from "./components/RequestAccessModal";
import { ReviewAccessRequestModal } from "./components/ReviewAccessModal";

const generateRequestText = (request: TAccessApprovalRequest, userId: string) => {
  const { isTemporary } = request;

  return (
    <div className="flex w-full items-center justify-between text-sm">
      <div>
        Requested {isTemporary ? "temporary" : "permanent"} access to{" "}
        <code className="mx-1 rounded-sm bg-primary-500/20 px-1.5 py-0.5 font-mono text-xs text-primary">
          {request.policy.secretPath}
        </code>
        in
        <code className="mx-1 rounded-sm bg-primary-500/20 px-1.5 py-0.5 font-mono text-xs text-primary">
          {request.environmentName}
        </code>
      </div>
      <div>
        {request.requestedByUserId === userId && (
          <span className="text-xs text-gray-500">
            <Badge className="ml-1">Requested By You</Badge>
          </span>
        )}
      </div>
    </div>
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
        user: TWorkspaceUser["user"] | null;
        isRequestedByCurrentUser: boolean;
        isApprover: boolean;
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
  const { currentWorkspace } = useWorkspace();

  const { data: members } = useGetWorkspaceUsers(projectId, true);
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr.user.id]: curr }),
    {}
  );

  console.log("membersGroupById", membersGroupById);

  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [requestedByFilter, setRequestedByFilter] = useState<string | undefined>(undefined);
  const [envFilter, setEnvFilter] = useState<string | undefined>(undefined);

  const { data: requestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  const { data: policies, isLoading: policiesLoading } = useGetAccessApprovalPolicies({
    projectSlug
  });

  const { data: requests } = useGetAccessApprovalRequests({
    projectSlug,
    authorProjectMembershipId: requestedByFilter,
    envSlug: envFilter
  });

  const filteredRequests = useMemo(() => {
    if (statusFilter === "open")
      return requests?.filter(
        (request) =>
          !request.isApproved &&
          !request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
      );
    if (statusFilter === "close")
      return requests?.filter(
        (request) =>
          request.isApproved ||
          request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
      );

    return requests;
  }, [requests, statusFilter, requestedByFilter, envFilter]);

  const generateRequestDetails = (request: TAccessApprovalRequest) => {
    console.log(request);

    const isReviewedByUser = request.reviewers.findIndex(({ member }) => member === user.id) !== -1;
    const isRejectedByAnyone = request.reviewers.some(
      ({ status }) => status === ApprovalStatus.REJECTED
    );
    const isApprover = request.policy.approvers.indexOf(user.id || "") !== -1;
    const isAccepted = request.isApproved;
    const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;
    const isRequestedByCurrentUser = request.requestedByUserId === user.id;

    const userReviewStatus = request.reviewers.find(({ member }) => member === user.id)?.status;

    let displayData: { label: string; type: "primary" | "danger" | "success" } = {
      label: "",
      type: "primary"
    };

    const isExpired =
      request.privilege &&
      request.isApproved &&
      new Date() > new Date(request.privilege.temporaryAccessEndTime || ("" as string));

    if (isExpired) displayData = { label: "Access Expired", type: "danger" };
    else if (isAccepted) displayData = { label: "Access Granted", type: "success" };
    else if (isRejectedByAnyone) displayData = { label: "Rejected", type: "danger" };
    else if (userReviewStatus === ApprovalStatus.APPROVED) {
      displayData = {
        label: `Pending ${request.policy.approvals - request.reviewers.length} review${
          request.policy.approvals - request.reviewers.length > 1 ? "s" : ""
        }`,
        type: "primary"
      };
    } else if (!isReviewedByUser)
      displayData = {
        label: "Review Required",
        type: "primary"
      };

    return {
      displayData,
      isReviewedByUser,
      isRejectedByAnyone,
      isApprover,
      userReviewStatus,
      isAccepted,
      isSoftEnforcement,
      isRequestedByCurrentUser
    };
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-mineshaft-100">Access Requests</span>
          <div className="mt-2 text-sm text-bunker-300">
            Request access to secrets in sensitive environments and folders.
          </div>
        </div>
        <div>
          <Tooltip
            content="To submit Access Requests, your project needs to create Access Request policies first."
            isDisabled={policiesLoading || !!policies?.length}
          >
            <Button
              onClick={() => {
                if (subscription && !subscription?.secretApproval) {
                  handlePopUpOpen("upgradePlan");
                  return;
                }
                handlePopUpOpen("requestAccess");
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              isDisabled={policiesLoading || !policies?.length}
            >
              Request access
            </Button>
          </Tooltip>
        </div>
      </div>

      <AnimatePresence>
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
              <FontAwesomeIcon icon={faLock} className="mr-2" />
              {!!requestCount && requestCount?.pendingCount} Pending
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
              {!!requestCount && requestCount.finalizedCount} Completed
            </div>
            <div className="flex flex-grow justify-end space-x-8">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    className="text-bunker-300"
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
                      className={requestedByFilter ? "text-white" : "text-bunker-300"}
                      rightIcon={
                        <FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />
                      }
                    >
                      Requested By
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Select an author</DropdownMenuLabel>
                    {members?.map(({ user: membershipUser, id }) => (
                      <DropdownMenuItem
                        onClick={() =>
                          setRequestedByFilter((state) => (state === id ? undefined : id))
                        }
                        key={`request-filter-member-${id}`}
                        icon={requestedByFilter === id && <FontAwesomeIcon icon={faCheckCircle} />}
                        iconPos="right"
                      >
                        {membershipUser.username}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className="flex flex-col rounded-b-md border-x border-t border-b border-mineshaft-600 bg-mineshaft-800">
            {filteredRequests?.length === 0 && (
              <div className="py-12">
                <EmptyState title="No more access requests pending." />
              </div>
            )}
            {!!filteredRequests?.length &&
              filteredRequests?.map((request) => {
                const details = generateRequestDetails(request);

                return (
                  <div
                    aria-disabled={
                      details.isReviewedByUser || details.isRejectedByAnyone || details.isAccepted
                    }
                    key={request.id}
                    className="flex w-full cursor-pointer px-8 py-4 hover:bg-mineshaft-700 aria-disabled:opacity-80"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (
                        (!details.isApprover ||
                          details.isReviewedByUser ||
                          details.isRejectedByAnyone ||
                          details.isAccepted) &&
                        !(
                          details.isSoftEnforcement &&
                          details.isRequestedByCurrentUser &&
                          !details.isAccepted
                        )
                      )
                        return;

                      setSelectedRequest({
                        ...request,
                        user: membersGroupById?.[request.requestedByUserId].user!,
                        isRequestedByCurrentUser: details.isRequestedByCurrentUser,
                        isApprover: details.isApprover
                      });
                      handlePopUpOpen("reviewRequest");
                    }}
                    onKeyDown={(evt) => {
                      if (
                        !details.isApprover ||
                        details.isAccepted ||
                        details.isReviewedByUser ||
                        details.isRejectedByAnyone
                      )
                        return;
                      if (evt.key === "Enter") {
                        setSelectedRequest({
                          ...request,
                          user: membersGroupById?.[request.requestedByUserId].user!,
                          isRequestedByCurrentUser: details.isRequestedByCurrentUser,
                          isApprover: details.isApprover
                        });
                        handlePopUpOpen("reviewRequest");
                      }
                    }}
                  >
                    <div className="w-full">
                      <div className="flex w-full flex-col justify-between">
                        <div className="mb-1 flex w-full items-center">
                          <FontAwesomeIcon icon={faLock} className="mr-2" />
                          {generateRequestText(request, user.id)}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            {membersGroupById?.[request.requestedByUserId]?.user && (
                              <>
                                Requested {formatDistance(new Date(request.createdAt), new Date())}{" "}
                                ago by{" "}
                                {membersGroupById?.[request.requestedByUserId]?.user?.firstName}{" "}
                                {membersGroupById?.[request.requestedByUserId]?.user?.lastName} (
                                {membersGroupById?.[request.requestedByUserId]?.user?.email}){" "}
                              </>
                            )}
                          </div>
                          <div>
                            {details.isApprover && (
                              <Badge variant={details.displayData.type}>
                                {details.displayData.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      </AnimatePresence>

      {!!policies && (
        <RequestAccessModal
          policies={policies}
          isOpen={popUp.requestAccess.isOpen}
          onOpenChange={() => {
            queryClient.invalidateQueries(
              accessApprovalKeys.getAccessApprovalRequests(
                projectSlug,
                envFilter,
                requestedByFilter
              )
            );
            handlePopUpClose("requestAccess");
          }}
        />
      )}

      {!!selectedRequest && (
        <ReviewAccessRequestModal
          selectedEnvSlug={envFilter}
          selectedRequester={requestedByFilter}
          projectSlug={projectSlug}
          request={selectedRequest}
          isOpen={popUp.reviewRequest.isOpen}
          onOpenChange={() => {
            handlePopUpClose("reviewRequest");
            setSelectedRequest(null);
          }}
        />
      )}

      <UpgradePlanModal
        text="You need to upgrade your plan to access this feature"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={() => handlePopUpClose("upgradePlan")}
      />
    </div>
  );
};
