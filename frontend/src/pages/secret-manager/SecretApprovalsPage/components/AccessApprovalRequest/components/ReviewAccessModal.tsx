import { useCallback, useMemo, useState } from "react";
import {
  faCheckCircle,
  faCircle,
  faTriangleExclamation,
  faUsers,
  faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip
} from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionActions, useUser, useWorkspace } from "@app/context";
import { useListWorkspaceGroups, useReviewAccessRequest } from "@app/hooks/api";
import {
  Approver,
  ApproverType,
  TAccessApprovalPolicy,
  TAccessApprovalRequest
} from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { ApprovalStatus, TWorkspaceUser } from "@app/hooks/api/types";
import { groupBy } from "@app/lib/fn/array";

const getReviewedStatusSymbol = (status?: ApprovalStatus) => {
  if (status === ApprovalStatus.APPROVED)
    return <FontAwesomeIcon icon={faCheckCircle} size="xs" style={{ color: "#15803d" }} />;
  if (status === ApprovalStatus.REJECTED)
    return <FontAwesomeIcon icon={faXmarkCircle} size="xs" style={{ color: "#b91c1c" }} />;
  return <FontAwesomeIcon icon={faCircle} size="xs" style={{ color: "#c2410c" }} />;
};

export const ReviewAccessRequestModal = ({
  isOpen,
  onOpenChange,
  request,
  projectSlug,
  selectedRequester,
  selectedEnvSlug,
  canBypass,
  policies = [],
  members = []
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: TAccessApprovalRequest & {
    user: { firstName?: string; lastName?: string; email?: string } | null;
    isRequestedByCurrentUser: boolean;
    isSelfApproveAllowed: boolean;
    isApprover: boolean;
  };
  projectSlug: string;
  selectedRequester: string | undefined;
  selectedEnvSlug: string | undefined;
  canBypass: boolean;
  policies: TAccessApprovalPolicy[];
  members: TWorkspaceUser[];
}) => {
  const [isLoading, setIsLoading] = useState<"approved" | "rejected" | null>(null);
  const [bypassApproval, setBypassApproval] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const { currentWorkspace } = useWorkspace();
  const { data: groupMemberships = [] } = useListWorkspaceGroups(currentWorkspace?.id || "");
  const { user } = useUser();

  const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;

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
      <Badge>
        {`Valid for ${ms(ms(accessDetails.temporaryAccess.temporaryRange), {
          long: true
        })} after approval`}
      </Badge>
    );
  };

  const reviewAccessRequest = useReviewAccessRequest();

  const handleReview = useCallback(
    async (status: "approved" | "rejected") => {
      if (bypassApproval && bypassReason.length < 10) {
        createNotification({
          title: "Failed to bypass approval",
          text: "Reason must be 10 characters or longer",
          type: "error"
        });
        return;
      }

      setIsLoading(status);
      try {
        await reviewAccessRequest.mutateAsync({
          requestId: request.id,
          status,
          projectSlug,
          envSlug: selectedEnvSlug,
          requestedBy: selectedRequester,
          bypassReason: bypassApproval ? bypassReason : undefined
        });

        createNotification({
          title: `Request ${status}`,
          text: `The request has been ${status}`,
          type: status === "approved" ? "success" : "info"
        });
      } catch (error) {
        console.error(error);
        setIsLoading(null);
        return;
      }

      setIsLoading(null);
      onOpenChange(false);
    },
    [
      bypassApproval,
      bypassReason,
      reviewAccessRequest,
      request,
      selectedEnvSlug,
      selectedRequester,
      onOpenChange
    ]
  );

  const approverSequence = useMemo(() => {
    const policy = policies.find((el) => el.id === request.policy.id);
    const reviewesGroupById = groupBy(request.reviewers, (i) => i.userId);
    const membersGroupById = groupBy(members, (i) => i.user.id);
    const projectGroupsGroupById = groupBy(groupMemberships, (i) => i.group.id);
    const approversBySequence = policy?.approvers?.reduce(
      (acc, curr) => {
        if (acc.length && acc[acc.length - 1].sequence === curr.sequence) {
          acc[acc.length - 1][curr.type]?.push(curr);
          return acc;
        }

        const approvals = curr.approvalsRequired || policy.approvals;
        const sequence = curr.sequence || 1;

        acc.push(
          curr.type === ApproverType.User
            ? { user: [curr], group: [], sequence, approvals }
            : { group: [curr], user: [], sequence, approvals }
        );
        return acc;
      },
      [] as {
        user: Approver[];
        group: Approver[];
        sequence?: number;
        approvals?: number;
      }[]
    );

    const approvers = approversBySequence?.map((approverChain) => {
      const reviewers = request.policy.approvers
        .filter((el) => (el.sequence || 1) === approverChain.sequence)
        .map((el) => ({ ...el, status: reviewesGroupById?.[el.userId]?.[0]?.status }));
      const hasApproved =
        reviewers.filter((el) => el.status === "approved").length >=
        (approverChain?.approvals || 1);

      const hasRejected = reviewers.filter((el) => el.status === ApprovalStatus.REJECTED).length;
      return { ...approverChain, reviewers, hasApproved, hasRejected };
    });
    const currentSequenceApprover = approvers?.find((el) => !el.hasApproved);
    const currentSequence = currentSequenceApprover?.sequence || 1;
    const isMyReviewInThisSequence = currentSequenceApprover?.reviewers.find(
      (i) => i.userId === user.id
    );

    return {
      approvers,
      membersGroupById,
      projectGroupsGroupById,
      currentSequence,
      isMyReviewInThisSequence
    };
  }, [request, policies]);

  const hasRejected = request.status === ApprovalStatus.REJECTED;
  const hasApproved = request.status === ApprovalStatus.APPROVED;
  const isReviewedByMe = request.reviewers.find((i) => i.userId === user.id);

  const shouldBlockRequestActions =
    hasRejected ||
    hasApproved ||
    isReviewedByMe ||
    (!approverSequence?.isMyReviewInThisSequence && !canBypass);

  const renderCompletedMessages = () => {
    if (hasRejected) return "This request has been rejected.";
    if (hasApproved) return "This request has been approved.";
    if (isReviewedByMe) return "You have reviewed this request.";
    return "You are not the reviewer in this step.";
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-4xl"
        title="Review Request"
        subTitle="Review the request and approve or deny access."
      >
        <div className="mb-4 rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5 text-sm">
          {request.user &&
          (request.user.firstName || request.user.lastName) &&
          request.user.email ? (
            <span className="inline font-bold">
              {request.user?.firstName} {request.user?.lastName} ({request.user?.email})
            </span>
          ) : (
            <span>A user</span>
          )}{" "}
          is requesting access to the following resource:
        </div>
        <div className="">
          <div className="mb-2 mt-4 text-mineshaft-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase">Environment</div>
                <div>{accessDetails.env || "-"}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase">Secret Path</div>
                <div>{accessDetails.secretPath || "-"}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase">Access Type</div>
                <div>{getAccessLabel()}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase">Permission</div>
                <div>{requestedAccess}</div>
              </div>
              <div className="col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase">Note</div>
                <div>{request.note || "-"}</div>
              </div>
            </div>
          </div>
          <div className="mb-4 border-b-2 border-mineshaft-500 py-2 text-lg">Approvers</div>
          <div className="thin-scrollbar max-h-64 overflow-y-auto rounded p-2">
            {approverSequence?.approvers?.map((approver, index) => (
              <div
                key={`approval-list-${index + 1}`}
                className={twMerge(
                  "relative mb-2 flex items-center rounded border border-mineshaft-500 bg-mineshaft-700 p-4",
                  approverSequence?.currentSequence !== approver.sequence &&
                    !hasApproved &&
                    "text-mineshaft-400"
                )}
              >
                <div>
                  <div
                    className={twMerge(
                      "mr-8 flex h-8 w-8 items-center justify-center text-3xl font-medium",
                      approver.hasApproved && "border-green-400 text-green-400",
                      approver.hasRejected && "border-red-500 text-red-500"
                    )}
                  >
                    {index + 1}
                  </div>
                  {index !== (approverSequence?.approvers?.length || 0) - 1 && (
                    <div
                      className={twMerge(
                        "absolute bottom-0 left-8 h-5 border-r-2 border-gray-400",
                        approver.hasApproved && "border-green-400",
                        approver.hasRejected && "border-red-500"
                      )}
                    />
                  )}
                  {index !== 0 && (
                    <div
                      className={twMerge(
                        "absolute left-8 top-0 h-5 border-r-2 border-gray-400",
                        approver.hasApproved && "border-green-400",
                        approver.hasRejected && "border-red-500"
                      )}
                    />
                  )}
                </div>
                <div className="grid flex-grow grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase">Users</div>
                    <div>
                      {approver?.user
                        ?.map(
                          (el) => approverSequence?.membersGroupById?.[el.id]?.[0]?.user?.username
                        )
                        .join(",") || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase">Groups</div>
                    <div>
                      {approver?.group
                        ?.map(
                          (el) =>
                            approverSequence?.projectGroupsGroupById?.[el.id]?.[0]?.group?.name
                        )
                        .join(",") || "-"}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase">Approvals Required</div>
                      <div>{approver.approvals || "-"}</div>
                    </div>
                    <div className="ml-16">
                      <Popover>
                        <PopoverTrigger>
                          <FontAwesomeIcon icon={faUsers} />
                        </PopoverTrigger>
                        <PopoverContent hideCloseBtn className="pt-3">
                          <div>
                            <div className="mb-1 text-sm text-bunker-300">Reviewers</div>
                            <div className="thin-scrollbar flex max-h-64 flex-col gap-1 overflow-y-auto rounded">
                              {approver.reviewers.map((el, idx) => (
                                <div
                                  key={`reviewer-${idx + 1}`}
                                  className="flex items-center gap-2 bg-mineshaft-700 p-1 text-sm"
                                >
                                  <div className="flex-grow">{el.username}</div>
                                  <Tooltip
                                    content={`Status: ${el?.status || ApprovalStatus.PENDING}`}
                                  >
                                    {getReviewedStatusSymbol(el?.status as ApprovalStatus)}
                                  </Tooltip>
                                </div>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {approverSequence.isMyReviewInThisSequence &&
            request.status === ApprovalStatus.PENDING && (
              <div className="mb-4 rounded-r border-l-2 border-l-primary-400 bg-mineshaft-300/5 px-4 py-2.5 text-sm">
                Awaiting review from you.
              </div>
            )}
          {shouldBlockRequestActions ? (
            <div
              className={twMerge(
                "mb-4 rounded-r border-l-2 border-l-red-500 bg-mineshaft-300/5 px-4 py-2.5 text-sm",
                isReviewedByMe && "border-l-green-400",
                !approverSequence.isMyReviewInThisSequence && "border-l-primary-400",
                hasRejected && "border-l-red-500"
              )}
            >
              {renderCompletedMessages()}
            </div>
          ) : (
            <>
              <div className="space-x-2">
                <Button
                  isLoading={isLoading === "approved"}
                  isDisabled={
                    Boolean(isLoading) ||
                    (!(
                      request.isApprover &&
                      (!request.isRequestedByCurrentUser || request.isSelfApproveAllowed)
                    ) &&
                      !bypassApproval)
                  }
                  onClick={() => handleReview("approved")}
                  className="mt-4"
                  size="sm"
                  colorSchema={!request.isApprover && isSoftEnforcement ? "danger" : "primary"}
                >
                  Approve Request
                </Button>
                <Button
                  isLoading={isLoading === "rejected"}
                  isDisabled={
                    !!isLoading ||
                    (!(
                      request.isApprover &&
                      (!request.isRequestedByCurrentUser || request.isSelfApproveAllowed)
                    ) &&
                      !bypassApproval)
                  }
                  onClick={() => handleReview("rejected")}
                  className="mt-4 border-transparent bg-transparent text-mineshaft-200 hover:border-red hover:bg-red/20 hover:text-mineshaft-200"
                  size="sm"
                >
                  Reject Request
                </Button>
              </div>
              {isSoftEnforcement &&
                request.isRequestedByCurrentUser &&
                !(request.isApprover && request.isSelfApproveAllowed) &&
                canBypass && (
                  <div className="mt-2 flex flex-col space-y-2">
                    <Checkbox
                      onCheckedChange={(checked) => setBypassApproval(checked === true)}
                      isChecked={bypassApproval}
                      id="byPassApproval"
                      checkIndicatorBg="text-white"
                      className={twMerge(
                        "mr-2",
                        bypassApproval ? "border-red bg-red hover:bg-red-600" : ""
                      )}
                    >
                      <span className="text-xs text-red">
                        Approve without waiting for requirements to be met (bypass policy
                        protection)
                      </span>
                    </Checkbox>
                    {bypassApproval && (
                      <FormControl
                        label="Reason for bypass"
                        className="mt-2"
                        isRequired
                        tooltipText="Enter a reason for bypassing the secret change policy"
                      >
                        <Input
                          value={bypassReason}
                          onChange={(e) => setBypassReason(e.currentTarget.value)}
                          placeholder="Enter reason for bypass (min 10 chars)"
                          leftIcon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                        />
                      </FormControl>
                    )}
                  </div>
                )}
            </>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
