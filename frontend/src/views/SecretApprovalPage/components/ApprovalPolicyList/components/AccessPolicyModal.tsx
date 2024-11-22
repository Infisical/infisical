import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faCheckCircle, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { policyDetails } from "@app/helpers/policies";
import {
  useCreateSecretApprovalPolicy,
  useListWorkspaceGroups,
  useUpdateSecretApprovalPolicy
} from "@app/hooks/api";
import {
  useCreateAccessApprovalPolicy,
  useUpdateAccessApprovalPolicy
} from "@app/hooks/api/accessApproval";
import { ApproverType, TAccessApprovalPolicy } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  members?: TWorkspaceUser[];
  projectId: string;
  projectSlug: string;
  editValues?: TAccessApprovalPolicy;
};

const formSchema = z
  .object({
    environment: z.string(),
    name: z.string().optional(),
    secretPaths: z.object({ path: z.string() }).array().default([]),
    approvals: z.number().min(1),
    approvers: z
      .object({ type: z.nativeEnum(ApproverType), id: z.string() })
      .array()
      .min(1)
      .default([]),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel)
  })
  .refine((data) => data.approvers, {
    path: ["approvers"],
    message: "At least one approver should be provided."
  });

type TFormSchema = z.infer<typeof formSchema>;

export const AccessPolicyForm = ({
  isOpen,
  onToggle,
  members = [],
  projectId,
  projectSlug,
  editValues
}: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: editValues
      ? {
          ...editValues,
          secretPaths: (editValues.secretPaths ? editValues.secretPaths : []).map((path) => ({
            path
          })),
          environment: editValues.environment.slug,
          approvers: editValues?.approvers || [],
          approvals: editValues?.approvals
        }
      : undefined
  });
  const { currentWorkspace } = useWorkspace();
  const { data: groups } = useListWorkspaceGroups(projectId);

  const environments = currentWorkspace?.environments || [];
  const isEditMode = Boolean(editValues);

  useEffect(() => {
    if (!isOpen || !isEditMode) reset({});
  }, [isOpen, isEditMode]);

  const { mutateAsync: createAccessApprovalPolicy } = useCreateAccessApprovalPolicy();
  const { mutateAsync: updateAccessApprovalPolicy } = useUpdateAccessApprovalPolicy();

  const { mutateAsync: createSecretApprovalPolicy } = useCreateSecretApprovalPolicy();
  const { mutateAsync: updateSecretApprovalPolicy } = useUpdateSecretApprovalPolicy();

  const policyName = policyDetails[watch("policyType")]?.name || "Policy";

  const handleCreatePolicy = async (data: TFormSchema) => {
    if (!projectId) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await createSecretApprovalPolicy({
          ...data,
          secretPaths: data.secretPaths.map((path) => path.path),
          workspaceId: currentWorkspace?.id || ""
        });
      } else if (data.policyType === PolicyType.AccessPolicy) {
        await createAccessApprovalPolicy({
          ...data,
          secretPaths: data.secretPaths.map((path) => path.path),
          projectSlug
        });
      } else {
        createNotification({
          type: "error",
          text: "Invalid policy type"
        });
        return;
      }

      createNotification({
        type: "success",
        text: "Successfully created policy"
      });
      onToggle(false);
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to create policy"
      });
    }
  };

  const handleUpdatePolicy = async (data: TFormSchema) => {
    if (!projectId || !projectSlug) return;
    if (!editValues?.id) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await updateSecretApprovalPolicy({
          id: editValues?.id,
          ...data,
          secretPaths: data.secretPaths.map((path) => path.path),
          workspaceId: currentWorkspace?.id || ""
        });
      } else if (data.policyType === PolicyType.AccessPolicy) {
        await updateAccessApprovalPolicy({
          id: editValues?.id,
          ...data,
          secretPaths: data.secretPaths.map((path) => path.path),
          projectSlug
        });
      } else {
        createNotification({
          type: "error",
          text: "Invalid policy type"
        });
        return;
      }

      createNotification({
        type: "success",
        text: "Successfully updated policy"
      });
      onToggle(false);
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "failed  to update policy"
      });
    }
  };

  const handleFormSubmit = async (data: TFormSchema) => {
    if (isEditMode) {
      await handleUpdatePolicy(data);
    } else {
      await handleCreatePolicy(data);
    }
  };

  const secretPathsFields = useFieldArray({
    control,
    name: "secretPaths"
  });

  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent title={isEditMode ? `Edit ${policyName}` : "Create Policy"}>
        <div className="flex flex-col space-y-3">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <Controller
              control={control}
              name="policyType"
              defaultValue={PolicyType.ChangePolicy}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Policy Type"
                  isRequired
                  isError={Boolean(error)}
                  tooltipText="Change polices govern secret changes within a given environment and secret path. Access polices allow underprivileged user to request access to environment/secret path."
                  errorText={error?.message}
                >
                  <Select
                    isDisabled={isEditMode}
                    value={value}
                    onValueChange={(val) => onChange(val as PolicyType)}
                    className="w-full border border-mineshaft-500"
                  >
                    {Object.values(PolicyType).map((policyType) => {
                      return (
                        <SelectItem value={policyType} key={`policy-type-${policyType}`}>
                          {policyDetails[policyType].name}
                        </SelectItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Policy Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="environment"
              defaultValue={environments[0]?.slug}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Environment"
                  isRequired
                  className="mt-4"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select
                    isDisabled={isEditMode}
                    value={value}
                    onValueChange={(val) => onChange(val)}
                    className="w-full border border-mineshaft-500"
                  >
                    {environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`azure-key-vault-environment-${sourceEnvironment.slug}`}
                      >
                        {sourceEnvironment.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <div>
              <FormLabel
                tooltipText="Select which secret paths in th environment that this policy should apply for."
                label="Secret Paths"
              />
            </div>

            <div className="mb-3 mt-1 flex flex-col space-y-2">
              {secretPathsFields.fields.map(({ id: secretPathId }, i) => (
                <div key={secretPathId} className="flex items-end space-x-2">
                  <div className="flex-grow">
                    <Controller
                      control={control}
                      name={`secretPaths.${i}.path`}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          className="mb-0 flex-grow"
                        >
                          <Input {...field} />
                        </FormControl>
                      )}
                    />
                  </div>
                  <IconButton
                    ariaLabel="delete key"
                    className="bottom-0.5 h-9"
                    variant="outline_bg"
                    onClick={() => {
                      const secretPaths = getValues("secretPaths");
                      if (secretPaths && secretPaths?.length > 0) {
                        secretPathsFields.remove(i);
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>
              ))}
              <div>
                <Button
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  size="xs"
                  variant="outline_bg"
                  onClick={() => secretPathsFields.append({ path: "/" })}
                >
                  Add Path
                </Button>
              </div>
            </div>

            <Controller
              control={control}
              name="approvals"
              defaultValue={1}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Minimum Approvals Required"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    onChange={(el) => field.onChange(parseInt(el.target.value, 10))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="enforcementLevel"
              defaultValue={EnforcementLevel.Hard}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Enforcement Level"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Determines the level of enforcement for required approvers of a request"
                  helperText={
                    field.value === EnforcementLevel.Hard
                      ? "All approvers must approve the request."
                      : "All approvers must approve the request; however, the requester can bypass approval requirements in emergencies."
                  }
                >
                  <Select
                    value={field.value}
                    onValueChange={(val) => field.onChange(val as EnforcementLevel)}
                    className="w-full border border-mineshaft-500"
                  >
                    {Object.values(EnforcementLevel).map((level) => {
                      return (
                        <SelectItem value={level} key={`enforcement-level-${level}`}>
                          <span className="capitalize">{level}</span>
                        </SelectItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            />
            <p>Approvers</p>
            <Controller
              control={control}
              name="approvers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="User Approvers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Input
                        isReadOnly
                        value={
                          value?.filter((e) => e.type === ApproverType.User).length
                            ? `${value.filter((e) => e.type === ApproverType.User).length} selected`
                            : "None"
                        }
                        className="text-left"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                      align="start"
                    >
                      <DropdownMenuLabel>
                        Select members that are allowed to approve requests
                      </DropdownMenuLabel>
                      {members.map(({ user }) => {
                        const { id: userId } = user;
                        const isChecked =
                          value?.filter(
                            (el: { id: string; type: ApproverType }) =>
                              el.id === userId && el.type === ApproverType.User
                          ).length > 0;
                        return (
                          <DropdownMenuItem
                            onClick={(evt) => {
                              evt.preventDefault();
                              onChange(
                                isChecked
                                  ? value?.filter(
                                      (el: { id: string; type: ApproverType }) =>
                                        el.id !== userId && el.type !== ApproverType.User
                                    )
                                  : [...(value || []), { id: userId, type: ApproverType.User }]
                              );
                            }}
                            key={`create-policy-members-${userId}`}
                            iconPos="right"
                            icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                          >
                            {user.username}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="approvers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Group Approvers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Input
                        isReadOnly
                        value={
                          value?.filter((e) => e.type === ApproverType.Group).length
                            ? `${
                                value?.filter((e) => e.type === ApproverType.Group).length
                              } selected`
                            : "None"
                        }
                        className="text-left"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                      align="start"
                    >
                      <DropdownMenuLabel>
                        Select groups that are allowed to approve requests
                      </DropdownMenuLabel>
                      {groups &&
                        groups.map(({ group }) => {
                          const { id } = group;
                          const isChecked =
                            value?.filter(
                              (el: { id: string; type: ApproverType }) =>
                                el.id === id && el.type === ApproverType.Group
                            ).length > 0;

                          return (
                            <DropdownMenuItem
                              onClick={(evt) => {
                                evt.preventDefault();
                                onChange(
                                  isChecked
                                    ? value?.filter(
                                        (el: { id: string; type: ApproverType }) =>
                                          el.id !== id && el.type !== ApproverType.Group
                                      )
                                    : [...(value || []), { id, type: ApproverType.Group }]
                                );
                              }}
                              key={`create-policy-members-${id}`}
                              iconPos="right"
                              icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                            >
                              {group.name}
                            </DropdownMenuItem>
                          );
                        })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormControl>
              )}
            />
            <div className="mt-8 flex items-center space-x-4">
              <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
                Save
              </Button>
              <Button onClick={() => onToggle(false)} variant="outline_bg">
                Close
              </Button>
            </div>
          </form>
        </div>
      </ModalContent>
    </Modal>
  );
};
