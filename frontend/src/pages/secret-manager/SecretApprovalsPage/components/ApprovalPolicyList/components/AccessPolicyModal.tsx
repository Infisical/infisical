import { RefObject, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faGripVertical, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch,
  Tag,
  Tooltip
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
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
import {
  Approver,
  ApproverType,
  BypasserType,
  TAccessApprovalPolicy
} from "@app/hooks/api/accessApproval/types";
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
    secretPath: z.string().trim().min(1),
    approvals: z.number().min(1).default(1),
    userApprovers: z
      .object({ type: z.literal(ApproverType.User), id: z.string() })
      .array()
      .default([]),
    groupApprovers: z
      .object({ type: z.literal(ApproverType.Group), id: z.string() })
      .array()
      .default([]),
    userBypassers: z
      .object({ type: z.literal(BypasserType.User), id: z.string() })
      .array()
      .default([]),
    groupBypassers: z
      .object({ type: z.literal(BypasserType.Group), id: z.string() })
      .array()
      .default([]),
    policyType: z.nativeEnum(PolicyType),
    enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
    allowedSelfApprovals: z.boolean().default(true),
    sequenceApprovers: z
      .object({
        user: z
          .object({ type: z.literal(ApproverType.User), id: z.string() })
          .array()
          .default([]),
        group: z
          .object({ type: z.literal(ApproverType.Group), id: z.string() })
          .array()
          .default([]),
        approvals: z.number().min(1).default(1)
      })
      .array()
      .default([])
      .optional()
  })
  .superRefine((data, ctx) => {
    if (data.policyType === PolicyType.ChangePolicy) {
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
    }
  });

type TFormSchema = z.infer<typeof formSchema>;

const Form = ({
  onToggle,
  members = [],
  projectId,
  projectSlug,
  editValues,
  modalContainer,
  isEditMode
}: Props & { modalContainer: RefObject<HTMLDivElement>; isEditMode: boolean }) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    resetField,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: editValues
      ? ({
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
          userBypassers:
            editValues?.bypassers
              ?.filter((bypasser) => bypasser.type === BypasserType.User)
              .map(({ id, type }) => ({ id, type: type as BypasserType.User })) || [],
          groupBypassers:
            editValues?.bypassers
              ?.filter((bypasser) => bypasser.type === BypasserType.Group)
              .map(({ id, type }) => ({ id, type: type as BypasserType.Group })) || [],
          approvals: editValues?.approvals,
          allowedSelfApprovals: editValues?.allowedSelfApprovals,
          sequenceApprovers: editValues.approvers?.reduce(
            (acc, curr) => {
              if (acc.length && acc[acc.length - 1].sequence === curr.sequence) {
                acc[acc.length - 1][curr.type]?.push(curr);
                return acc;
              }
              const approvals = curr.approvalsRequired || editValues.approvals;
              acc.push(
                curr.type === ApproverType.User
                  ? {
                      user: [curr],
                      group: [],
                      sequence: 1,
                      approvals
                    }
                  : { group: [curr], user: [], sequence: 1, approvals }
              );
              return acc;
            },
            [] as { user: Approver[]; group: Approver[]; sequence?: number; approvals: number }[]
          )
        } as TFormSchema)
      : undefined,
    defaultValues: !editValues
      ? {
          secretPath: "/",
          sequenceApprovers: [{ approvals: 1 }]
        }
      : undefined
  });
  const sequenceApproversFieldArray = useFieldArray({
    control,
    name: "sequenceApprovers"
  });

  const { currentWorkspace } = useWorkspace();
  const { data: groups } = useListWorkspaceGroups(projectId);

  const environments = currentWorkspace?.environments || [];
  const isAccessPolicyType = watch("policyType") === PolicyType.AccessPolicy;

  const { mutateAsync: createAccessApprovalPolicy } = useCreateAccessApprovalPolicy();
  const { mutateAsync: updateAccessApprovalPolicy } = useUpdateAccessApprovalPolicy();

  const { mutateAsync: createSecretApprovalPolicy } = useCreateSecretApprovalPolicy();
  const { mutateAsync: updateSecretApprovalPolicy } = useUpdateSecretApprovalPolicy();

  const enforcementLevel = watch("enforcementLevel");

  const formUserBypassers = watch("userBypassers");
  const formGroupBypassers = watch("groupBypassers");
  const formEnvironment = watch("environment")?.slug;
  const bypasserCount = (formUserBypassers || []).length + (formGroupBypassers || []).length;

  const handleCreatePolicy = async ({
    environment,
    groupApprovers,
    userApprovers,
    groupBypassers,
    userBypassers,
    sequenceApprovers,
    ...data
  }: TFormSchema) => {
    if (!projectId) return;

    try {
      const bypassers = [...userBypassers, ...groupBypassers];

      if (data.policyType === PolicyType.ChangePolicy) {
        await createSecretApprovalPolicy({
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          bypassers: bypassers.length > 0 ? bypassers : undefined,
          environment: environment.slug,
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await createAccessApprovalPolicy({
          ...data,
          approvers: sequenceApprovers?.flatMap((approvers, index) =>
            approvers.user
              .map((el) => ({ ...el, sequence: index + 1 }) as Approver)
              .concat(approvers.group.map((el) => ({ ...el, sequence: index + 1 })))
          ),
          approvalsRequired: sequenceApprovers?.map((el, index) => ({
            stepNumber: index + 1,
            numberOfApprovals: el.approvals
          })),
          bypassers: bypassers.length > 0 ? bypassers : undefined,
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
    userBypassers,
    groupBypassers,
    sequenceApprovers,
    ...data
  }: TFormSchema) => {
    if (!projectId || !projectSlug) return;
    if (!editValues?.id) return;

    try {
      const bypassers = [...userBypassers, ...groupBypassers];

      if (data.policyType === PolicyType.ChangePolicy) {
        await updateSecretApprovalPolicy({
          id: editValues?.id,
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          bypassers: bypassers.length > 0 ? bypassers : undefined,
          workspaceId: currentWorkspace?.id || ""
        });
      } else {
        await updateAccessApprovalPolicy({
          id: editValues?.id,
          ...data,
          approvers: sequenceApprovers?.flatMap((approvers, index) =>
            approvers.user
              .map((el) => ({ ...el, sequence: index + 1 }) as Approver)
              .concat(approvers.group.map((el) => ({ ...el, sequence: index + 1 })))
          ),
          approvalsRequired: sequenceApprovers?.map((el, index) => ({
            stepNumber: index + 1,
            numberOfApprovals: el.approvals
          })),
          bypassers: bypassers.length > 0 ? bypassers : undefined,
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

  const bypasserMemberOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: BypasserType.User
      })),
    [members]
  );

  const bypasserGroupOptions = useMemo(
    () =>
      groups?.map(({ group }) => ({
        id: group.id,
        type: BypasserType.Group
      })),
    [groups]
  );

  const handleDragStart = (_: React.DragEvent, index: number) => {
    setDraggedItem(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverItem(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (draggedItem === null || dragOverItem === null || draggedItem === dragOverItem) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    sequenceApproversFieldArray.move(draggedItem, dragOverItem);

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className="flex flex-col space-y-3">
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="flex items-center gap-x-3">
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
                className="flex-1"
              >
                <Select
                  isDisabled={isEditMode}
                  value={value}
                  onValueChange={(val) => {
                    onChange(val as PolicyType);
                    resetField("secretPath");
                  }}
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
                className="flex-1"
              >
                <Input {...field} value={field.value || ""} />
              </FormControl>
            )}
          />
          {!isAccessPolicyType && (
            <Controller
              control={control}
              name="approvals"
              defaultValue={1}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Min. Approvals Required"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="flex-shrink"
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
          )}
        </div>
        <div className="flex items-center gap-x-3">
          <Controller
            control={control}
            name="secretPath"
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                tooltipText="Secret paths support glob patterns. For example, '/**' will match all paths."
                label="Secret Path"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
                className="flex-1"
              >
                <SecretPathInput
                  {...field}
                  value={field.value || ""}
                  environment={formEnvironment}
                />
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
                className="flex-1"
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
        </div>
        <div className="mb-2">
          <p>Approvers</p>
          <p className="font-inter text-xs text-mineshaft-300 opacity-90">
            Select members or groups that are allowed to approve requests from this policy.
          </p>
        </div>
        {isAccessPolicyType ? (
          <>
            <div className="thin-scrollbar max-h-64 space-y-2 overflow-y-auto rounded border border-mineshaft-600 bg-mineshaft-900 p-2">
              {sequenceApproversFieldArray.fields.map((el, index) => (
                <div
                  className={twMerge(
                    "rounded border border-mineshaft-500 bg-mineshaft-700 p-3 pb-0 shadow-inner",
                    dragOverItem === index ? "border-2 border-blue-400" : "",
                    draggedItem === index ? "opacity-50" : ""
                  )}
                  key={el.id}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Tag>Step {index + 1}</Tag>
                    <div className="flex items-center gap-3">
                      <div className="inline text-xs text-mineshaft-400">Min. Approvals</div>
                      <div className="mr-2 w-20 border-r border-mineshaft-400 pr-3">
                        <Controller
                          control={control}
                          name={`sequenceApprovers.${index}.approvals` as const}
                          defaultValue={1}
                          render={({ field }) => (
                            <Input
                              {...field}
                              type="number"
                              size="xs"
                              min={1}
                              onChange={(val) => field.onChange(parseInt(val.target.value, 10))}
                            />
                          )}
                        />
                      </div>
                      <Tooltip content="Remove step">
                        <IconButton
                          ariaLabel="delete"
                          variant="plain"
                          onClick={() => sequenceApproversFieldArray.remove(index)}
                          className="text-red-500 hover:text-gray-200"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip content="Drag to reorder permission">
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnd={handleDragEnd}
                          className="mr-2 cursor-move text-gray-400 hover:text-gray-200"
                        >
                          <FontAwesomeIcon icon={faGripVertical} />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Controller
                      control={control}
                      name={`sequenceApprovers.${index}.user` as const}
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl
                          label="User Approvers"
                          isError={Boolean(error)}
                          errorText={error?.message}
                          className="flex-1"
                        >
                          <FilterableSelect
                            menuPortalTarget={modalContainer.current}
                            menuPlacement="top"
                            isMulti
                            placeholder="Select members..."
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
                      name={`sequenceApprovers.${index}.group` as const}
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl
                          label="Group Approvers"
                          isError={Boolean(error)}
                          errorText={error?.message}
                          className="flex-1"
                        >
                          <FilterableSelect
                            menuPortalTarget={modalContainer.current}
                            menuPlacement="top"
                            isMulti
                            placeholder="Select groups..."
                            options={groupOptions}
                            getOptionValue={(option) => option.id}
                            getOptionLabel={(option) =>
                              groups?.find(({ group }) => group.id === option.id)?.group.name ??
                              option.id
                            }
                            value={value}
                            onChange={onChange}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="my-2">
              <Button
                size="xs"
                variant="outline_bg"
                onClick={() =>
                  sequenceApproversFieldArray.append({
                    approvals: 1,
                    user: [],
                    group: []
                  })
                }
              >
                Add Step
              </Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <Controller
              control={control}
              name="userApprovers"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="User Approvers"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="w-1/2"
                >
                  <FilterableSelect
                    menuPlacement="top"
                    isMulti
                    placeholder="Select members..."
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
                  className="w-1/2"
                >
                  <FilterableSelect
                    menuPlacement="top"
                    isMulti
                    placeholder="Select groups..."
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
          </div>
        )}
        <Controller
          control={control}
          name="allowedSelfApprovals"
          defaultValue
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl label="Self Approvals" isError={Boolean(error)} errorText={error?.message}>
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
        <Controller
          control={control}
          name="enforcementLevel"
          defaultValue={EnforcementLevel.Hard}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              label="Bypass Approvals"
              isError={Boolean(error)}
              errorText={error?.message}
              className="mb-3"
            >
              <Switch
                id="bypass-approvals"
                thumbClassName="bg-mineshaft-800"
                isChecked={value === EnforcementLevel.Soft}
                onCheckedChange={(v) => onChange(v ? EnforcementLevel.Soft : EnforcementLevel.Hard)}
              >
                Allow certain users to bypass policy in break-glass situations
              </Switch>
            </FormControl>
          )}
        />
        {enforcementLevel === EnforcementLevel.Soft && (
          <>
            <div className="flex gap-2">
              <Controller
                control={control}
                name="userBypassers"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="User Bypassers"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    className="mb-2 w-1/2"
                  >
                    <FilterableSelect
                      menuPlacement="top"
                      isMulti
                      placeholder="Select members..."
                      options={bypasserMemberOptions}
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
                name="groupBypassers"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Group Bypassers"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    className="mb-2 w-1/2"
                  >
                    <FilterableSelect
                      menuPlacement="top"
                      isMulti
                      placeholder="Select groups..."
                      options={bypasserGroupOptions}
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
            </div>

            {bypasserCount <= 0 && (
              <div className="mt-1 flex rounded-r border-l-2 border-l-red-500 bg-mineshaft-300/5 px-4 py-2.5 text-sm text-bunker-300">
                Not selecting specific users or groups will allow anyone to bypass this policy.
              </div>
            )}
          </>
        )}
        <div className="mt-8 flex items-center space-x-4">
          <Button
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Save
          </Button>
          <Button onClick={() => onToggle(false)} colorSchema="secondary" variant="plain">
            Close
          </Button>
        </div>
      </form>
    </div>
  );
};

export const AccessPolicyForm = ({ isOpen, onToggle, editValues, ...props }: Props) => {
  const modalContainer = useRef<HTMLDivElement>(null);
  const isEditMode = Boolean(editValues);

  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent
        className="max-w-3xl"
        ref={modalContainer}
        title={isEditMode ? "Edit Policy" : "Create Policy"}
      >
        <Form
          {...props}
          isOpen={isOpen}
          onToggle={onToggle}
          editValues={editValues}
          modalContainer={modalContainer}
          isEditMode={isEditMode}
        />
      </ModalContent>
    </Modal>
  );
};
