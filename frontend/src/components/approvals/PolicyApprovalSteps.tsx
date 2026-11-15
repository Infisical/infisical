import { useId, useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApproverType } from "@app/hooks/api/approvalPolicies";
import { useListPkiApplicationMembers } from "@app/hooks/api/pkiApplications";

import { TFormWithApprovalSteps } from "./ApprovalStepsSchema";

type Props = {
  applicationId?: string;
};

export const PolicyApprovalSteps = ({ applicationId }: Props = {}) => {
  const { control } = useFormContext<TFormWithApprovalSteps>();
  const fieldIdPrefix = useId();

  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);
  const { data: appMembers = [] } = useListPkiApplicationMembers(applicationId ?? "");

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep
  } = useFieldArray({
    control,
    name: "steps"
  });

  const memberOptions = useMemo(() => {
    if (applicationId) {
      return appMembers
        .filter((m) => Boolean(m.actorUserId))
        .map((m) => ({
          id: m.actorUserId as string,
          type: ApproverType.User,
          isOrgMembershipActive: true
        }));
    }
    return members.map((member) => ({
      id: member.user.id,
      type: ApproverType.User,
      isOrgMembershipActive: member.user.isOrgMembershipActive
    }));
  }, [applicationId, appMembers, members]);

  const groupOptions = useMemo(() => {
    if (applicationId) {
      return appMembers
        .filter((m) => Boolean(m.actorGroupId))
        .map((m) => ({ id: m.actorGroupId as string, type: ApproverType.Group }));
    }
    return groups?.map(({ group }) => ({ id: group.id, type: ApproverType.Group })) ?? [];
  }, [applicationId, appMembers, groups]);

  const userLabel = (userId: string) => {
    if (applicationId) {
      const m = appMembers.find((member) => member.actorUserId === userId);
      return m?.details?.name || m?.details?.username || m?.details?.email || userId;
    }
    const member = members.find((m) => m.user.id === userId);
    return member ? getMemberLabel(member) : userId;
  };
  const groupLabel = (groupId: string) => {
    if (applicationId) {
      const m = appMembers.find((member) => member.actorGroupId === groupId);
      return m?.details?.name || groupId;
    }
    return groups?.find(({ group }) => group.id === groupId)?.group.name ?? groupId;
  };

  return (
    <div className="space-y-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-foreground-secondary">Approval Steps</span>
          <p className="text-xs text-muted">Define the approval workflow with sequential steps</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            appendStep({
              name: "",
              requiredApprovals: 1,
              notifyApprovers: true,
              approvers: []
            })
          }
        >
          <PlusIcon />
          Add Step
        </Button>
      </div>

      <div className="space-y-4">
        {stepFields.map((field, index) => (
          <div key={field.id} className="rounded border border-border-control bg-surface-hover p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-project/20 text-xs font-semibold text-project">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-label">Approval Step {index + 1}</span>
              </div>
              {stepFields.length > 1 && (
                <IconButton
                  aria-label="Remove step"
                  variant="ghost"
                  size="xs"
                  onClick={() => removeStep(index)}
                >
                  <TrashIcon className="text-danger" />
                </IconButton>
              )}
            </div>

            <div className="space-y-3">
              <Controller
                control={control}
                name={`steps.${index}.name`}
                render={({ field: nameField }) => (
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-${index}-name`}>
                      Step Name <span className="text-muted">(optional)</span>
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        {...nameField}
                        id={`${fieldIdPrefix}-${index}-name`}
                        value={nameField.value || ""}
                        placeholder="e.g., Security Team Review"
                      />
                      <FieldDescription>A descriptive name for this approval step</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name={`steps.${index}.requiredApprovals`}
                render={({ field: approvalsField, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-${index}-required-approvals`}>
                      Required Approvals <span className="text-danger">*</span>
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        {...approvalsField}
                        id={`${fieldIdPrefix}-${index}-required-approvals`}
                        type="number"
                        min={1}
                        max={100}
                        isError={Boolean(error)}
                        onChange={(e) => approvalsField.onChange(parseInt(e.target.value, 10))}
                      />
                      <FieldDescription isOpen={!error}>
                        Number of approvers that must approve (1-100)
                      </FieldDescription>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground-secondary">Approvers</div>
                <Controller
                  control={control}
                  name={`steps.${index}.approvers`}
                  render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => {
                    const userApprovers = value.filter((a) => a.type === ApproverType.User);
                    const groupApprovers = value.filter((a) => a.type === ApproverType.Group);
                    const approversError =
                      userApprovers.length === 0 && groupApprovers.length === 0
                        ? error?.message
                        : undefined;

                    return (
                      <>
                        <Field>
                          <FieldLabel htmlFor={`${fieldIdPrefix}-${index}-user-approvers`}>
                            User Approvers
                          </FieldLabel>
                          <FieldContent>
                            <Combobox
                              id={`${fieldIdPrefix}-${index}-user-approvers`}
                              ref={ref}
                              onBlur={onBlur}
                              multiple
                              isError={Boolean(approversError)}
                              placeholder="Select users..."
                              options={memberOptions}
                              getOptionValue={(option) => option.id}
                              getOptionLabel={(option) => userLabel(option.id)}
                              value={userApprovers}
                              onValueChange={(selected) => {
                                const newApprovers = [...selected, ...groupApprovers];
                                onChange(newApprovers);
                              }}
                            />
                            <FieldError>{approversError}</FieldError>
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`${fieldIdPrefix}-${index}-group-approvers`}>
                            Group Approvers
                          </FieldLabel>
                          <FieldContent>
                            <Combobox
                              id={`${fieldIdPrefix}-${index}-group-approvers`}
                              onBlur={onBlur}
                              multiple
                              isError={Boolean(approversError)}
                              placeholder="Select groups..."
                              options={groupOptions}
                              getOptionValue={(option) => option.id}
                              getOptionLabel={(option) => groupLabel(option.id)}
                              value={groupApprovers}
                              onValueChange={(selected) => {
                                const newApprovers = [...userApprovers, ...selected];
                                onChange(newApprovers);
                              }}
                            />
                            <FieldError>{approversError}</FieldError>
                          </FieldContent>
                        </Field>
                      </>
                    );
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {stepFields.length === 0 && (
        <div className="rounded border border-dashed border-border-control bg-surface-raised/50 p-8 text-center">
          <p className="text-sm text-muted">No approval steps defined</p>
          <p className="mt-1 text-xs text-surface-selected">
            Click &quot;Add Step&quot; to create your first approval step
          </p>
        </div>
      )}
    </div>
  );
};
