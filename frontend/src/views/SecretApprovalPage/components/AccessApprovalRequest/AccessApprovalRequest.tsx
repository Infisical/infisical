/* eslint-disable no-nested-ternary */
/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useMemo, useState } from "react";
import {
  faCheck,
  faCheckCircle,
  faChevronDown,
  faLockOpen
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import ms from "ms";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Modal,
  ModalContent,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetWorkspaceUsers, useReviewAccessRequest } from "@app/hooks/api";
import {
  useGetAccessApprovalPolicies,
  useGetAccessApprovalRequests,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { ApprovalStatus, TAccessApprovalPolicy, TWorkspaceUser } from "@app/hooks/api/types";
import { SpecificPrivilegeSecretForm } from "@app/views/Project/MembersPage/components/MemberListTab/MemberRoleForm/SpecificPrivilegeSection";

const DisplayBadge = ({ text, className }: { text: string; className?: string }) => {
  return (
    <div
      className={twMerge(
        "ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100",
        className
      )}
    >
      {text}
    </div>
  );
};

const ReviewRequestModal = ({
  isOpen,
  onOpenChange,
  request,
  projectSlug,
  selectedRequester,
  selectedEnvSlug
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: TAccessApprovalRequest & { user: TWorkspaceUser["user"] | null };
  projectSlug: string;
  selectedRequester: string | undefined;
  selectedEnvSlug: string | undefined;
}) => {
  const [isLoading, setIsLoading] = useState<"approved" | "rejected" | null>(null);

  const accessDetails = {
    env: request.environmentName,
    // secret path will be inside $glob operator
    secretPath: request.policy.secretPath,
    read: request.permissions?.some(({ action }) => action.includes(ProjectPermissionActions.Read)),
    edit: request.permissions?.some(({ action }) => action.includes(ProjectPermissionActions.Edit)),
    create: request.permissions?.some(({ action }) =>
      action.includes(ProjectPermissionActions.Create)
    ),
    delete: request.permissions?.some(({ action }) =>
      action.includes(ProjectPermissionActions.Delete)
    ),

    temporaryAccess: {
      isTemporary: request.isTemporary,
      temporaryRange: request.temporaryRange
    }
  };

  const requestedAccess = useMemo(() => {
    const access: string[] = [];
    if (accessDetails.read) access.push("Read");
    if (accessDetails.edit) access.push("Edit");
    if (accessDetails.create) access.push("Create");
    if (accessDetails.delete) access.push("Delete");

    return access.join(", ");
  }, [accessDetails]);

  const getAccessLabel = () => {
    if (!accessDetails.temporaryAccess.isTemporary || !accessDetails.temporaryAccess.temporaryRange)
      return "Permanent";

    // convert the range to human readable format
    ms(ms(accessDetails.temporaryAccess.temporaryRange), { long: true });

    return (
      <DisplayBadge
        text={`Valid for ${ms(ms(accessDetails.temporaryAccess.temporaryRange), {
          long: true
        })} after approval`}
      />
    );
  };

  const reviewAccessRequest = useReviewAccessRequest();

  const handleReview = useCallback(async (status: "approved" | "rejected") => {
    setIsLoading(status);
    try {
      await reviewAccessRequest.mutateAsync({
        requestId: request.id,
        status,
        projectSlug,
        envSlug: selectedEnvSlug,
        requestedBy: selectedRequester
      });
    } catch (error) {
      console.error(error);
      setIsLoading(null);
      return;
    }

    createNotification({
      title: `Request ${status}`,
      text: `The request has been ${status}`,
      type: status === "approved" ? "success" : "info"
    });

    setIsLoading(null);
    onOpenChange(false);
  }, []);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Review Request"
        subTitle="Review the request and approve or deny access"
      >
        <div className="text-sm">
          <span>
            <span className="font-bold">
              {request.user?.firstName} {request.user?.lastName} ({request.user?.email})
            </span>{" "}
            is requesting access to the following resource
          </span>

          <div className="mt-4">
            <div className="mb-2 lowercase">
              <span className="font-bold capitalize">Requested path: </span>
              <DisplayBadge text={accessDetails.env + accessDetails.secretPath || ""} />
            </div>

            <div className="mb-2">
              <span className="font-bold">Permissions: </span>
              <DisplayBadge text={requestedAccess} />
            </div>

            <div className="mb-2">
              <span className="font-bold">Access Type: </span>
              <span>{getAccessLabel()}</span>
            </div>
          </div>

          <div className="space-x-2">
            <Button
              isLoading={isLoading === "approved"}
              isDisabled={!!isLoading}
              onClick={() => handleReview("approved")}
              className="mt-4"
              size="xs"
            >
              Approve Request
            </Button>
            <Button
              isLoading={isLoading === "rejected"}
              isDisabled={!!isLoading}
              onClick={() => handleReview("rejected")}
              className="mt-4"
              size="xs"
              colorSchema="danger"
            >
              Reject Request
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};

const SelectAccessModal = ({
  isOpen,
  onOpenChange,
  policies
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
}) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Request Access"
        subTitle="Your role has limited permissions, please contact your administrator to gain access"
      >
        <SpecificPrivilegeSecretForm onClose={() => onOpenChange(false)} policies={policies} />
      </ModalContent>
    </Modal>
  );
};

const generateRequestText = (request: TAccessApprovalRequest) => {
  const { isTemporary } = request;

  return (
    <span className="text-sm">
      Requested {isTemporary ? "temporary" : "permanent"} access to{" "}
      <code className="mx-1 rounded-sm bg-primary-500 px-1.5 py-0.5 font-mono text-xs text-black">
        {request.policy.secretPath}
      </code>
      in
      <code className="mx-1 rounded-sm bg-primary-500 px-1.5 py-0.5 font-mono text-xs text-black">
        {request.environmentName}
      </code>
    </span>
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
    (TAccessApprovalRequest & { user: TWorkspaceUser["user"] | null }) | null
  >(null);

  const { handlePopUpOpen, popUp, handlePopUpClose } = usePopUp([
    "requestAccess",
    "reviewRequest",
    "upgradePlan"
  ] as const);
  const { permission, membership } = useProjectPermission();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { data: members } = useGetWorkspaceUsers(projectId);
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr.id]: curr }),
    {}
  );

  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [requestedByFilter, setRequestedByFilter] = useState<string | undefined>(undefined);
  const [envFilter, setEnvFilter] = useState<string | undefined>(undefined);

  console.log("requestedByFilter", requestedByFilter);
  console.log("envFilter", envFilter);

  const { data: requestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  const { data: policies, isLoading: policiesLoading } = useGetAccessApprovalPolicies({
    projectSlug,
    options: {
      enabled:
        permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
        !!projectSlug
    }
  });

  const { data: requests } = useGetAccessApprovalRequests({
    projectSlug,
    authorProjectMembershipId: requestedByFilter,
    envSlug: envFilter
  });

  const filteredRequests = useMemo(() => {
    if (statusFilter === "open") return requests?.filter((request) => !request.isApproved);
    if (statusFilter === "close") return requests?.filter((request) => request.isApproved);

    return requests;
  }, [requests, statusFilter, requestedByFilter, envFilter]);

  const generateRequestDetails = (request: TAccessApprovalRequest) => {
    const isReviewedByUser =
      request.reviewers.findIndex(({ member }) => member === membership.id) !== -1;
    const isRejectedByAnyone = request.reviewers.some(
      ({ status }) => status === ApprovalStatus.REJECTED
    );
    const isApprover = request.policy.approvers.indexOf(membership.id || "") !== -1;
    const isAccepted = request.isApproved;

    const userReviewStatus = request.reviewers.find(
      ({ member }) => member === membership.id
    )?.status;

    let displayData: { label: string; colorClass: string } = { label: "", colorClass: "" };

    const isExpired =
      request.privilege &&
      request.isApproved &&
      new Date() > new Date(request.privilege.temporaryAccessEndTime || ("" as string));

    if (isExpired) displayData = { label: "Access Expired", colorClass: "bg-red/20 text-red" };
    else if (isAccepted)
      displayData = { label: "Access Granted", colorClass: "bg-green/20 text-green" };
    else if (isRejectedByAnyone)
      displayData = { label: "Rejected", colorClass: "bg-red/20 text-red" };
    else if (userReviewStatus === ApprovalStatus.APPROVED)
      displayData = {
        label: `Pending ${request.policy.approvals - request.reviewers.length} reviews`,
        colorClass: "bg-yellow/20 text-yellow"
      };
    else if (!isReviewedByUser)
      displayData = {
        label: "Review Required",
        colorClass: "bg-yellow/20 text-yellow"
      };

    return {
      displayData,
      isReviewedByUser,
      isRejectedByAnyone,
      isApprover,
      userReviewStatus,
      isAccepted
    };
  };

  return (
    <div>
      <div className="mb-6 flex justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-mineshaft-100">Access Approval Requests</span>
          <div className="mt-2 text-sm text-bunker-300">
            Request access to secrets in sensitive environments and folders.
          </div>
        </div>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretApproval}
          >
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (subscription && !subscription?.secretApproval) {
                    handlePopUpOpen("upgradePlan");
                    return;
                  }
                  handlePopUpOpen("requestAccess");
                }}
                leftIcon={<FontAwesomeIcon icon={faLockOpen} />}
                isDisabled={!isAllowed || policiesLoading || !policies?.length}
              >
                Request access
              </Button>
            )}
          </ProjectPermissionCan>
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
              <FontAwesomeIcon icon={faLockOpen} className="mr-2" />
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
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    className={requestedByFilter ? "text-white" : "text-bunker-300"}
                    rightIcon={<FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />}
                  >
                    Requested By
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Select an author</DropdownMenuLabel>
                  {members?.map(({ user, id }) => (
                    <DropdownMenuItem
                      onClick={() =>
                        setRequestedByFilter((state) => (state === id ? undefined : id))
                      }
                      key={`request-filter-member-${id}`}
                      icon={requestedByFilter === id && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      {user.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-col rounded-b-md border-x border-t border-b border-mineshaft-600 bg-mineshaft-800">
            {filteredRequests?.length === 0 && (
              <div className="py-12">
                <EmptyState title="No more access requests pending." />
              </div>
            )}
            {!!filteredRequests?.length &&
              requests?.map((request) => {
                const details = generateRequestDetails(request);

                return (
                  <div
                    aria-disabled={details.isReviewedByUser || details.isRejectedByAnyone}
                    key={request.id}
                    className="flex cursor-pointer flex-col px-8 py-4 hover:bg-mineshaft-700 aria-disabled:opacity-80"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (details.isReviewedByUser || details.isRejectedByAnyone) return;

                      setSelectedRequest({
                        ...request,
                        user: membersGroupById?.[request.requestedBy].user!
                      });
                      handlePopUpOpen("reviewRequest");
                    }}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") {
                        setSelectedRequest({
                          ...request,
                          user: membersGroupById?.[request.requestedBy].user!
                        });
                        handlePopUpOpen("reviewRequest");
                      }
                    }}
                  >
                    <div>
                      <div className="mb-1">
                        <FontAwesomeIcon icon={faLockOpen} className="mr-2" />
                        {generateRequestText(request)}
                      </div>
                      <span className="text-xs text-gray-500">
                        Requested {formatDistance(new Date(request.createdAt), new Date())} ago by{" "}
                        {membersGroupById?.[request.requestedBy]?.user?.firstName}{" "}
                        {membersGroupById?.[request.requestedBy]?.user?.lastName} (
                        {membersGroupById?.[request.requestedBy]?.user?.email}){" "}
                        <span className="font-bold">
                          {details.isApprover &&
                            !details.isReviewedByUser &&
                            !details.isAccepted &&
                            "- Review required"}
                        </span>
                      </span>

                      {details.isApprover && (
                        <DisplayBadge
                          text={details.displayData.label}
                          className={details.displayData.colorClass}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      </AnimatePresence>

      {!!policies && (
        <SelectAccessModal
          policies={policies}
          isOpen={popUp.requestAccess.isOpen}
          onOpenChange={() => handlePopUpClose("requestAccess")}
        />
      )}

      {!!selectedRequest && (
        <ReviewRequestModal
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
