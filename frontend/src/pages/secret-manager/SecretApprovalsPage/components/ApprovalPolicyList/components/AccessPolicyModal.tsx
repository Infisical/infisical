import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
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
    environment: z.object({ slug: z.string(), name: z.string() }),
    name: z.string().optional(),
    secretPath: z.string().optional(),
    approvals: z.number().min(1),
    userApprovers: z
      .object({ type: z.literal(ApproverType.User), id: z.string() })
      .array()
      .default([]),
    groupApprovers: z
      .object({ type: z.literal(ApproverType.Group), id: z.string() })
      .array()
      .default([]),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel),
    allowedSelfApprovals: z.boolean().default(true)
  })
  .superRefine((data, ctx) => {
    if (!(data.groupApprovers.length || data.userApprovers.length)) {
      ctx.addIssue({
        path: ["userApprovers"],
        code: z.ZodIssueCode.custom,
        message: "At least one approver should be provided"
      });
      ctx.addIssue({
        path: ["groupApprovers"],
        code: z.ZodIssueCode.custom,
        message: "At least one approver should be provided"
      });
    }
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
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: editValues
      ? {
          ...editValues,
          environment: editValues.environment,
          userApprovers:
            editValues?.approvers
              ?.filter((approver) => approver.type === ApproverType.User)
              .map(({ id, type }) => ({ id, type: type as ApproverType.User })) || [],
          groupApprovers:
            editValues?.approvers
              ?.filter((approver) => approver.type === ApproverType.Group)
              .map(({ id, type }) => ({ id, type: type as ApproverType.Group })) || [],
          approvals: editValues?.approvals,
          allowedSelfApprovals: editValues?.allowedSelfApprovals
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

  const approversRequired = watch("approvals") || 1;

  const handleCreatePolicy = async ({
    environment,
    groupApprovers,
    userApprovers,
    ...data
  }: TFormSchema) => {
    if (!projectId) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await createSecretApprovalPolicy({
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          environment: environment.slug,
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await createAccessApprovalPolicy({
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          environment: environment.slug,
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

  const handleUpdatePolicy = async ({
    environment,
    userApprovers,
    groupApprovers,
    ...data
  }: TFormSchema) => {
    if (!projectId || !projectSlug) return;
    if (!editValues?.id) return;

    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        await updateSecretApprovalPolicy({
          id: editValues?.id,
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await updateAccessApprovalPolicy({
          id: editValues?.id,
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          environment: environment.slug,
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

  const memberOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: ApproverType.User
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
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent
        className="max-w-2xl"
        bodyClassName="overflow-visible"
        title={isEditMode ? `Edit ${policyName}` : "Create Policy"}
      >
        <div className="flex flex-col space-y-3">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="grid grid-cols-2 gap-x-3">
              <Controller
                control={control}
                name="policyType"
                defaultValue={PolicyType.ChangePolicy}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Policy Type"
                    isRequired
                    isError={Boolean(error)}
                    tooltipText="Change policies govern secret changes within a given environment and secret path. Access policies allow underprivileged user to request access to environment/secret path."
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
                name="enforcementLevel"
                defaultValue={EnforcementLevel.Hard}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Enforcement Level"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    tooltipText={
                      <>
                        <p>
                          Determines the level of enforcement for required approvers of a request:
                        </p>
                        <p className="mt-2">
                          <span className="font-bold">Hard</span> enforcement requires at least{" "}
                          <span className="font-bold"> {approversRequired}</span> approver(s) to
                          approve the request.`
                        </p>
                        <p className="mt-2">
                          <span className="font-bold">Soft</span> enforcement At least{" "}
                          <span className="font-bold">{approversRequired}</span> approver(s) must
                          approve the request; however, the requester can bypass approval
                          requirements in emergencies.
                        </p>
                      </>
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

              <Controller
                control={control}
                name="environment"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Environment"
                    isRequired
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <FilterableSelect
                      isDisabled={isEditMode}
                      value={value}
                      onChange={onChange}
                      placeholder="Select environment..."
                      options={environments}
                      getOptionValue={(option) => option.slug}
                      getOptionLabel={(option) => option.name}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="secretPath"
                defaultValue="/"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    tooltipText="Secret paths support glob patterns. For example, '/**' will match all paths."
                    label="Secret Path"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                )}
              />
            </div>
            <div className="mb-2">
              <p>Approvers</p>
              <p className="font-inter text-xs text-mineshaft-300 opacity-90">
                Select members or groups that are allowed to approve requests from this policy.
              </p>
            </div>
            <Controller
              control={control}
              name="userApprovers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="User Approvers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <FilterableSelect
                    menuPlacement="top"
                    isMulti
                    placeholder="Select members that are allowed to approve requests..."
                    options={memberOptions}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => {
                      const member = members?.find((m) => m.user.id === option.id);

                      if (!member) return option.id;

                      return getMemberLabel(member);
                    }}
                    value={value}
                    onChange={onChange}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="groupApprovers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Group Approvers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <FilterableSelect
                    menuPlacement="top"
                    isMulti
                    placeholder="Select groups that are allowed to approve requests..."
                    options={groupOptions}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) =>
                      groups?.find(({ group }) => group.id === option.id)?.group.name ?? option.id
                    }
                    value={value}
                    onChange={onChange}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="allowedSelfApprovals"
              defaultValue
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Self Approvals"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Switch
                    id="self-approvals"
                    thumbClassName="bg-mineshaft-800"
                    isChecked={value}
                    onCheckedChange={onChange}
                  >
                    Allow approvers to review their own requests
                  </Switch>
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
