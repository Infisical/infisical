import { useId, useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldError } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
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
import { StatusText } from "@infisical/cipher/ui/text";

import type { Project } from "@app/hooks/api/projects/types";
import type { TSecretValidationRule } from "@app/hooks/api/secretValidationRules/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { ConstraintCard } from "./constraint-card";
import {
  CONSTRAINT_OPTIONS,
  ConstraintTarget,
  ConstraintType,
  DEFAULT_PREVENT_VALUE_REUSE_VERSIONS,
  DYNAMIC_SECRET_PROVIDER_OPTIONS,
  flattenConstraints,
  GENERATED_RULE_DISALLOWED_CONSTRAINTS,
  groupConstraintsByTarget,
  ORACLE_12C_MAX_PASSWORD_LENGTH,
  RULE_TYPE_LABELS,
  ruleFormSchema,
  RuleType,
  SECRET_ROTATION_PROVIDER_OPTIONS,
  SecretRotationRuleProvider,
  type TRuleForm
} from "./validation-rules.utils";

import styles from "./policies.module.css";

const RESTRICTED = "Your role doesn't allow this";
const ALL_ENVIRONMENTS = "all";

export type RulePermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canEnableBlindIndex: boolean;
};

const defaultsOf = (rule: TSecretValidationRule): TRuleForm =>
  ({
    name: rule.name,
    description: rule.description ?? undefined,
    environment: rule.environment?.slug ?? null,
    folderPath: rule.secretPath,
    enforcement: {
      type: rule.type,
      constraints:
        rule.type === RuleType.StaticSecrets
          ? [
              ...flattenConstraints(rule.keyConstraints, ConstraintTarget.SecretKey),
              ...flattenConstraints(rule.valueConstraints, ConstraintTarget.SecretValue)
            ]
          : flattenConstraints(rule.passwordConstraints, ConstraintTarget.GeneratedPassword),
      ...("providers" in rule && { providers: rule.providers })
    }
  }) as TRuleForm;

const RuleForm = ({
  formId,
  project,
  rule,
  permissions,
  onPendingChange,
  onDone
}: {
  formId: string;
  project: Project;
  rule?: TSecretValidationRule;
  permissions: RulePermissions;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const createRule = policies.useCreateValidationRule();
  const updateRule = policies.useUpdateValidationRule();
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const form = useForm<TRuleForm>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: rule
      ? defaultsOf(rule)
      : {
          name: "",
          description: "",
          environment: null,
          folderPath: "/**",
          enforcement: { type: RuleType.StaticSecrets, constraints: [] }
        }
  });
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors }
  } = form;
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "enforcement.constraints"
  });

  const constraints = watch("enforcement.constraints");
  const enforcement = watch("enforcement");
  const isGenerated = enforcement.type !== RuleType.StaticSecrets;
  const disallowed = isGenerated ? GENERATED_RULE_DISALLOWED_CONSTRAINTS : [];
  const usedPairs = new Set(constraints?.map((entry) => `${entry.type}:${entry.appliesTo}`));
  const targetsOf = (option: (typeof CONSTRAINT_OPTIONS)[number]) =>
    isGenerated
      ? [ConstraintTarget.GeneratedPassword]
      : (option.allowedTargets ?? [ConstraintTarget.SecretValue, ConstraintTarget.SecretKey]);
  const availableOptions = CONSTRAINT_OPTIONS.filter(
    (option) =>
      !disallowed.includes(option.type) &&
      targetsOf(option).some((target) => !usedPairs.has(`${option.type}:${target}`))
  );
  // Generation uses the regex to build the value, so separate length constraints are ignored.
  const hasRegexLengthConflict =
    constraints?.some((entry) => entry.type === ConstraintType.RegexPattern) &&
    constraints?.some(
      (entry) => entry.type === ConstraintType.MinLength || entry.type === ConstraintType.MaxLength
    );
  const showOracleWarning =
    enforcement.type === RuleType.SecretRotations &&
    enforcement.providers.includes(SecretRotationRuleProvider.OracleDBCredentials) &&
    constraints?.some(
      (entry) =>
        entry.type === ConstraintType.RegexPattern ||
        ((entry.type === ConstraintType.MinLength || entry.type === ConstraintType.MaxLength) &&
          Number(entry.value) > ORACLE_12C_MAX_PASSWORD_LENGTH)
    );
  const providersError = (errors.enforcement as { providers?: { message?: string } } | undefined)
    ?.providers?.message;
  const constraintsError =
    errors.enforcement?.constraints?.root?.message ?? errors.enforcement?.constraints?.message;
  const environments = [
    { value: ALL_ENVIRONMENTS, label: "All environments" },
    ...project.environments.map((env) => ({ value: env.slug, label: env.name }))
  ];

  const submit = async (data: TRuleForm) => {
    const grouped = groupConstraintsByTarget(data.enforcement.constraints);
    const isStatic = data.enforcement.type === RuleType.StaticSecrets;
    const generatedConfig = {
      providers: "providers" in data.enforcement ? data.enforcement.providers : [],
      passwordConstraints: grouped[ConstraintTarget.GeneratedPassword] ?? {}
    };
    const scope = {
      projectId: project.id,
      type: data.enforcement.type,
      name: data.name,
      description: data.description,
      secretPath: data.folderPath
    };
    onPendingChange(true);
    try {
      if (rule) {
        await updateRule.mutateAsync({
          ...scope,
          ruleId: rule.id,
          isActive,
          environment: data.environment,
          // A target whose last constraint was removed is sent as null so the rule clears it.
          ...(isStatic
            ? {
                keyConstraints: grouped[ConstraintTarget.SecretKey] ?? null,
                valueConstraints: grouped[ConstraintTarget.SecretValue] ?? null
              }
            : generatedConfig)
        });
        saved("Rule updated");
      } else {
        await createRule.mutateAsync({
          ...scope,
          environment: data.environment ?? undefined,
          ...(isStatic
            ? {
                keyConstraints: grouped[ConstraintTarget.SecretKey],
                valueConstraints: grouped[ConstraintTarget.SecretValue]
              }
            : generatedConfig)
        });
        saved("Rule created");
      }
      onDone();
    } catch {
      // The mutation error is already toasted; the sheet stays open with the form intact.
    } finally {
      onPendingChange(false);
    }
  };

  return (
    <FormProvider {...form}>
      <form id={formId} noValidate autoComplete="off" onSubmit={handleSubmit(submit)}>
        <Stack gap={24}>
          {rule && (
            <Switch layout="row" label="Enabled" checked={isActive} onCheckedChange={setIsActive} />
          )}
          <fieldset disabled={!isActive} className={styles.fieldset}>
            <Stack gap={24}>
              <Stack gap={16}>
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Name" error={error?.message} wide>
                      <Input
                        {...field}
                        placeholder="Production key naming"
                        invalid={Boolean(error)}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Description" optional error={error?.message} wide>
                      <Input {...field} value={field.value ?? ""} invalid={Boolean(error)} />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="enforcement.type"
                  render={({ field: { value, onChange } }) => (
                    <Field label="Rule type" wide>
                      <Select
                        label="Rule type"
                        value={value}
                        options={Object.values(RuleType).map((type) => ({
                          value: type,
                          label: RULE_TYPE_LABELS[type]
                        }))}
                        onChange={(next) => {
                          onChange(next);
                          replace([]);
                          if (next !== RuleType.StaticSecrets) {
                            form.setValue("enforcement.providers" as never, [] as never, {
                              shouldDirty: true,
                              shouldValidate: false
                            });
                          }
                        }}
                      />
                    </Field>
                  )}
                />
                {isGenerated && (
                  <Controller
                    control={control}
                    name={"enforcement.providers" as never}
                    render={({ field }) => {
                      const label =
                        enforcement.type === RuleType.DynamicSecrets
                          ? "Dynamic secret providers"
                          : "Rotation providers";
                      return (
                        <Field label={label} error={providersError} wide>
                          <MultiSelect
                            label={label}
                            placeholder="Select providers"
                            options={
                              enforcement.type === RuleType.DynamicSecrets
                                ? DYNAMIC_SECRET_PROVIDER_OPTIONS
                                : SECRET_ROTATION_PROVIDER_OPTIONS
                            }
                            value={(field.value as string[] | undefined) ?? []}
                            invalid={Boolean(providersError)}
                            onChange={field.onChange}
                          />
                        </Field>
                      );
                    }}
                  />
                )}
              </Stack>
              <Stack gap={16}>
                <Controller
                  control={control}
                  name="environment"
                  render={({ field: { value, onChange } }) => (
                    <Field label="Environment" wide>
                      <Select
                        label="Environment"
                        value={value ?? ALL_ENVIRONMENTS}
                        options={environments}
                        onChange={(next) => onChange(next === ALL_ENVIRONMENTS ? null : next)}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="folderPath"
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="Folder path"
                      description="Supports globs: * matches one folder level, ** matches any depth."
                      error={error?.message}
                      wide
                    >
                      <Input {...field} mono placeholder="/**" invalid={Boolean(error)} />
                    </Field>
                  )}
                />
              </Stack>
              {hasRegexLengthConflict && (
                <Alert tone="warn" title="Regex pattern takes precedence over length constraints">
                  Generated values come straight from the pattern, so min and max length are
                  ignored. Put the length in the pattern instead, such as [A-Z]{"{12,20}"}.
                </Alert>
              )}
              {showOracleWarning && (
                <Alert tone="warn" title="Oracle 12c password length limit">
                  Oracle 12c and older limit passwords to 30 characters. Keep length and pattern
                  constraints within that limit to avoid rotation failures.
                </Alert>
              )}
              <Stack gap={12}>
                <Inline gap={8} justify="between">
                  <span className={styles.groupLabel}>Validation constraints</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        icon="plus"
                        disabledReason={
                          availableOptions.length ? undefined : "Every constraint is already added"
                        }
                      >
                        Add constraint
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableOptions.map((option) => {
                        const targets = targetsOf(option);
                        const target =
                          targets.find((entry) => !usedPairs.has(`${option.type}:${entry}`)) ??
                          targets[0];
                        return (
                          <DropdownMenuItem
                            key={option.type}
                            description={option.description}
                            onSelect={() =>
                              append({
                                type: option.type,
                                appliesTo: target,
                                ...(option.type === ConstraintType.PreventValueReuse
                                  ? {
                                      value: String(DEFAULT_PREVENT_VALUE_REUSE_VERSIONS),
                                      checkPreviousVersions: true,
                                      checkOtherSecretsInScope: false
                                    }
                                  : { value: "" })
                              })
                            }
                          >
                            {option.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Inline>
                {fields.length === 0 && <EmptyState size="sm" title="No constraints added yet" />}
                {fields.map((field, index) => (
                  <ConstraintCard
                    key={field.id}
                    index={index}
                    onRemove={() => remove(index)}
                    projectId={project.id}
                    blindIndexEnabled={project.secretBlindIndexEnabled}
                    canEnableBlindIndex={permissions.canEnableBlindIndex}
                  />
                ))}
                {constraintsError && <FieldError errors={[{ message: constraintsError }]} />}
              </Stack>
            </Stack>
          </fieldset>
        </Stack>
      </form>
    </FormProvider>
  );
};

type SheetState = { mode: "create" } | { mode: "edit"; ruleId: string } | null;

export const ValidationRulesSection = ({
  project,
  permissions
}: {
  project: Project;
  permissions: RulePermissions;
}) => {
  const policies = useV4Adapter("secretPolicies");
  const { data: rules = [], isPending } = policies.useValidationRules(project.id, {
    enabled: true
  });
  const deleteRule = policies.useDeleteValidationRule();
  const formId = useId();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [formPending, setFormPending] = useState(false);
  const [deleting, setDeleting] = useState<TSecretValidationRule | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const editing =
    sheet?.mode === "edit" ? rules.find((rule) => rule.id === sheet.ruleId) : undefined;
  const openEdit = (rule: TSecretValidationRule) => setSheet({ mode: "edit", ruleId: rule.id });

  const columns: DataTableColumn<TSecretValidationRule>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (rule) => rule.name,
      render: (rule) => (
        <Stack gap={0} align="start">
          <Button
            variant="link"
            underline="hover"
            disabledReason={permissions.canEdit ? undefined : RESTRICTED}
            onClick={() => openEdit(rule)}
          >
            {rule.name}
          </Button>
          {rule.description && <span className={styles.secondary}>{rule.description}</span>}
        </Stack>
      )
    },
    {
      id: "type",
      header: "Type",
      width: 160,
      text: (rule) => RULE_TYPE_LABELS[rule.type],
      render: (rule) => RULE_TYPE_LABELS[rule.type]
    },
    {
      id: "environment",
      header: "Environment",
      width: 160,
      text: (rule) => rule.environment?.name ?? "All environments",
      render: (rule) => rule.environment?.name ?? "All environments"
    },
    {
      id: "path",
      header: "Folder path",
      width: 160,
      mono: true,
      text: (rule) => rule.secretPath,
      render: (rule) => rule.secretPath
    },
    {
      id: "status",
      header: "Status",
      width: 110,
      render: (rule) =>
        rule.isActive ? (
          <StatusText tone="ok" icon="check-c">
            Active
          </StatusText>
        ) : (
          <StatusText icon="minus">Inactive</StatusText>
        )
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="Secret validation rules"
        description="Checked when static secrets are written and when dynamic secrets and rotations generate passwords."
        action={
          <Button
            variant="accent"
            size="xs"
            icon="plus"
            disabledReason={permissions.canCreate ? undefined : RESTRICTED}
            onClick={() => setSheet({ mode: "create" })}
          >
            Create rule
          </Button>
        }
      >
        <DataTable
          label="Secret validation rules"
          rows={rules}
          columns={columns}
          loading={isPending}
          getRowId={(rule) => rule.id}
          rowLabel={(rule) => rule.name}
          onRowActivate={permissions.canEdit ? openEdit : undefined}
          empty={<EmptyState size="sm" title="No validation rules" />}
          rowActions={{
            inline: [
              {
                label: "Copy rule ID",
                icon: "copy",
                onSelect: (rule) => {
                  navigator.clipboard?.writeText(rule.id).catch(() => undefined);
                  saved("Rule ID copied");
                }
              }
            ],
            renderMenu: (rule) => (
              <DropdownMenuItem
                variant="destructive"
                disabled={!permissions.canDelete}
                description={permissions.canDelete ? undefined : RESTRICTED}
                onSelect={() => setDeleting(rule)}
              >
                <Icon name="trash" />
                Delete rule
              </DropdownMenuItem>
            )
          }}
        />
      </Card>
      <Sheet open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent size="md" pending={formPending}>
          <SheetHeader>
            <SheetTitle>{sheet?.mode === "edit" ? "Edit rule" : "Create rule"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {sheet && (sheet.mode === "create" || editing) && (
              <RuleForm
                key={editing?.id ?? "create"}
                formId={formId}
                project={project}
                rule={editing}
                permissions={permissions}
                onPendingChange={setFormPending}
                onDone={() => setSheet(null)}
              />
            )}
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button type="submit" form={formId} loading={formPending}>
              {sheet?.mode === "edit" ? "Save changes" : "Create rule"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent tone="danger" confirmText={deleting?.name} pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Secrets are no longer checked against this rule. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                setDeletePending(true);
                try {
                  await deleteRule.mutateAsync({
                    projectId: project.id,
                    ruleId: deleting.id,
                    type: deleting.type
                  });
                  saved("Rule deleted");
                  setDeleting(null);
                } finally {
                  setDeletePending(false);
                }
              }}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
