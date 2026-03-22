/* eslint-disable jsx-a11y/label-has-associated-control */
import { useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EllipsisVerticalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableInput,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useCreateSecretValidationRule,
  useDeleteSecretValidationRule,
  useListSecretValidationRules,
  useUpdateSecretValidationRule
} from "@app/hooks/api/secretValidationRules";
import { SecretValidationRuleType } from "@app/hooks/api/secretValidationRules/types";

import { ConstraintCard } from "./ConstraintCard";
import {
  CONSTRAINT_OPTIONS,
  ConstraintTarget,
  RULE_TYPE_LABELS,
  ruleFormSchema,
  RuleType,
  TRuleForm
} from "./SecretEnforcementTab.utils";

const RuleFormContent = ({
  defaultValues,
  isEditing,
  initialIsActive = true,
  environments,
  onClose,
  onSubmit
}: {
  defaultValues?: Partial<TRuleForm>;
  isEditing: boolean;
  initialIsActive?: boolean;
  environments: { slug: string; name: string }[];
  onClose: () => void;
  onSubmit: (data: TRuleForm, isActive?: boolean) => void;
}) => {
  const [isActive, setIsActive] = useState(initialIsActive);

  const form = useForm<TRuleForm>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: defaultValues || {
      name: "",
      description: "",
      environment: null,
      folderPath: "/**",
      enforcement: {
        type: RuleType.StaticSecrets,
        inputs: {
          constraints: []
        }
      }
    }
  });

  const {
    handleSubmit,
    control,
    formState: { errors }
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "enforcement.inputs.constraints"
  });

  const watchedConstraints = form.watch("enforcement.inputs.constraints");
  const usedConstraintTypes = new Set(watchedConstraints?.map((c) => c.type));
  const availableConstraintOptions = CONSTRAINT_OPTIONS.filter(
    (opt) => !usedConstraintTypes.has(opt.type)
  );

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit((data) => onSubmit(data, isEditing ? isActive : undefined))}
        className="flex h-full flex-col"
      >
        {isEditing && (
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <span className="text-xs text-muted">{isActive ? "Enabled" : "Disabled"}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} variant="project" />
          </div>
        )}
        <div
          className={`thin-scrollbar flex-1 space-y-6 overflow-y-auto p-6 transition-opacity ${!isActive ? "pointer-events-none opacity-40" : ""}`}
        >
          {/* Name & Description */}
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Name</label>
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <UnstableInput
                    {...field}
                    placeholder="e.g. Production key naming"
                    isError={Boolean(errors.name)}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Description (optional)</label>
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <UnstableInput
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Brief description of this rule"
                  />
                )}
              />
            </div>
          </div>

          {/* Enforcement Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Rule Type</label>
            <Controller
              control={control}
              name="enforcement.type"
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={RuleType.StaticSecrets}>
                      {RULE_TYPE_LABELS[RuleType.StaticSecrets]}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Scope */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-foreground">Scope</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Environment</label>
                <Controller
                  control={control}
                  name="environment"
                  render={({ field: { value, onChange } }) => (
                    <Select
                      value={value ?? "all"}
                      onValueChange={(val) => onChange(val === "all" ? null : val)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Environments" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="all">All Environments</SelectItem>
                        {environments.map((env) => (
                          <SelectItem key={env.slug} value={env.slug}>
                            {env.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Folder Path</label>
                <Controller
                  control={control}
                  name="folderPath"
                  render={({ field }) => <UnstableInput {...field} placeholder="/**" />}
                />
              </div>
            </div>
          </div>

          {/* Constraints */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Validation Constraints</h4>
              {availableConstraintOptions.length > 0 && (
                <UnstableDropdownMenu>
                  <UnstableDropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="xs">
                      <PlusIcon className="size-4" />
                      Add Constraint
                    </Button>
                  </UnstableDropdownMenuTrigger>
                  <UnstableDropdownMenuContent align="end">
                    {availableConstraintOptions.map((opt) => (
                      <UnstableDropdownMenuItem
                        key={opt.type}
                        onClick={() =>
                          append({
                            type: opt.type,
                            appliesTo: ConstraintTarget.SecretValue,
                            value: ""
                          })
                        }
                      >
                        <opt.icon className="mr-2 size-4" />
                        <div>
                          <div className="text-sm">{opt.label}</div>
                          <div className="text-xs text-muted">{opt.description}</div>
                        </div>
                      </UnstableDropdownMenuItem>
                    ))}
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              )}
            </div>

            {fields.length === 0 && (
              <div className="rounded-md border border-dashed border-border py-8 text-center">
                <p className="text-sm text-muted">No constraints added yet</p>
                {errors.enforcement?.inputs?.constraints?.root?.message && (
                  <p className="mt-1 text-xs text-danger">
                    {errors.enforcement?.inputs?.constraints?.root?.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              {fields.map((field, idx) => (
                <ConstraintCard key={field.id} index={idx} onRemove={() => remove(idx)} />
              ))}
            </div>

            {fields.length > 0 && errors.enforcement?.inputs?.constraints?.root?.message && (
              <p className="mt-1 text-xs text-danger">
                {errors.enforcement?.inputs?.constraints?.root?.message}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <SheetFooter className="border-t">
          <Button variant="project" type="submit">
            {isEditing ? "Save Changes" : "Create Rule"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};

type SheetState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; ruleId: string };

export const SecretValidationRulesTab = () => {
  const { currentProject } = useProject();
  const [sheetState, setSheetState] = useState<SheetState>({ open: false });

  const { data: rules = [], isLoading } = useListSecretValidationRules({
    projectId: currentProject.id
  });

  const createRule = useCreateSecretValidationRule();
  const updateRule = useUpdateSecretValidationRule();
  const deleteRule = useDeleteSecretValidationRule();

  const resolveEnvSlug = (envId: string | null) => {
    if (!envId) return null;
    const env = currentProject.environments.find((e) => e.id === envId);
    return env?.slug ?? null;
  };

  const resolveEnvName = (envId: string | null) => {
    if (!envId) return "All Environments";
    const env = currentProject.environments.find((e) => e.id === envId);
    return env?.name ?? envId;
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteRule.mutateAsync({ projectId: currentProject.id, ruleId });
      createNotification({ text: "Rule deleted", type: "success" });
    } catch {
      createNotification({ text: "Failed to delete rule", type: "error" });
    }
  };

  const handleClose = () => setSheetState({ open: false });

  const handleSubmit = async (data: TRuleForm, isActive?: boolean) => {
    try {
      if (sheetState.open && sheetState.mode === "edit") {
        await updateRule.mutateAsync({
          projectId: currentProject.id,
          ruleId: sheetState.ruleId,
          name: data.name,
          description: data.description,
          isActive,
          environmentSlug: data.environment ?? undefined,
          secretPath: data.folderPath,
          type: data.enforcement.type as string as SecretValidationRuleType,
          inputs: data.enforcement.inputs
        });
        createNotification({ text: "Rule updated", type: "success" });
      } else {
        await createRule.mutateAsync({
          projectId: currentProject.id,
          name: data.name,
          description: data.description,
          environmentSlug: data.environment ?? undefined,
          secretPath: data.folderPath,
          rule: {
            type: data.enforcement.type as string as SecretValidationRuleType,
            inputs: data.enforcement.inputs
          }
        });
        createNotification({ text: "Rule created", type: "success" });
      }
      handleClose();
    } catch {
      createNotification({
        text: `Failed to ${sheetState.open && sheetState.mode === "edit" ? "update" : "create"} rule`,
        type: "error"
      });
    }
  };

  const editingRule =
    sheetState.open && sheetState.mode === "edit"
      ? rules.find((r) => r.id === sheetState.ruleId)
      : undefined;

  const editingDefaults = editingRule
    ? {
        name: editingRule.name,
        description: editingRule.description ?? undefined,
        environment: resolveEnvSlug(editingRule.envId),
        folderPath: editingRule.secretPath,
        enforcement: {
          type: editingRule.type as string as RuleType,
          inputs: editingRule.inputs
        }
      }
    : undefined;

  const isEditing = sheetState.open && sheetState.mode === "edit";

  return (
    <div className="w-full">
      <div className="flex h-full w-full flex-1 flex-col rounded-lg border border-border bg-card py-4">
        <div className="mx-4 flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-lg font-medium text-foreground">Secret Validation Rules</h3>
            <p className="text-sm leading-3 text-muted">
              Define validation constraints for secret keys and values
            </p>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setSheetState({ open: true, mode: "create" })}
          >
            <PlusIcon className="size-4" />
            Create Rule
          </Button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden px-4">
          <div className="thin-scrollbar flex-1 overflow-y-scroll py-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted">Loading rules...</p>
              </div>
            )}
            {!isLoading && rules.length === 0 ? (
              <UnstableEmpty className="border">
                <UnstableEmptyHeader>
                  <UnstableEmptyTitle>No validation rules configured</UnstableEmptyTitle>
                  <UnstableEmptyDescription>
                    Create a rule to enforce validation constraints on secret keys and values
                  </UnstableEmptyDescription>
                </UnstableEmptyHeader>
                <UnstableEmptyContent>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSheetState({ open: true, mode: "create" })}
                  >
                    <PlusIcon className="size-4" />
                    Create Rule
                  </Button>
                </UnstableEmptyContent>
              </UnstableEmpty>
            ) : (
              !isLoading && (
                <UnstableTable>
                  <UnstableTableHeader>
                    <UnstableTableRow>
                      <UnstableTableHead>Name</UnstableTableHead>
                      <UnstableTableHead>Type</UnstableTableHead>
                      <UnstableTableHead>Scope</UnstableTableHead>
                      <UnstableTableHead>Status</UnstableTableHead>
                      <UnstableTableHead className="w-12" />
                    </UnstableTableRow>
                  </UnstableTableHeader>
                  <UnstableTableBody>
                    {rules.map((rule) => (
                      <UnstableTableRow key={rule.id}>
                        <UnstableTableCell>
                          <div>
                            <span className="text-sm font-medium text-foreground">{rule.name}</span>
                            {rule.description && (
                              <p className="text-xs text-muted">{rule.description}</p>
                            )}
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Badge variant="neutral">
                            {RULE_TYPE_LABELS[rule.type as string as RuleType] ?? rule.type}
                          </Badge>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="neutral">{resolveEnvName(rule.envId)}</Badge>
                            <Badge variant="neutral">{rule.secretPath}</Badge>
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Badge variant={rule.isActive ? "success" : "neutral"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <UnstableDropdownMenu>
                            <UnstableDropdownMenuTrigger asChild>
                              <UnstableIconButton aria-label="Actions" variant="ghost" size="xs">
                                <EllipsisVerticalIcon className="size-4" />
                              </UnstableIconButton>
                            </UnstableDropdownMenuTrigger>
                            <UnstableDropdownMenuContent align="end">
                              <UnstableDropdownMenuItem
                                onClick={() =>
                                  setSheetState({ open: true, mode: "edit", ruleId: rule.id })
                                }
                              >
                                <PencilIcon className="mr-2 size-4" />
                                Edit
                              </UnstableDropdownMenuItem>
                              <UnstableDropdownMenuItem
                                variant="danger"
                                onClick={() => handleDelete(rule.id)}
                              >
                                <TrashIcon className="mr-2 size-4" />
                                Delete
                              </UnstableDropdownMenuItem>
                            </UnstableDropdownMenuContent>
                          </UnstableDropdownMenu>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    ))}
                  </UnstableTableBody>
                </UnstableTable>
              )
            )}
          </div>
        </div>
      </div>

      <Sheet open={sheetState.open} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>{isEditing ? "Edit Rule" : "Create Rule"}</SheetTitle>
            <SheetDescription>
              {isEditing ? "Modify this validation rule" : "Define a new secret validation rule"}
            </SheetDescription>
          </SheetHeader>
          {sheetState.open && (
            <RuleFormContent
              key={isEditing ? editingRule?.id : "create"}
              defaultValues={editingDefaults}
              isEditing={isEditing}
              initialIsActive={editingRule?.isActive ?? true}
              environments={currentProject.environments}
              onClose={handleClose}
              onSubmit={handleSubmit}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
