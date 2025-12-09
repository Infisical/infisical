import { useFormContext } from "react-hook-form";
import { faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApproverType } from "@app/hooks/api/approvalPolicies";

import { TPolicyForm } from "../PolicySchema";

const ReviewField = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex gap-x-8">
    <span className="min-w-[140px] text-sm text-mineshaft-400">{label}</span>
    <span className="text-sm text-mineshaft-200">{value}</span>
  </div>
);

export const PolicyReviewStep = () => {
  const { watch } = useFormContext<TPolicyForm>();
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const { name, maxRequestTtl, conditions, constraints, steps } = watch();

  const getApproverLabel = (approverId: string, approverType: ApproverType) => {
    if (approverType === ApproverType.User) {
      const member = members?.find((m) => m.user.id === approverId);
      if (member) {
        return getMemberLabel(member);
      }
    } else if (approverType === ApproverType.Group) {
      const group = groups?.find(({ group: g }) => g.id === approverId);
      if (group) {
        return group.group.name;
      }
    }
    return approverId;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 border-b border-mineshaft-600 pb-2">
          <h3 className="text-sm font-medium text-mineshaft-200">Policy Configuration</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ReviewField label="Policy Name" value={name || "Not set"} />
          <ReviewField label="Max. Access Duration" value={constraints.accessDuration.max} />
          <ReviewField
            label="Account Paths"
            value={
              conditions[0].accountPaths.length ? conditions[0].accountPaths.join(",") : "Not set"
            }
          />
        </div>
      </div>

      <div>
        <div className="mb-3 border-b border-mineshaft-600 pb-2">
          <h3 className="text-sm font-medium text-mineshaft-200">Approval Sequence</h3>
        </div>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const userApprovers = step.approvers.filter((a) => a.type === ApproverType.User);
            const groupApprovers = step.approvers.filter((a) => a.type === ApproverType.Group);

            return (
              <div
                key={`step-${index + 1}`}
                className="rounded border border-mineshaft-600 bg-mineshaft-700 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-mineshaft-200">
                        Step {index + 1}
                        {step.name && (
                          <span className="ml-2 text-xs text-mineshaft-400">({step.name})</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-mineshaft-400">
                    Requires {step.requiredApprovals} approval
                    {step.requiredApprovals !== 1 ? "s" : ""}
                  </div>
                </div>

                <div className="space-y-2">
                  {userApprovers.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs text-mineshaft-400">
                        User Approvers ({userApprovers.length}):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {userApprovers.map((approver, approverIndex) => (
                          <div
                            key={`step-${index + 1}-user-${approverIndex + 1}`}
                            className="flex items-center gap-1.5 rounded bg-mineshaft-700 px-2 py-1 text-xs text-mineshaft-300"
                          >
                            <FontAwesomeIcon icon={faUsers} className="text-mineshaft-400" />
                            <span className="text-mineshaft-200">
                              {getApproverLabel(approver.id, ApproverType.User)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupApprovers.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs text-mineshaft-400">
                        Group Approvers ({groupApprovers.length}):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groupApprovers.map((approver, approverIndex) => (
                          <div
                            key={`step-${index + 1}-group-${approverIndex + 1}`}
                            className="flex items-center gap-1.5 rounded bg-mineshaft-700 px-2 py-1 text-xs text-mineshaft-300"
                          >
                            <FontAwesomeIcon icon={faUsers} className="text-mineshaft-400" />
                            <span className="text-mineshaft-200">
                              {getApproverLabel(approver.id, ApproverType.Group)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.approvers.length === 0 && (
                    <span className="text-xs text-mineshaft-500">No approvers defined</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Notice */}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <p className="text-xs text-mineshaft-300">
          Please review all the details above. Submit to save this policy or go back to make
          changes.
        </p>
      </div>
    </div>
  );
};
