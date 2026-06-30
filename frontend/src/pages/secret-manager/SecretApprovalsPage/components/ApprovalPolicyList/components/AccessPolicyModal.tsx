import { Fragment, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GripVerticalIcon, InfoIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
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

import { ApproverMultiValueLabel, ApproverOption, ApproverOptionData } from "./ApproverOption";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  members?: TWorkspaceUser[];
  projectId: string;
  projectSlug: string;
  editValues?: TAccessApprovalPolicy;
};

const MIN_EXPIRATION_MS = 60 * 1000; // 1 minute
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const durationSchema = z
  .string()
  .trim()
  .nullish()
  .superRefine((val, ctx) => {
    if (!val || val === "never") return;
    const parsed = ms(val);

    if (typeof parsed !== "number" || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid duration format. Use formats like '1h', '3d', '72h'."
      });
      return;
    }

    if (parsed < MIN_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration must be at least 1 minute."
      });
      return;
    }

    if (parsed > MAX_EXPIRATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration cannot exceed 1 year."
      });
    }
  });

const formSchema = z
  .object({
    environments: z.array(z.object({ slug: z.string(), name: z.string() })).min(1),
    name: z.string().optional(),
    secretPath: z.string().trim().min(1),
    approvals: z.number().min(1).default(1),
    userApprovers: z
      .object({
        type: z.literal(ApproverType.User),
        id: z.string(),
        name: z.string().optional(),
        isOrgMembershipActive: z.boolean().optional()
      })
      .array()
      .default([]),
    groupApprovers: z
      .object({ type: z.literal(ApproverType.Group), id: z.string() })
      .array()
      .default([]),
    userBypassers: z
      .object({
        type: z.literal(BypasserType.User),
        id: z.string(),
        isOrgMembershipActive: z.boolean().optional()
      })
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
          .object({
            type: z.literal(ApproverType.User),
            id: z.string(),
            name: z.string().optional(),
            isOrgMembershipActive: z.boolean().optional()
          })
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
      .optional(),
    maxTimePeriod: durationSchema,
    requestExpirationTime: durationSchema
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
  isEditMode
}: Props & { isEditMode: boolean }) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    resetField,
    setValue,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: editValues
      ? ({
          ...editValues,
          environments: editValues.environments,
          userApprovers:
            editValues?.approvers
              ?.filter((approver) => approver.type === ApproverType.User)
              .map(({ id, type, isOrgMembershipActive }) => ({
                id,
                type: type as ApproverType.User,
                isOrgMembershipActive
              })) || [],
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
          maxTimePeriod: editValues?.maxTimePeriod,
          requestExpirationTime: editValues?.requestExpirationTime,
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
                      sequence: curr.sequence,
                      approvals
                    }
                  : { group: [curr], user: [], sequence: curr.sequence, approvals }
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

  const { currentProject } = useProject();
  const { data: groups } = useListWorkspaceGroups(projectId);

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
  }: TFormSchema) => {
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
  }: TFormSchema) => {
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

  const handleFormSubmit = async (data: TFormSchema) => {
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
        setValue(`sequenceApprovers.${index}.user`, users, { shouldValidate: true });
        setValue(`sequenceApprovers.${index}.group`, selectedGroups, { shouldValidate: true });
      }}
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
        <Controller
          control={control}
          name="policyType"
          defaultValue={PolicyType.ChangePolicy}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Policy Type
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Change policies govern secret changes within a given environment and secret
                    path. Access policies allow underprivileged user to request access to
                    environment/secret path.
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
              <FieldLabel>Policy Name</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  value={field.value || ""}
                  placeholder="e.g. Production Approvals"
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
                Secret Path
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
          <div className="flex items-start gap-x-3">
            <Controller
              control={control}
              name="maxTimePeriod"
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>
                    Max. Time Period
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
                    Request Expiration
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
                <FieldLabel>Min. Approvals Required</FieldLabel>
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
                  <FieldContent>{renderApproverSelect(0)}</FieldContent>
                </Field>
                <Field className="w-28">
                  <FieldLabel>Min. Approvals</FieldLabel>
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
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragEnd={handleDragEnd}
                              className="cursor-move text-muted hover:text-foreground"
                            >
                              <GripVerticalIcon className="size-4" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Drag to reorder</TooltipContent>
                        </Tooltip>
                        <Badge variant="neutral">Step {index + 1}</Badge>
                      </ItemMedia>
                      <ItemContent className="min-w-0">{renderApproverSelect(index)}</ItemContent>
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
                Add Step
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
                  setValue("userApprovers", users, { shouldValidate: true });
                  setValue("groupApprovers", selectedGroups, { shouldValidate: true });
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
                <FieldTitle>Self Approvals</FieldTitle>
                <FieldDescription>Allow approvers to review their own requests</FieldDescription>
              </FieldContent>
              <Switch
                id="self-approvals"
                variant="project"
                checked={value}
                onCheckedChange={onChange}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="enforcementLevel"
          defaultValue={EnforcementLevel.Hard}
          render={({ field: { value, onChange } }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Bypass Approvals</FieldTitle>
                <FieldDescription>
                  Allow certain users to bypass policy in break-glass situations
                </FieldDescription>
              </FieldContent>
              <Switch
                id="bypass-approvals"
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
                    setValue("userBypassers", users, { shouldValidate: true });
                    setValue("groupBypassers", selectedGroups, { shouldValidate: true });
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
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          {isEditMode ? "Update Policy" : "Add Policy"}
        </Button>
        <Button onClick={() => onToggle(false)} variant="outline" type="button">
          Close
        </Button>
      </SheetFooter>
    </form>
  );
};

export const AccessPolicyForm = ({ isOpen, onToggle, editValues, ...props }: Props) => {
  const isEditMode = Boolean(editValues);

  return (
    <Sheet open={isOpen} onOpenChange={onToggle}>
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditMode ? "Edit Policy" : "Add Policy"}</SheetTitle>
        </SheetHeader>
        <Form {...props} onToggle={onToggle} editValues={editValues} isEditMode={isEditMode} />
      </SheetContent>
    </Sheet>
  );
};
