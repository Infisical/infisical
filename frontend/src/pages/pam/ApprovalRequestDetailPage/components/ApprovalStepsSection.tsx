import { useMemo } from "react";
import { faCheck, faCheckCircle, faClock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { User, Users } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  ApprovalRequestApproval,
  ApprovalRequestStepStatus,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";
import { ApprovalRequestApprovalDecision } from "@app/hooks/api/approvalRequests/types";

type Props = {
  request: TApprovalRequest;
};

const getMemberLabel = (member: {
  user: { username: string; email: string; firstName: string; lastName: string };
}) => {
  const { user } = member;
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.username || user.email;
};

export const ApprovalStepsSection = ({ request }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: members = [] } = useGetWorkspaceUsers(projectId, true);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const getApproverLabel = useMemo(
    () => (approverId: string, approverType: ApproverType) => {
      if (approverType === ApproverType.User) {
        const member = members?.find((m) => m.user.id === approverId);
        if (member) return getMemberLabel(member);
      } else if (approverType === ApproverType.Group) {
        const group = groups?.find(({ group: g }) => g.id === approverId);
        if (group) return group.group.name;
      }
      return approverId;
    },
    [members, groups]
  );

  const getApprovalLabel = (approval: ApprovalRequestApproval) => {
    const member = members?.find((m) => m.user.id === approval.approverUserId);
    if (member) return getMemberLabel(member);
    return approval.approverUserId;
  };

  const getStepStatusIcon = (status: ApprovalRequestStepStatus) => {
    switch (status) {
      case ApprovalRequestStepStatus.Completed:
        return <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />;
      case ApprovalRequestStepStatus.InProgress:
        return <FontAwesomeIcon icon={faClock} className="text-yellow-500" />;
      case ApprovalRequestStepStatus.Pending:
        return <div className="h-4 w-4 rounded-full border-2 border-mineshaft-400" />;
      case ApprovalRequestStepStatus.Rejected:
        return <FontAwesomeIcon icon={faXmark} className="text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="mb-2 flex items-center justify-between border-b border-mineshaft-500 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Approval Sequence</h3>
      </div>
      <div className="space-y-6">
        {request.steps.map((step, index) => (
          <div key={step.id} className="relative">
            {index < request.steps.length - 1 && (
              <div className="absolute top-8 left-2 h-full w-0.5 bg-mineshaft-600" />
            )}
            <div className="relative flex gap-3">
              <div className="relative top-3 z-10 flex h-4 w-4 items-center justify-center bg-mineshaft-900">
                {getStepStatusIcon(step.status)}
              </div>
              <div className="flex-1 pb-4">
                <div
                  className={twMerge(
                    "rounded-lg border bg-mineshaft-800",
                    step.status === ApprovalRequestStepStatus.InProgress
                      ? "border-yellow-500/40"
                      : "border-mineshaft-600"
                  )}
                >
                  <div
                    className={twMerge(
                      "mb-2 flex items-center justify-between p-2",
                      step.status === ApprovalRequestStepStatus.InProgress
                        ? "bg-yellow-500/20"
                        : "bg-mineshaft-700"
                    )}
                  >
                    <h4 className="font-medium text-mineshaft-100">
                      Step {index + 1}
                      {step.status === ApprovalRequestStepStatus.InProgress && (
                        <span className="ml-2 text-xs text-yellow-500">(Current Step)</span>
                      )}
                    </h4>
                    <Badge
                      variant={
                        step.status === ApprovalRequestStepStatus.InProgress ? "project" : "neutral"
                      }
                      className="capitalize"
                    >
                      {step.status.split("-").join(" ")}
                    </Badge>
                  </div>
                  <div className="space-y-3 p-2 pb-4 text-bunker-200">
                    <div className="flex items-center space-x-2 text-sm">
                      <div>Approvals Required:</div>
                      <div>{step.requiredApprovals}</div>
                    </div>
                    <div className="text-sm">
                      <div className="mb-2">Approvers</div>
                      <div className="flex flex-wrap gap-1.5">
                        {step.approvers.map((approver) => (
                          <Badge variant="neutral">
                            {approver.type === ApproverType.User ? <User /> : <Users />}
                            {getApproverLabel(approver.id, approver.type)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {step.approvals.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-mineshaft-600 pt-3">
                        <p className="text-xs font-medium text-mineshaft-300">Approvals Given:</p>
                        {step.approvals.map((approval) => (
                          <div
                            key={approval.id}
                            className="flex items-start justify-between rounded bg-mineshaft-900/50 p-2"
                          >
                            <div className="flex items-center gap-2">
                              <FontAwesomeIcon
                                icon={
                                  approval.decision === ApprovalRequestApprovalDecision.Approved
                                    ? faCheck
                                    : faXmark
                                }
                                className={
                                  approval.decision === ApprovalRequestApprovalDecision.Approved
                                    ? "text-green-500"
                                    : "text-red-500"
                                }
                              />
                              <div>
                                <p className="text-xs font-medium text-mineshaft-100">
                                  {getApprovalLabel(approval)}
                                </p>
                                <p className="text-xs text-mineshaft-400">
                                  {format(new Date(approval.createdAt), "MMM dd, yyyy hh:mm aaa")}
                                </p>
                              </div>
                            </div>
                            {approval.comment && (
                              <p className="max-w-xs text-xs text-mineshaft-400 italic">
                                &quot;{approval.comment}&quot;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
