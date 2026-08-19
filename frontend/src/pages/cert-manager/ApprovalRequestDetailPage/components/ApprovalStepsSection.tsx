import { useMemo } from "react";
import { CheckCircle2, Eye, User } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";

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

const getStepCircleClasses = (isCurrentStep: boolean, isCompleted: boolean) => {
  if (isCurrentStep) {
    return "bg-project/20 text-project ring-2 ring-project/50";
  }
  if (isCompleted) {
    return "bg-project text-black";
  }
  return "bg-foreground/10 text-label";
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

  return (
    <div className="flex w-full flex-col rounded-lg border border-border bg-card px-4 py-4">
      <h3 className="mb-4 text-base font-medium text-foreground">Approval Workflow</h3>

      {request.steps.length === 0 && request.status === ApprovalRequestStatus.Approved ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-container px-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-project/15 text-project">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Pre-approved</p>
            <p className="mt-0.5 text-xs text-muted">An Administrator pre-approved this request.</p>
          </div>
        </div>
      ) : (
        <div className="relative space-y-0">
          {request.steps.map((step, index) => {
            const isCurrentStep = step.status === ApprovalRequestStepStatus.InProgress;
            const isCompleted = step.status === ApprovalRequestStepStatus.Completed;
            const isLast = index === request.steps.length - 1;

            return (
              <div key={step.id} className="relative flex gap-3">
                {!isLast && (
                  <div
                    className={`absolute top-6 left-[11px] h-[calc(100%-26px)] w-0.5 ${
                      isCompleted ? "bg-project" : "bg-foreground/10"
                    }`}
                  />
                )}

                <div
                  className={`relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-xs text-xs font-medium ${getStepCircleClasses(isCurrentStep, isCompleted)}`}
                >
                  {index + 1}
                </div>

                <div className={`flex-1 pb-4 ${isLast ? "pb-0" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${isCurrentStep || isCompleted ? "text-foreground" : "text-muted"}`}
                    >
                      {step.name || `Step ${index + 1}`}
                    </span>
                    {isCurrentStep && (
                      <Badge variant="project" className="text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {step.requiredApprovals} approval{step.requiredApprovals > 1 ? "s" : ""}{" "}
                    required
                  </p>

                  <div className="mt-2 space-y-1">
                    {step.approvers.map((approver) => {
                      const approval = step.approvals.find((a) => a.approverUserId === approver.id);
                      const isApproved =
                        approval?.decision === ApprovalRequestApprovalDecision.Approved;
                      const isRejected =
                        approval?.decision === ApprovalRequestApprovalDecision.Rejected;
                      const hasComment = approval?.comment;
                      return (
                        <div
                          key={approver.id}
                          className="flex items-center gap-2 rounded-md bg-container-hover px-3 py-1.5 text-sm text-label"
                        >
                          <User className="h-3.5 w-3.5" />
                          <span className="flex-1">
                            {getApproverLabel(approver.id, approver.type)}
                          </span>
                          {isApproved && <span className="text-xs text-success">Approved</span>}
                          {isRejected && <span className="text-xs text-danger">Rejected</span>}
                          {hasComment && (
                            <Tooltip content={approval.comment}>
                              <Eye className="h-3.5 w-3.5 cursor-pointer text-muted hover:text-foreground" />
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
