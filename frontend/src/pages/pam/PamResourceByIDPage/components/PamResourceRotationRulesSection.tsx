import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { FormControl, Input, Select, SelectItem, Switch } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  useCreatePamRotationRule,
  useDeletePamRotationRule,
  useReorderPamRotationRules,
  useUpdatePamRotationRule
} from "@app/hooks/api/pam/mutations";
import { useGetPamRotationRules } from "@app/hooks/api/pam/queries";
import { TPamResource, TPamRotationRule } from "@app/hooks/api/pam/types";

const formSchema = z.object({
  name: z.string().max(255).optional(),
  namePattern: z.string().min(1).max(255),
  enabled: z.boolean(),
  intervalSeconds: z.number().min(3600).nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  resource: TPamResource;
};

const INTERVAL_OPTIONS = [
  { value: "86400", label: "1 Day" },
  { value: "259200", label: "3 Days" },
  { value: "604800", label: "7 Days" },
  { value: "2592000", label: "30 Days" }
];

const formatInterval = (seconds: number) => {
  const option = INTERVAL_OPTIONS.find((o) => o.value === seconds.toString());
  if (option) return option.label;
  const days = Math.round(seconds / 86400);
  return `${days} day${days !== 1 ? "s" : ""}`;
};

export const PamResourceRotationRulesSection = ({ resource }: Props) => {
  const { data: rules = [], isLoading } = useGetPamRotationRules(resource.id);
  const createRule = useCreatePamRotationRule();
  const updateRule = useUpdatePamRotationRule();
  const deleteRule = useDeletePamRotationRule();
  const reorderRules = useReorderPamRotationRules();

  const [editingRule, setEditingRule] = useState<TPamRotationRule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      namePattern: "*",
      enabled: true,
      intervalSeconds: 2592000
    }
  });

  const enabledValue = watch("enabled");

  const openCreateForm = () => {
    setEditingRule(null);
    reset({
      name: "",
      namePattern: "*",
      enabled: true,
      intervalSeconds: 2592000
    });
    setIsFormOpen(true);
  };

  const openEditForm = (rule: TPamRotationRule) => {
    setEditingRule(rule);
    reset({
      name: rule.name ?? "",
      namePattern: rule.namePattern,
      enabled: rule.enabled,
      intervalSeconds: rule.intervalSeconds ?? 2592000
    });
    setIsFormOpen(true);
  };

  const onSubmit = async (data: FormData) => {
    try {
      if (editingRule) {
        await updateRule.mutateAsync({
          resourceId: resource.id,
          ruleId: editingRule.id,
          ...data
        });
        createNotification({ text: "Rotation rule updated", type: "success" });
      } else {
        await createRule.mutateAsync({
          resourceId: resource.id,
          ...data
        });
        createNotification({ text: "Rotation rule created", type: "success" });
      }
      setIsFormOpen(false);
      setEditingRule(null);
    } catch {
      createNotification({
        text: `Failed to ${editingRule ? "update" : "create"} rotation rule`,
        type: "error"
      });
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteRule.mutateAsync({ resourceId: resource.id, ruleId });
      createNotification({ text: "Rotation rule deleted", type: "success" });
    } catch {
      createNotification({ text: "Failed to delete rotation rule", type: "error" });
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const ruleIds = rules.map((r) => r.id);
    [ruleIds[index - 1], ruleIds[index]] = [ruleIds[index], ruleIds[index - 1]];
    try {
      await reorderRules.mutateAsync({ resourceId: resource.id, ruleIds });
    } catch {
      createNotification({ text: "Failed to reorder rules", type: "error" });
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= rules.length - 1) return;
    const ruleIds = rules.map((r) => r.id);
    [ruleIds[index], ruleIds[index + 1]] = [ruleIds[index + 1], ruleIds[index]];
    try {
      await reorderRules.mutateAsync({ resourceId: resource.id, ruleIds });
    } catch {
      createNotification({ text: "Failed to reorder rules", type: "error" });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-muted">Loading rotation rules...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">
            Rules are evaluated in priority order (first match wins). Use glob patterns to match
            account names.
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <Button size="xs" onClick={openCreateForm} isDisabled={!isAllowed}>
              <PlusIcon className="size-3.5" />
              Add Rule
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      {isFormOpen && (
        <div className="rounded-lg border border-border bg-container p-4">
          <h4 className="mb-3 text-sm font-medium">
            {editingRule ? "Edit Rule" : "New Rotation Rule"}
          </h4>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Rule Name (optional)"
                    isError={!!error}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="e.g., Service Accounts" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="namePattern"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Account Name Pattern"
                    isError={!!error}
                    errorText={error?.message}
                    helperText="Glob pattern. Use * to match within a single level (e.g., svc-* matches svc-api but not svc/api). Use ** to match across all depths."
                  >
                    <Input {...field} placeholder="*" className="font-mono" />
                  </FormControl>
                )}
              />
            </div>
            <div className="flex items-center gap-4">
              <Controller
                control={control}
                name="enabled"
                render={({ field: { value, onChange } }) => (
                  <FormControl label="Enabled" className="mb-0">
                    <Switch
                      id="rule-enabled"
                      isChecked={value}
                      onCheckedChange={onChange}
                      className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                      thumbClassName="bg-mineshaft-800"
                    />
                  </FormControl>
                )}
              />
              {enabledValue && (
                <Controller
                  control={control}
                  name="intervalSeconds"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Rotation Interval"
                      isError={!!error}
                      errorText={error?.message}
                      className="mb-0"
                    >
                      <Select
                        value={value?.toString() ?? "2592000"}
                        onValueChange={(val) => onChange(parseInt(val, 10))}
                        className="w-36 border border-mineshaft-500"
                        position="popper"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="xs" isPending={isSubmitting}>
                {editingRule ? "Save" : "Create"}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingRule(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {rules.length === 0 && !isFormOpen ? (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No rotation rules configured</UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        rules.length > 0 && (
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead className="w-12">#</UnstableTableHead>
                <UnstableTableHead>Name</UnstableTableHead>
                <UnstableTableHead>Pattern</UnstableTableHead>
                <UnstableTableHead>Status</UnstableTableHead>
                <UnstableTableHead>Interval</UnstableTableHead>
                <UnstableTableHead>Created</UnstableTableHead>
                <UnstableTableHead className="w-28" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {rules.map((rule, index) => (
                <UnstableTableRow key={rule.id}>
                  <UnstableTableCell>
                    <Badge variant="outline">{rule.priority}</Badge>
                  </UnstableTableCell>
                  <UnstableTableCell>{rule.name || "-"}</UnstableTableCell>
                  <UnstableTableCell>
                    <code className="rounded bg-mineshaft-600 px-1.5 py-0.5 text-xs">
                      {rule.namePattern}
                    </code>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <Badge variant={rule.enabled ? "success" : "neutral"}>
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {rule.enabled && rule.intervalSeconds
                      ? formatInterval(rule.intervalSeconds)
                      : "-"}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {format(new Date(rule.createdAt), "MM/dd/yyyy")}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <div className="flex items-center gap-1">
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={() => handleMoveUp(index)}
                        isDisabled={index === 0}
                      >
                        <ArrowUpIcon className="size-3.5" />
                      </UnstableIconButton>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={() => handleMoveDown(index)}
                        isDisabled={index >= rules.length - 1}
                      >
                        <ArrowDownIcon className="size-3.5" />
                      </UnstableIconButton>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={() => openEditForm(rule)}
                      >
                        <PencilIcon className="size-3.5" />
                      </UnstableIconButton>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <TrashIcon className="size-3.5" />
                      </UnstableIconButton>
                    </div>
                  </UnstableTableCell>
                </UnstableTableRow>
              ))}
            </UnstableTableBody>
          </UnstableTable>
        )
      )}
    </div>
  );
};
