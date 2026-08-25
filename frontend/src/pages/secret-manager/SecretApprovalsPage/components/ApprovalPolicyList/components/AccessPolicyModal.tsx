import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CircleAlertIcon,
  GripVerticalIcon,
  InfoIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  FilterableSelect,
  IconButton,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { getMemberLabel } from "@app/helpers/members";
import { policyDetails } from "@app/helpers/policies";
import { useDiscardChangesGuard } from "@app/hooks";
import { useCreateSecretApprovalPolicy, useUpdateSecretApprovalPolicy } from "@app/hooks/api";
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
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { approvalPolicyFormSchema, TApprovalPolicyFormSchema } from "./approvalPolicyFormSchema";
import { groupApproversBySequence } from "./approvalPolicyRowUtils";
import { ApproverMultiValueLabel, ApproverOption, ApproverOptionData } from "./ApproverOption";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  members?: TWorkspaceUser[];
  groups?: TGroupMembership[];
  projectId: string;
  projectSlug: string;
  editValues?: TAccessApprovalPolicy;
  hasApproverOptionsError: boolean;
  isRetryingApproverOptions: boolean;
  onRetryApproverOptions: () => void;
};

const Form = ({
  onToggle,
  members = [],
  groups = [],
  projectId,
  projectSlug,
  editValues,
  isEditMode,
  onDirtyChange,
  onSubmittingChange,
  onRequestClose,
  hasApproverOptionsError,
  isRetryingApproverOptions,
  onRetryApproverOptions
}: Props & {
  isEditMode: boolean;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmittingChange: (isSubmitting: boolean) => void;
  onRequestClose: () => void;
}) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const editFormValues = useMemo<TApprovalPolicyFormSchema | undefined>(
    () =>
      editValues
        ? ({
            ...editValues,
            environments: editValues.environments,
            userApprovers:
              editValues.approvers
                ?.filter((approver) => approver.type === ApproverType.User)
                .map(({ id, type, isOrgMembershipActive }) => ({
                  id,
                  type: type as ApproverType.User,
                  isOrgMembershipActive
                })) || [],
            groupApprovers:
              editValues.approvers
                ?.filter((approver) => approver.type === ApproverType.Group)
                .map(({ id, type }) => ({ id, type: type as ApproverType.Group })) || [],
            userBypassers:
              editValues.bypassers
                ?.filter((bypasser) => bypasser.type === BypasserType.User)
                .map(({ id, type }) => ({ id, type: type as BypasserType.User })) || [],
            groupBypassers:
              editValues.bypassers
                ?.filter((bypasser) => bypasser.type === BypasserType.Group)
                .map(({ id, type }) => ({ id, type: type as BypasserType.Group })) || [],
            approvals: editValues.approvals,
            allowedSelfApprovals: editValues.allowedSelfApprovals,
            bypassForMachineIdentities: editValues.bypassForMachineIdentities ?? true,
            maxTimePeriod: editValues.maxTimePeriod,
            requestExpirationTime: editValues.requestExpirationTime,
            sequenceApprovers: groupApproversBySequence(editValues.approvers, editValues.approvals)
          } as TApprovalPolicyFormSchema)
        : undefined,
    [editValues]
  );
  const {
    control,
    handleSubmit,
    watch,
    resetField,
    setValue,
    formState: { isDirty, isSubmitting, errors }
  } = useForm<TApprovalPolicyFormSchema>({
    resolver: zodResolver(approvalPolicyFormSchema),
    values: editFormValues,
    defaultValues: !editValues
      ? {
          secretPath: "/",
          sequenceApprovers: [{ approvals: 1 }]
        }
      : undefined
  });

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => onSubmittingChange(isSubmitting), [isSubmitting, onSubmittingChange]);

  const sequenceApproversFieldArray = useFieldArray({
    control,
    name: "sequenceApprovers"
  });

  const { currentProject } = useProject();

  const availableEnvironments = currentProject?.environments || [];
  const isAccessPolicyType = watch("policyType") === PolicyType.AccessPolicy;

  const { mutateAsync: createAccessApprovalPolicy } = useCreateAccessApprovalPolicy();
  const { mutateAsync: updateAccessApprovalPolicy } = useUpdateAccessApprovalPolicy();

  const { mutateAsync: createSecretApprovalPolicy } = useCreateSecretApprovalPolicy();
  const { mutateAsync: updateSecretApprovalPolicy } = useUpdateSecretApprovalPolicy();

  const enforcementLevel = watch("enforcementLevel");

  const formUserApprovers = watch("userApprovers");
  const formGroupApprovers = watch("groupApprovers");
  const formUserBypassers = watch("userBypassers");
  const formGroupBypassers = watch("groupBypassers");
  const formEnvironments = watch("environments");
  const bypasserCount = (formUserBypassers || []).length + (formGroupBypassers || []).length;

  const handleCreatePolicy = async ({
    environments,
    groupApprovers,
    userApprovers,
    groupBypassers,
    userBypassers,
    sequenceApprovers,
    ...data
  }: TApprovalPolicyFormSchema) => {
    if (!projectId) return;

    const bypassers = [...userBypassers, ...groupBypassers];

    if (data.policyType === PolicyType.ChangePolicy) {
      await createSecretApprovalPolicy({
        ...data,
        approvers: [...userApprovers, ...groupApprovers],
        bypassers: bypassers.length > 0 ? bypassers : undefined,
        environments: environments.map((env) => env.slug),
        projectId: currentProject?.id || ""
      });
    } else {
      await createAccessApprovalPolicy({
        ...data,
        approvers: sequenceApprovers?.flatMap((approvers, index) =>
          approvers.user
            .map(
              (el) => ({ ...el, sequence: index + 1 }) as Omit<Approver, "isOrgMembershipActive">
            )
            .concat(approvers.group.map((el) => ({ ...el, sequence: index + 1 })))
        ),
        approvalsRequired: sequenceApprovers?.map((el, index) => ({
          stepNumber: index + 1,
          numberOfApprovals: el.approvals
        })),
        bypassers: bypassers.length > 0 ? bypassers : undefined,
        environments: environments.map((env) => env.slug),
        projectSlug
      });
    }
    createNotification({
      type: "success",
      text: "Successfully created policy"
    });
    onToggle(false);
  };

  const handleUpdatePolicy = async ({
    environments,
    userApprovers,
    groupApprovers,
    userBypassers,
    groupBypassers,
    sequenceApprovers,
    ...data
  }: TApprovalPolicyFormSchema) => {
    if (!projectId || !projectSlug) return;
    if (!editValues?.id) return;

    const bypassers = [...userBypassers, ...groupBypassers];

    if (data.policyType === PolicyType.ChangePolicy) {
      await updateSecretApprovalPolicy({
        id: editValues?.id,
        ...data,
        approvers: [...userApprovers, ...groupApprovers],
        bypassers: bypassers.length > 0 ? bypassers : undefined,
        projectId: currentProject?.id || "",
        environments: environments.map((env) => env.slug)
      });
    } else {
      await updateAccessApprovalPolicy({
        id: editValues?.id,
        ...data,
        approvers: sequenceApprovers?.flatMap((approvers, index) =>
          approvers.user
            .map(
              (el) => ({ ...el, sequence: index + 1 }) as Omit<Approver, "isOrgMembershipActive">
            )
            .concat(approvers.group.map((el) => ({ ...el, sequence: index + 1 })))
        ),
        approvalsRequired: sequenceApprovers?.map((el, index) => ({
          stepNumber: index + 1,
          numberOfApprovals: el.approvals
        })),
        bypassers: bypassers.length > 0 ? bypassers : undefined,
        environments: environments.map((env) => env.slug),
        projectSlug
      });
    }
    createNotification({
      type: "success",
      text: "Successfully updated policy"
    });
    onToggle(false);
  };

  const handleFormSubmit = async (data: TApprovalPolicyFormSchema) => {
    if (isEditMode) {
      await handleUpdatePolicy(data);
    } else {
      await handleCreatePolicy(data);
    }
  };

  const memberOptions: Omit<Approver, "sequence" | "approvalsRequired">[] = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: ApproverType.User,
        name: member.user.username,
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

  const approverOptions = useMemo<ApproverOptionData[]>(
    () => [...memberOptions, ...(groupOptions ?? [])],
    [memberOptions, groupOptions]
  );

  const getApproverLabel = (option: ApproverOptionData) => {
    if (option.type === ApproverType.Group) {
      return groups?.find(({ group }) => group.id === option.id)?.group.name ?? option.id;
    }
    const member = members?.find((m) => m.user.id === option.id);
    if (!member) return option.name || option.id;
    return getMemberLabel(member);
  };

  const splitSelectedApprovers = (selected: readonly ApproverOptionData[]) => ({
    users: selected
      .filter((option) => option.type === ApproverType.User)
      .map((option) => ({
        type: ApproverType.User as const,
        id: option.id,
        name: option.name,
        isOrgMembershipActive: option.isOrgMembershipActive
      })),
    groups: selected
      .filter((option) => option.type === ApproverType.Group)
      .map((option) => ({ type: ApproverType.Group as const, id: option.id }))
  });

  const bypasserMemberOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.user.id,
        type: BypasserType.User,
        isOrgMembershipActive: member.user.isOrgMembershipActive
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

  const bypasserOptions = useMemo<ApproverOptionData[]>(
    () => [...bypasserMemberOptions, ...(bypasserGroupOptions ?? [])],
    [bypasserMemberOptions, bypasserGroupOptions]
  );

  const getBypasserLabel = (option: ApproverOptionData) => {
    if (option.type === BypasserType.Group) {
      return groups?.find(({ group }) => group.id === option.id)?.group.name ?? option.id;
    }
    const member = members?.find((m) => m.user.id === option.id);
    if (!member) return option.name || option.id;
    return getMemberLabel(member);
  };

  const splitSelectedBypassers = (selected: readonly ApproverOptionData[]) => ({
    users: selected
      .filter((option) => option.type === BypasserType.User)
      .map((option) => ({
        type: BypasserType.User as const,
        id: option.id,
        isOrgMembershipActive: option.isOrgMembershipActive
      })),
    groups: selected
      .filter((option) => option.type === BypasserType.Group)
      .map((option) => ({ type: BypasserType.Group as const, id: option.id }))
  });

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

  const handleReorderKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      sequenceApproversFieldArray.move(index, index - 1);
    }

    if (event.key === "ArrowDown" && index < sequenceApproversFieldArray.fields.length - 1) {
      event.preventDefault();
      sequenceApproversFieldArray.move(index, index + 1);
    }
  };

  const renderApproverSelect = (index: number) => (
    <FilterableSelect
      menuPosition="fixed"
      isMulti
      placeholder="Select members or groups..."
      options={approverOptions}
      components={{
        Option: ApproverOption,
        MultiValueLabel: ApproverMultiValueLabel
      }}
      getOptionValue={(option) => `${option.type}-${option.id}`}
      getOptionLabel={getApproverLabel}
      value={[
        ...(watch(`sequenceApprovers.${index}.user`) ?? []),
        ...(watch(`sequenceApprovers.${index}.group`) ?? [])
      ]}
      onChange={(newValue) => {
        const { users, groups: selectedGroups } = splitSelectedApprovers(
          newValue as ApproverOptionData[]
        );
        setValue(`sequenceApprovers.${index}.user`, users, {
          shouldDirty: true,
          shouldValidate: true
        });
        setValue(`sequenceApprovers.${index}.group`, selectedGroups, {
          shouldDirty: true,
          shouldValidate: true
        });
      }}
      isError={Boolean(
        errors.sequenceApprovers?.[index]?.user || errors.sequenceApprovers?.[index]?.group
      )}
    />
  );

  const renderMinApprovals = (index: number, inputClassName: string) => (
    <Controller
      control={control}
      name={`sequenceApprovers.${index}.approvals` as const}
      defaultValue={1}
      render={({ field }) => (
        <Input
          {...field}
          type="number"
          min={1}
          className={inputClassName}
          onChange={(val) => field.onChange(parseInt(val.target.value, 10))}
        />
      )}
    />
  );

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        {hasApproverOptionsError && (
          <Alert variant="danger">
            <CircleAlertIcon />
            <AlertTitle>Could not load approver options</AlertTitle>
            <AlertDescription>
              <span>Retry before saving this approval policy.</span>
              <Button
                size="xs"
                variant="danger"
                type="button"
                isPending={isRetryingApproverOptions}
                isDisabled={isRetryingApproverOptions}
                onClick={onRetryApproverOptions}
              >
                <RefreshCwIcon />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Controller
          control={control}
          name="policyType"
          defaultValue={PolicyType.ChangePolicy}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Policy type
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Change policies govern secret changes within a given environment and secret
                    path. Access policies allow underprivileged users to request access to an
                    environment and secret path.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <Select
                  value={value}
                  onValueChange={(val) => {
                    onChange(val as PolicyType);
                    resetField("secretPath");
                  }}
                  disabled={isEditMode}
                >
                  <SelectTrigger className="w-full" isError={Boolean(error)}>
                    <SelectValue placeholder="Select policy type" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(PolicyType).map((policyType) => (
                      <SelectItem value={policyType} key={`policy-type-${policyType}`}>
                        {policyDetails[policyType].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Policy name</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  value={field.value || ""}
                  placeholder="e.g. Production approvals"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="secretPath"
          defaultValue="/"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Secret path
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Secret paths support glob patterns. Use * to match a single level and ** to
                    match all nested levels. Example: /** matches all paths, /services/* matches
                    immediate children.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <SecretPathInput
                  name={field.name}
                  onBlur={field.onBlur}
                  value={field.value || ""}
                  onChange={field.onChange}
                  environment={formEnvironments?.[0]?.slug || ""}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="environments"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Environments</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={value}
                  isMulti
                  onChange={onChange}
                  placeholder="Select environments..."
                  options={availableEnvironments}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        {isAccessPolicyType && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] items-start gap-3">
            <Controller
              control={control}
              name="maxTimePeriod"
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>
                    Max. time period
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The maximum amount of time someone can request access for. Ex: 1h, 3w, 30d
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      value={field.value || ""}
                      placeholder="permanent"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="requestExpirationTime"
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>
                    Request expiration
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Time before unapproved requests expire. Ex: 1h, 3d, 72h
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      value={field.value || ""}
                      placeholder="never expires"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
        )}
        {!isAccessPolicyType && (
          <Controller
            control={control}
            name="approvals"
            defaultValue={1}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Min. approvals required</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    isError={Boolean(error)}
                    onChange={(el) => field.onChange(parseInt(el.target.value, 10))}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">Approvers</p>
          <p className="text-xs text-muted">
            Select members or groups that are allowed to approve requests from this policy.
          </p>
        </div>
        {isAccessPolicyType ? (
          <>
            {sequenceApproversFieldArray.fields.length === 1 ? (
              <div className="flex items-start gap-3">
                <Field className="min-w-0 flex-1">
                  <FieldLabel>Approvers</FieldLabel>
                  <FieldContent>
                    {renderApproverSelect(0)}
                    <FieldError
                      errors={[
                        errors.sequenceApprovers?.[0]?.user,
                        errors.sequenceApprovers?.[0]?.group
                      ]}
                    />
                  </FieldContent>
                </Field>
                <Field className="w-28">
                  <FieldLabel>Min. approvals</FieldLabel>
                  <FieldContent>{renderMinApprovals(0, "h-9 w-full")}</FieldContent>
                </Field>
              </div>
            ) : (
              <ItemGroup className="max-h-[12rem] thin-scrollbar shrink-0 gap-0 overflow-y-auto rounded-lg border border-border bg-container">
                {sequenceApproversFieldArray.fields.map((el, index) => (
                  <Fragment key={el.id}>
                    {index > 0 && <ItemSeparator className="m-0" />}
                    <Item
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={handleDrop}
                      className={twMerge(
                        "rounded-none border-0",
                        dragOverItem === index && "bg-container-hover",
                        draggedItem === index && "opacity-50"
                      )}
                    >
                      <ItemMedia>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              type="button"
                              draggable
                              aria-label={`Reorder step ${index + 1}`}
                              variant="ghost-muted"
                              size="xs"
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragEnd={handleDragEnd}
                              onKeyDown={(event) => handleReorderKeyDown(event, index)}
                              className="cursor-move"
                            >
                              <GripVerticalIcon />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>Drag or use arrow keys to reorder</TooltipContent>
                        </Tooltip>
                        <Badge variant="neutral">Step {index + 1}</Badge>
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        {renderApproverSelect(index)}
                        <FieldError
                          errors={[
                            errors.sequenceApprovers?.[index]?.user,
                            errors.sequenceApprovers?.[index]?.group
                          ]}
                        />
                      </ItemContent>
                      <ItemActions>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted">Min</span>
                          {renderMinApprovals(index, "h-8 w-14")}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              aria-label="Remove step"
                              variant="ghost"
                              size="xs"
                              onClick={() => sequenceApproversFieldArray.remove(index)}
                              className="text-danger hover:text-danger"
                            >
                              <Trash2Icon />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>Remove step</TooltipContent>
                        </Tooltip>
                      </ItemActions>
                    </Item>
                  </Fragment>
                ))}
              </ItemGroup>
            )}
            <div>
              <Button
                size="xs"
                variant="outline"
                type="button"
                onClick={() =>
                  sequenceApproversFieldArray.append({
                    approvals: 1,
                    user: [],
                    group: []
                  })
                }
              >
                <PlusIcon />
                Add step
              </Button>
            </div>
          </>
        ) : (
          <Field>
            <FieldLabel>Approvers</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isMulti
                placeholder="Select members or groups..."
                options={approverOptions}
                components={{
                  Option: ApproverOption,
                  MultiValueLabel: ApproverMultiValueLabel
                }}
                getOptionValue={(option) => `${option.type}-${option.id}`}
                getOptionLabel={getApproverLabel}
                value={[...(formUserApprovers ?? []), ...(formGroupApprovers ?? [])]}
                onChange={(newValue) => {
                  const { users, groups: selectedGroups } = splitSelectedApprovers(
                    newValue as ApproverOptionData[]
                  );
                  setValue("userApprovers", users, { shouldDirty: true, shouldValidate: true });
                  setValue("groupApprovers", selectedGroups, {
                    shouldDirty: true,
                    shouldValidate: true
                  });
                }}
                isError={Boolean(errors.userApprovers || errors.groupApprovers)}
              />
              <FieldError errors={[errors.userApprovers, errors.groupApprovers]} />
            </FieldContent>
          </Field>
        )}
        <Controller
          control={control}
          name="allowedSelfApprovals"
          defaultValue
          render={({ field: { value, onChange } }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Self approvals</FieldTitle>
                <FieldDescription>Allow approvers to review their own requests</FieldDescription>
              </FieldContent>
              <Switch
                id="self-approvals"
                aria-label="Allow self approvals"
                variant="project"
                checked={value}
                onCheckedChange={onChange}
              />
            </Field>
          )}
        />
        {!isAccessPolicyType && (
          <Controller
            control={control}
            name="bypassForMachineIdentities"
            render={({ field: { value, onChange } }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Bypass approval for machine identities</FieldTitle>
                  <FieldDescription>
                    When enabled, machine identities can modify secrets without requiring approval
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="bypass-machine-identities"
                  aria-label="Bypass approval for machine identities"
                  variant="project"
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="enforcementLevel"
          defaultValue={EnforcementLevel.Hard}
          render={({ field: { value, onChange } }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Bypass approvals</FieldTitle>
                <FieldDescription>
                  Allow certain users to bypass policy in break-glass situations
                </FieldDescription>
              </FieldContent>
              <Switch
                id="bypass-approvals"
                aria-label="Allow approval bypass"
                variant="project"
                checked={value === EnforcementLevel.Soft}
                onCheckedChange={(v) => onChange(v ? EnforcementLevel.Soft : EnforcementLevel.Hard)}
              />
            </Field>
          )}
        />
        {enforcementLevel === EnforcementLevel.Soft && (
          <>
            <Field>
              <FieldLabel>Bypassers</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isMulti
                  placeholder="Select members or groups..."
                  options={bypasserOptions}
                  components={{
                    Option: ApproverOption,
                    MultiValueLabel: ApproverMultiValueLabel
                  }}
                  getOptionValue={(option) => `${option.type}-${option.id}`}
                  getOptionLabel={getBypasserLabel}
                  value={[...(formUserBypassers ?? []), ...(formGroupBypassers ?? [])]}
                  onChange={(newValue) => {
                    const { users, groups: selectedGroups } = splitSelectedBypassers(
                      newValue as ApproverOptionData[]
                    );
                    setValue("userBypassers", users, { shouldDirty: true, shouldValidate: true });
                    setValue("groupBypassers", selectedGroups, {
                      shouldDirty: true,
                      shouldValidate: true
                    });
                  }}
                  isError={Boolean(errors.userBypassers || errors.groupBypassers)}
                />
                <FieldError errors={[errors.userBypassers, errors.groupBypassers]} />
              </FieldContent>
            </Field>

            {bypasserCount <= 0 && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>
                  Not selecting specific users or groups will allow anyone to bypass this policy.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
      <SheetFooter className="border-t">
        <Button
          type="submit"
          variant="project"
          isPending={isSubmitting}
          isDisabled={isSubmitting || hasApproverOptionsError}
        >
          {isEditMode ? "Update policy" : "Add policy"}
        </Button>
        <Button onClick={onRequestClose} variant="outline" type="button" isDisabled={isSubmitting}>
          Close
        </Button>
      </SheetFooter>
    </form>
  );
};

export const AccessPolicyForm = ({ isOpen, onToggle, editValues, ...props }: Props) => {
  const isEditMode = Boolean(editValues);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeSheet = useCallback(() => {
    setIsDirty(false);
    setIsSubmitting(false);
    onToggle(false);
  }, [onToggle]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      if (!isSubmitting) requestDiscard();
      return;
    }

    onToggle(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>{isEditMode ? "Edit policy" : "Add policy"}</SheetTitle>
          </SheetHeader>
          <Form
            {...props}
            onToggle={closeSheet}
            editValues={editValues}
            isEditMode={isEditMode}
            onDirtyChange={setIsDirty}
            onSubmittingChange={setIsSubmitting}
            onRequestClose={requestDiscard}
          />
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard policy changes?"
        description="Your unsaved policy changes will be lost."
      />
    </>
  );
};
