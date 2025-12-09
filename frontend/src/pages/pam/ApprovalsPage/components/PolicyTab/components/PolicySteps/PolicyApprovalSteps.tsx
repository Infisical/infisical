import { useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { MultiValue } from "react-select";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FilterableSelect, FormControl, IconButton, Input } from "@app/components/v2";
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { ApproverType } from "@app/hooks/api/approvalPolicies";

import { TPolicyForm } from "../PolicySchema";

export const PolicyApprovalSteps = () => {
  const { control } = useFormContext<TPolicyForm>();

  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep
  } = useFieldArray({
    control,
    name: "steps"
  });

  const memberOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: ApproverType.User,
        isOrgMembershipActive: member.user.isOrgMembershipActive
      })),
    [members]
  );

  const groupOptions = useMemo(
    () =>
      groups?.map(({ group }) => ({
        id: group.id,
        type: ApproverType.Group
      })),
    [groups]
  );

  return (
    <div className="space-y-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-mineshaft-200">Approval Steps</span>
          <p className="text-xs text-mineshaft-400">
            Define the approval workflow with sequential steps
          </p>
        </div>
        <Button
          type="button"
          variant="outline_bg"
          size="xs"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() =>
            appendStep({
              name: "",
              requiredApprovals: 1,
              notifyApprovers: true,
              approvers: []
            })
          }
        >
          Add Step
        </Button>
      </div>

      <div className="space-y-4">
        {stepFields.map((field, index) => (
          <div key={field.id} className="rounded border border-mineshaft-600 bg-mineshaft-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-mineshaft-300">
                  Approval Step {index + 1}
                </span>
              </div>
              {stepFields.length > 1 && (
                <IconButton
                  ariaLabel="Remove step"
                  variant="plain"
                  size="xs"
                  onClick={() => removeStep(index)}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-red-500" />
                </IconButton>
              )}
            </div>

            <div className="space-y-3">
              <Controller
                control={control}
                name={`steps.${index}.name`}
                render={({ field: nameField }) => (
                  <FormControl
                    label="Step Name (Optional)"
                    helperText="A descriptive name for this approval step"
                  >
                    <Input
                      {...nameField}
                      value={nameField.value || ""}
                      placeholder="e.g., Security Team Review"
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name={`steps.${index}.requiredApprovals`}
                render={({ field: approvalsField, fieldState: { error } }) => (
                  <FormControl
                    label="Required Approvals"
                    isRequired
                    isError={Boolean(error)}
                    errorText={error?.message}
                    helperText="Number of approvers that must approve (1-100)"
                  >
                    <Input
                      {...approvalsField}
                      type="number"
                      min={1}
                      max={100}
                      onChange={(e) => approvalsField.onChange(parseInt(e.target.value, 10))}
                    />
                  </FormControl>
                )}
              />

              <div className="space-y-3">
                <div className="text-sm font-medium text-mineshaft-200">Approvers</div>
                <Controller
                  control={control}
                  name={`steps.${index}.approvers`}
                  render={({ field: { value, onChange }, fieldState: { error } }) => {
                    const userApprovers = value.filter((a) => a.type === ApproverType.User);
                    const groupApprovers = value.filter((a) => a.type === ApproverType.Group);

                    return (
                      <>
                        <FormControl
                          label="User Approvers"
                          isError={Boolean(error)}
                          errorText={
                            error?.message &&
                            userApprovers.length === 0 &&
                            groupApprovers.length === 0
                              ? error?.message
                              : undefined
                          }
                        >
                          <FilterableSelect
                            isMulti
                            placeholder="Select users..."
                            options={memberOptions}
                            getOptionValue={(option) => option.id}
                            getOptionLabel={(option) => {
                              const member = members?.find((m) => m.user.id === option.id);
                              if (!member) return option.id;
                              return getMemberLabel(member);
                            }}
                            value={userApprovers}
                            onChange={(selected) => {
                              const newApprovers = [
                                ...((selected as MultiValue<{
                                  type: ApproverType;
                                  id: string;
                                }>) || []),
                                ...groupApprovers
                              ];
                              onChange(newApprovers);
                            }}
                          />
                        </FormControl>

                        <FormControl
                          label="Group Approvers"
                          isError={Boolean(error)}
                          errorText={
                            error?.message &&
                            userApprovers.length === 0 &&
                            groupApprovers.length === 0
                              ? error?.message
                              : undefined
                          }
                        >
                          <FilterableSelect
                            isMulti
                            placeholder="Select groups..."
                            options={groupOptions}
                            getOptionValue={(option) => option.id}
                            getOptionLabel={(option) =>
                              groups?.find(({ group }) => group.id === option.id)?.group.name ??
                              option.id
                            }
                            value={groupApprovers}
                            onChange={(selected) => {
                              const newApprovers = [
                                ...userApprovers,
                                ...((selected as MultiValue<{
                                  type: ApproverType;
                                  id: string;
                                }>) || [])
                              ];
                              onChange(newApprovers);
                            }}
                          />
                        </FormControl>
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
        <div className="rounded border border-dashed border-mineshaft-600 bg-mineshaft-800/50 p-8 text-center">
          <p className="text-sm text-mineshaft-400">No approval steps defined</p>
          <p className="mt-1 text-xs text-mineshaft-500">
            Click &quot;Add Step&quot; to create your first approval step
          </p>
        </div>
      )}
    </div>
  );
};
