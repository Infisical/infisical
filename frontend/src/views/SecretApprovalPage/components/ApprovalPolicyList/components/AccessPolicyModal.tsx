import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
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
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { policyDetails } from "@app/helpers/policies";
import { useCreateSecretApprovalPolicy, useUpdateSecretApprovalPolicy } from "@app/hooks/api";
import {
  useCreateAccessApprovalPolicy,
  useUpdateAccessApprovalPolicy
} from "@app/hooks/api/accessApproval";
import { TAccessApprovalPolicy } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  members?: TWorkspaceUser[];
  projectSlug: string;
  editValues?: TAccessApprovalPolicy;
};

const formSchema = z
  .object({
    environment: z.string(),
    name: z.string().optional(),
    secretPath: z.string().optional(),
    approvals: z.number().min(1),
    approverUserIds: z.string().array().min(1),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel)
  })
  .refine((data) => data.approvals <= data.approverUserIds.length, {
    path: ["approvals"],
    message: "The number of approvals should be lower than the number of approvers."
  });

type TFormSchema = z.infer<typeof formSchema>;

export const AccessPolicyForm = ({
  isOpen,
  onToggle,
  members = [],
  projectSlug,
  editValues
}: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: editValues
      ? {
          ...editValues,
          environment: editValues.environment.slug,
          approverUserIds:
            editValues?.userApprovers?.map((user) => user.userId) || editValues?.approvers
        }
      : undefined
  });
  const { currentWorkspace } = useWorkspace();

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
    if (!projectSlug) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await createSecretApprovalPolicy({
          ...data,
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await createAccessApprovalPolicy({
          ...data,
          projectSlug
        });
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
    if (!projectSlug) return;
    if (!editValues?.id) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await updateSecretApprovalPolicy({
          id: editValues?.id,
          ...data,
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await updateAccessApprovalPolicy({
          id: editValues?.id,
          ...data,
          projectSlug
        });
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

  const formatEnforcementLevel = (level: EnforcementLevel) => {
    if (level === EnforcementLevel.Hard) return "Hard";
    if (level === EnforcementLevel.Soft) return "Soft";
    return level;
  };

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
            <Controller
              control={control}
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Path"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="approverUserIds"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Required Approvers"
                  isRequired
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Input
                        isReadOnly
                        value={value?.length ? `${value.length} selected` : "None"}
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
                        const isChecked = value?.includes(userId);
                        return (
                          <DropdownMenuItem
                            onClick={(evt) => {
                              evt.preventDefault();
                              onChange(
                                isChecked
                                  ? value?.filter((el: string) => el !== userId)
                                  : [...(value || []), userId]
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
                        <SelectItem
                          value={level}
                          key={`enforcement-level-${level}`}
                          className="text-xs"
                        >
                          {formatEnforcementLevel(level)}
                        </SelectItem>
                      );
                    })}
                  </Select>
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
