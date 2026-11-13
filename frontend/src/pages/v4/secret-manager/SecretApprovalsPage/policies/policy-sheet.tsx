import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field, FieldError } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { GlobPatternHelp, SecretPathInput } from "@infisical/cipher/ui/secret-path-input";
import { Select } from "@infisical/cipher/ui/select";
import { Separator } from "@infisical/cipher/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import slugify from "@sindresorhus/slugify";
import { isAxiosError } from "axios";
import { GripVerticalIcon } from "lucide-react";

import {
  ApproverType,
  BypasserType,
  type TAccessApprovalPolicy,
  type TApprovalPolicyApproverInput
} from "@app/hooks/api/accessApproval/types";
import type { TDelegatedApprovalPolicyInput } from "@app/hooks/api/delegatedApprovals/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import type { Project } from "@app/hooks/api/projects/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { ApproverOptions } from "../../../data/approval-policies/contract";
import { ApproverPicker } from "./approver-picker";
import { DelegatedApprovalFields } from "./delegated-approval-fields";
import { approvalPolicyFormSchema, type TApprovalPolicyFormSchema } from "./policy-form.schema";
import { groupApproversBySequence, POLICY_TYPE_LABELS } from "./policy.utils";

import styles from "./policies.module.css";

export type PolicyRecord = TAccessApprovalPolicy;

const emptyStep = () => ({ approvals: 1, user: [], group: [] });

const toDelegatedApprovalInput = (
  delegatedApproval: TApprovalPolicyFormSchema["delegatedApproval"]
): TDelegatedApprovalPolicyInput | undefined =>
  delegatedApproval?.type && delegatedApproval.connectionId
    ? { type: delegatedApproval.type, connectionId: delegatedApproval.connectionId }
    : undefined;

const editValuesOf = (policy: PolicyRecord): TApprovalPolicyFormSchema => {
  const steps = groupApproversBySequence(policy.approvers, policy.approvals);
  return {
    name: policy.name,
    policyType: policy.policyType,
    secretPath: policy.secretPath,
    environments: policy.environments.map(({ slug, name }) => ({ slug, name })),
    approvals: policy.approvals,
    userApprovers:
      policy.approvers
        ?.filter((approver) => approver.type === ApproverType.User)
        .map(({ id, name, isOrgMembershipActive }) => ({
          id,
          type: ApproverType.User as const,
          name,
          isOrgMembershipActive
        })) ?? [],
    groupApprovers:
      policy.approvers
        ?.filter((approver) => approver.type === ApproverType.Group)
        .map(({ id, name }) => ({ id, type: ApproverType.Group as const, name })) ?? [],
    userBypassers:
      policy.bypassers
        ?.filter((bypasser) => bypasser.type === BypasserType.User)
        .map(({ id }) => ({ id, type: BypasserType.User as const })) ?? [],
    groupBypassers:
      policy.bypassers
        ?.filter((bypasser) => bypasser.type === BypasserType.Group)
        .map(({ id }) => ({ id, type: BypasserType.Group as const })) ?? [],
    enforcementLevel: policy.enforcementLevel,
    allowedSelfApprovals: policy.allowedSelfApprovals,
    bypassForMachineIdentities: policy.bypassForMachineIdentities ?? true,
    maxTimePeriod: policy.maxTimePeriod,
    requestExpirationTime: policy.requestExpirationTime,
    sequenceApprovers: steps.length
      ? steps.map((step) => ({
          approvals: step.approvals,
          user: step.user.map(({ id, name, isOrgMembershipActive }) => ({
            id,
            type: ApproverType.User as const,
            name,
            isOrgMembershipActive
          })),
          group: step.group.map(({ id, name }) => ({
            id,
            type: ApproverType.Group as const,
            name
          }))
        }))
      : [emptyStep()],
    isDelegated: Boolean(policy.delegatedApproval),
    delegatedApproval: policy.delegatedApproval ?? {}
  };
};

const createValues = (policyType: PolicyType): TApprovalPolicyFormSchema => ({
  name: "",
  policyType,
  secretPath: "/",
  environments: [],
  approvals: 1,
  userApprovers: [],
  groupApprovers: [],
  userBypassers: [],
  groupBypassers: [],
  enforcementLevel: EnforcementLevel.Hard,
  allowedSelfApprovals: true,
  bypassForMachineIdentities: false,
  sequenceApprovers: [emptyStep()],
  isDelegated: false,
  delegatedApproval: {}
});

const errorText = (...errors: ({ message?: string } | undefined)[]) =>
  errors.find((error) => error?.message)?.message;

const PolicyForm = ({
  project,
  policy,
  initialPolicyType,
  approverOptions,
  enterpriseAppConnections,
  onDirtyChange,
  onDone
}: {
  project: Project;
  policy?: PolicyRecord;
  initialPolicyType: PolicyType;
  approverOptions: ApproverOptions;
  enterpriseAppConnections: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
}) => {
  const adapter = useV4Adapter("approvalPolicies");
  const createChange = adapter.useCreateChangePolicy();
  const updateChange = adapter.useUpdateChangePolicy();
  const createAccess = adapter.useCreateAccessPolicy();
  const updateAccess = adapter.useUpdateAccessPolicy();
  const isEdit = Boolean(policy);
  const defaultValues = useMemo(
    () => (policy ? editValuesOf(policy) : createValues(initialPolicyType)),
    [policy, initialPolicyType]
  );
  const form = useForm<TApprovalPolicyFormSchema>({
    resolver: zodResolver(approvalPolicyFormSchema),
    defaultValues
  });
  const {
    control,
    handleSubmit,
    setValue,
    setError,
    resetField,
    trigger,
    formState: { errors, isDirty, isSubmitting }
  } = form;
  const steps = useFieldArray({ control, name: "sequenceApprovers" });
  const [dragged, setDragged] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [parentPath, setParentPath] = useState("/");
  const { members, groups } = approverOptions;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const values = useWatch({ control }) as TApprovalPolicyFormSchema;
  const isAccess = values.policyType === PolicyType.AccessPolicy;
  const isDelegated = isAccess && values.isDelegated;
  const isLegacy = Boolean(policy) && policy?.delegatedApproval === undefined;
  const firstEnvironment = values.environments?.[0]?.slug ?? "";
  const { data: folders = [] } = useV4Adapter("secretPolicies").useFolders({
    projectId: project.id,
    environment: firstEnvironment,
    path: parentPath,
    enabled: Boolean(firstEnvironment)
  });
  const suggestedName =
    isEdit || !values.environments?.length
      ? ""
      : slugify(
          [
            POLICY_TYPE_LABELS[values.policyType],
            ...values.environments.map((env) => env.slug),
            values.secretPath ?? ""
          ].join(" "),
          { lowercase: true, decamelize: false }
        )
          .slice(0, 255)
          .replace(/-+$/, "");
  const bypasserCount = (values.userBypassers?.length ?? 0) + (values.groupBypassers?.length ?? 0);

  const submit = async ({
    environments,
    userApprovers,
    groupApprovers,
    userBypassers,
    groupBypassers,
    sequenceApprovers,
    isDelegated: delegated,
    delegatedApproval,
    ...data
  }: TApprovalPolicyFormSchema) => {
    const bypassers = [...userBypassers, ...groupBypassers];
    const slugs = environments.map((env) => env.slug);
    const stepApprovers = sequenceApprovers?.flatMap((step, index) =>
      step.user
        .map((entry) => ({ ...entry, sequence: index + 1 }) as TApprovalPolicyApproverInput)
        .concat(step.group.map((entry) => ({ ...entry, sequence: index + 1 })))
    );
    const approvalsRequired = sequenceApprovers?.map((step, index) => ({
      stepNumber: index + 1,
      numberOfApprovals: step.approvals
    }));
    try {
      if (data.policyType === PolicyType.ChangePolicy) {
        const dto = {
          ...data,
          approvers: [...userApprovers, ...groupApprovers],
          bypassers: bypassers.length > 0 ? bypassers : undefined,
          environments: slugs,
          projectId: project.id
        };
        if (policy) await updateChange.mutateAsync({ id: policy.id, ...dto });
        else await createChange.mutateAsync(dto);
      } else if (delegated) {
        const dto = {
          ...data,
          enforcementLevel: EnforcementLevel.Hard,
          allowedSelfApprovals: false,
          delegatedApproval: toDelegatedApprovalInput(delegatedApproval),
          environments: slugs,
          projectSlug: project.slug
        };
        if (policy) await updateAccess.mutateAsync({ id: policy.id, ...dto });
        else await createAccess.mutateAsync(dto);
      } else {
        const dto = {
          ...data,
          approvers: stepApprovers,
          approvalsRequired,
          bypassers: bypassers.length > 0 ? bypassers : undefined,
          environments: slugs,
          projectSlug: project.slug
        };
        if (policy)
          await updateAccess.mutateAsync({
            id: policy.id,
            ...dto,
            delegatedApproval: policy.delegatedApproval ? null : undefined
          });
        else await createAccess.mutateAsync(dto);
      }
      saved(policy ? "Policy updated" : "Policy created");
      onDone();
    } catch (error) {
      const message: unknown = isAxiosError(error)
        ? error.response?.data?.message
        : (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      if (
        typeof message === "string" &&
        message.startsWith("A policy for secret path") &&
        message.includes("already exists in environment")
      ) {
        setError("secretPath", { type: "server", message }, { shouldFocus: true });
        return;
      }
      failed(policy ? "Couldn't update policy" : "Couldn't create policy", error);
    }
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.fields.length || from === to) return;
    steps.move(from, to);
  };

  const stepPicker = (index: number) => {
    const step = values.sequenceApprovers?.[index];
    return (
      <ApproverPicker
        label={`Approvers for step ${index + 1}`}
        placeholder="Select approvers"
        members={members}
        groups={groups}
        users={step?.user ?? []}
        groupsValue={step?.group ?? []}
        userType={ApproverType.User}
        groupType={ApproverType.Group}
        invalid={Boolean(
          errors.sequenceApprovers?.[index]?.user || errors.sequenceApprovers?.[index]?.group
        )}
        onChange={({ users, groups: picked }) => {
          setValue(`sequenceApprovers.${index}.user`, users, { shouldDirty: true });
          setValue(`sequenceApprovers.${index}.group`, picked, { shouldDirty: true });
          trigger([
            `sequenceApprovers.${index}.user`,
            `sequenceApprovers.${index}.group`,
            `sequenceApprovers.${index}.approvals`
          ]);
        }}
      />
    );
  };

  const minApprovals = (index: number, label: string) => (
    <Controller
      control={control}
      name={`sequenceApprovers.${index}.approvals` as const}
      render={({ field }) => (
        <Input
          {...field}
          aria-label={label}
          type="number"
          min={1}
          invalid={Boolean(errors.sequenceApprovers?.[index]?.approvals)}
          onChange={(event) => field.onChange(parseInt(event.target.value, 10))}
        />
      )}
    />
  );

  const stepError = (index: number) =>
    errorText(
      errors.sequenceApprovers?.[index]?.user as { message?: string } | undefined,
      errors.sequenceApprovers?.[index]?.group as { message?: string } | undefined,
      errors.sequenceApprovers?.[index]?.approvals
    );

  return (
    <FormProvider {...form}>
      <SheetContent size="md" pending={isSubmitting}>
        <form noValidate autoComplete="off" onSubmit={handleSubmit(submit)}>
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit policy" : "Add policy"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Stack gap={24}>
              {approverOptions.isError && (
                <Alert
                  tone="bad"
                  title="Couldn't load all approver suggestions"
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      icon="sync"
                      loading={approverOptions.isFetching}
                      onClick={approverOptions.refetch}
                    >
                      Retry
                    </Button>
                  }
                >
                  You can still enter exact project member emails.
                </Alert>
              )}
              <Stack gap={16}>
                <Controller
                  control={control}
                  name="policyType"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="Policy type"
                      help="Change policies govern secret changes in an environment and secret path. Access policies let people without access request it for an environment and secret path."
                      wide
                    >
                      <Select
                        label="Policy type"
                        value={value}
                        disabled={isEdit}
                        options={Object.values(PolicyType).map((type) => ({
                          value: type,
                          label: POLICY_TYPE_LABELS[type]
                        }))}
                        onChange={(next) => {
                          onChange(next);
                          resetField("secretPath");
                        }}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Name" optional error={error?.message} wide>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder={suggestedName || "production-approvals"}
                        invalid={Boolean(error)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Tab" &&
                            !event.shiftKey &&
                            suggestedName &&
                            !field.value
                          ) {
                            event.preventDefault();
                            field.onChange(suggestedName);
                          }
                        }}
                        trailing={
                          suggestedName && !field.value ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => field.onChange(suggestedName)}
                            >
                              Use
                            </Button>
                          ) : undefined
                        }
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="environments"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field label="Environments" error={error?.message} wide>
                      <MultiSelect
                        label="Environments"
                        placeholder="Select environments"
                        searchable
                        invalid={Boolean(error)}
                        options={project.environments.map((env) => ({
                          value: env.slug,
                          label: env.name
                        }))}
                        value={value.map((env) => env.slug)}
                        onChange={(next) =>
                          onChange(
                            project.environments
                              .filter((env) => next.includes(env.slug))
                              .map(({ slug, name }) => ({ slug, name }))
                          )
                        }
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="secretPath"
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="Secret path"
                      help={<GlobPatternHelp />}
                      error={error?.message}
                      wide
                    >
                      <SecretPathInput
                        name={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={Boolean(error)}
                        folders={folders.map((folder) => folder.name)}
                        onParentPathChange={setParentPath}
                      />
                    </Field>
                  )}
                />
                {isAccess && (
                  <div className={styles.pair}>
                    <Controller
                      control={control}
                      name="maxTimePeriod"
                      render={({ field, fieldState: { error } }) => (
                        <Field
                          label="Max time period"
                          help="The longest time someone can request access for, such as 1h, 3w or 30d."
                          error={error?.message}
                        >
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="permanent"
                            invalid={Boolean(error)}
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="requestExpirationTime"
                      render={({ field, fieldState: { error } }) => (
                        <Field
                          label="Request expiration"
                          help="Time before an unapproved request expires, such as 1h, 3d or 72h."
                          error={error?.message}
                        >
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="never expires"
                            invalid={Boolean(error)}
                          />
                        </Field>
                      )}
                    />
                  </div>
                )}
                {!isAccess && (
                  <Controller
                    control={control}
                    name="approvals"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Min. approvals required" error={error?.message}>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          invalid={Boolean(error)}
                          onChange={(event) => field.onChange(parseInt(event.target.value, 10))}
                        />
                      </Field>
                    )}
                  />
                )}
              </Stack>
              {isAccess && (
                <>
                  <Separator />
                  <Controller
                    control={control}
                    name="isDelegated"
                    render={({ field: { value, onChange } }) => (
                      <Field
                        label="Approval workflow"
                        group
                        wide
                        description={
                          (isLegacy &&
                            "This policy can't use an external approval system. Create a new policy to use one.") ||
                          (value
                            ? "Requests under this policy can't be approved in Infisical."
                            : "Infisical approvers in this project review requests.")
                        }
                      >
                        <ToggleGroup
                          type="single"
                          width="full"
                          aria-label="Approval workflow"
                          value={value ? "external" : "infisical"}
                          onValueChange={(next) => {
                            if (!next) return;
                            onChange(next === "external");
                            if (next === "infisical" && !steps.fields.length)
                              steps.append(emptyStep());
                          }}
                        >
                          <ToggleGroupItem value="infisical">Infisical</ToggleGroupItem>
                          <ToggleGroupItem value="external" disabled={isLegacy}>
                            External approval system
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                    )}
                  />
                </>
              )}
              {isDelegated ? (
                <DelegatedApprovalFields
                  projectId={project.id}
                  enterpriseAppConnections={enterpriseAppConnections}
                />
              ) : (
                <Stack gap={16}>
                  {isAccess ? (
                    <Stack gap={12}>
                      {steps.fields.length === 1 ? (
                        <div className={styles.stepSingle}>
                          <Field
                            label="Approvers"
                            description="Select members or groups, or type an exact project member email."
                            error={stepError(0)}
                          >
                            {stepPicker(0)}
                          </Field>
                          <Field label="Min. approvals">{minApprovals(0, "Min. approvals")}</Field>
                        </div>
                      ) : (
                        <Stack gap={8}>
                          <span className={styles.groupLabel}>Approval steps</span>
                          <ol className={styles.steps} aria-label="Approval steps">
                            {steps.fields.map((step, index) => (
                              <li
                                key={step.id}
                                className={styles.step}
                                data-drag-over={dragOver === index || undefined}
                                data-dragging={dragged === index || undefined}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  setDragOver(index);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (dragged !== null) moveStep(dragged, index);
                                  setDragged(null);
                                  setDragOver(null);
                                }}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  iconOnly
                                  draggable
                                  aria-label={`Reorder step ${index + 1}`}
                                  title="Drag or use the arrow keys to reorder"
                                  onDragStart={() => setDragged(index)}
                                  onDragEnd={() => {
                                    setDragged(null);
                                    setDragOver(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "ArrowUp") {
                                      event.preventDefault();
                                      moveStep(index, index - 1);
                                    }
                                    if (event.key === "ArrowDown") {
                                      event.preventDefault();
                                      moveStep(index, index + 1);
                                    }
                                  }}
                                >
                                  <Icon icon={GripVerticalIcon} />
                                </Button>
                                <Badge tone="soft">Step {index + 1}</Badge>
                                <Stack gap={4} className={styles.stepPicker}>
                                  {stepPicker(index)}
                                  {stepError(index) && (
                                    <FieldError errors={[{ message: stepError(index) }]} />
                                  )}
                                </Stack>
                                <div className={styles.stepMin}>
                                  {minApprovals(index, `Min. approvals for step ${index + 1}`)}
                                </div>
                                <Button
                                  type="button"
                                  variant="danger-ghost"
                                  size="icon-xs"
                                  iconOnly
                                  icon="trash"
                                  aria-label={`Remove step ${index + 1}`}
                                  onClick={() => steps.remove(index)}
                                />
                              </li>
                            ))}
                          </ol>
                        </Stack>
                      )}
                      <Inline gap={8}>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          icon="plus"
                          onClick={() => steps.append(emptyStep())}
                        >
                          Add step
                        </Button>
                      </Inline>
                      {errorText(
                        errors.sequenceApprovers as { message?: string } | undefined,
                        errors.sequenceApprovers?.root
                      ) && (
                        <FieldError
                          errors={[
                            {
                              message: errorText(
                                errors.sequenceApprovers as { message?: string } | undefined,
                                errors.sequenceApprovers?.root
                              )
                            }
                          ]}
                        />
                      )}
                    </Stack>
                  ) : (
                    <Field
                      label="Approvers"
                      description="Select members or groups, or type an exact project member email."
                      error={errorText(
                        errors.userApprovers as { message?: string } | undefined,
                        errors.groupApprovers as { message?: string } | undefined
                      )}
                      wide
                    >
                      <ApproverPicker
                        label="Approvers"
                        placeholder="Select approvers"
                        members={members}
                        groups={groups}
                        users={values.userApprovers ?? []}
                        groupsValue={values.groupApprovers ?? []}
                        userType={ApproverType.User}
                        groupType={ApproverType.Group}
                        invalid={Boolean(errors.userApprovers || errors.groupApprovers)}
                        onChange={({ users, groups: picked }) => {
                          setValue("userApprovers", users, { shouldDirty: true });
                          setValue("groupApprovers", picked, { shouldDirty: true });
                          trigger(["userApprovers", "groupApprovers", "approvals"]);
                        }}
                      />
                    </Field>
                  )}
                  <Separator />
                  <Controller
                    control={control}
                    name="allowedSelfApprovals"
                    render={({ field: { value, onChange } }) => (
                      <Switch
                        layout="row"
                        label="Self approvals"
                        description="Approvers can review their own requests."
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    )}
                  />
                  {!isAccess && (
                    <Controller
                      control={control}
                      name="bypassForMachineIdentities"
                      render={({ field: { value, onChange } }) => (
                        <Switch
                          layout="row"
                          label="Bypass approval for machine identities"
                          description="Machine identities can change secrets without approval."
                          checked={value}
                          onCheckedChange={onChange}
                        />
                      )}
                    />
                  )}
                  <Controller
                    control={control}
                    name="enforcementLevel"
                    render={({ field: { value, onChange } }) => (
                      <Switch
                        layout="row"
                        label="Bypass approvals"
                        description="Selected people can bypass this policy in break-glass situations."
                        checked={value === EnforcementLevel.Soft}
                        onCheckedChange={(next) =>
                          onChange(next ? EnforcementLevel.Soft : EnforcementLevel.Hard)
                        }
                      />
                    )}
                  />
                  {values.enforcementLevel === EnforcementLevel.Soft && (
                    <>
                      <Field
                        label="Bypassers"
                        error={errorText(
                          errors.userBypassers as { message?: string } | undefined,
                          errors.groupBypassers as { message?: string } | undefined,
                          ...((errors.userBypassers as { message?: string }[] | undefined) ?? [])
                        )}
                        wide
                      >
                        <ApproverPicker
                          label="Bypassers"
                          placeholder="Select bypassers"
                          members={members}
                          groups={groups}
                          users={values.userBypassers ?? []}
                          groupsValue={values.groupBypassers ?? []}
                          userType={BypasserType.User}
                          groupType={BypasserType.Group}
                          invalid={Boolean(errors.userBypassers || errors.groupBypassers)}
                          onChange={({ users, groups: picked }) => {
                            setValue("userBypassers", users, { shouldDirty: true });
                            setValue("groupBypassers", picked, { shouldDirty: true });
                            trigger(["userBypassers", "groupBypassers"]);
                          }}
                        />
                      </Field>
                      {bypasserCount <= 0 && (
                        <Alert tone="warn">
                          {isAccess && values.allowedSelfApprovals === false
                            ? "Self approvals are off, so nobody can bypass this policy until you select bypassers."
                            : "Without specific users or groups, anyone can bypass this policy."}
                        </Alert>
                      )}
                    </>
                  )}
                </Stack>
              )}
            </Stack>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? "Save changes" : "Add policy"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </FormProvider>
  );
};

export const PolicySheet = ({
  open,
  onOpenChange,
  policy,
  initialPolicyType = PolicyType.ChangePolicy,
  project,
  approverOptions,
  enterpriseAppConnections
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: PolicyRecord;
  initialPolicyType?: PolicyType;
  project: Project;
  approverOptions: ApproverOptions;
  enterpriseAppConnections: boolean;
}) => {
  const [dirty, setDirty] = useState(false);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession(session + 1);
  }
  const close = () => {
    setDirty(false);
    onOpenChange(false);
  };
  const guard = useDiscardChangesGuard({ isDirty: dirty, onDiscard: close });
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else guard.requestDiscard();
        }}
      >
        <PolicyForm
          key={session}
          project={project}
          policy={policy}
          initialPolicyType={initialPolicyType}
          approverOptions={approverOptions}
          enterpriseAppConnections={enterpriseAppConnections}
          onDirtyChange={setDirty}
          onDone={close}
        />
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved policy changes will be lost."
      />
    </>
  );
};
