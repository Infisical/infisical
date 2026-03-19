import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { Button, Label, Switch, UnstableIconButton } from "@app/components/v3";
import { TPamResource, TPamRotationRule, useUpdatePamResource } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import {
  useCreatePamRotationRule,
  useDeletePamRotationRule,
  useReorderPamRotationRules,
  useUpdatePamRotationRule
} from "@app/hooks/api/pam/mutations";
import { useGetPamRotationRules } from "@app/hooks/api/pam/queries";

const formatIntervalDays = (seconds: number) => {
  const days = Math.round(seconds / 86400);
  return days.toString();
};

const TEMP_ID_PREFIX = "_new_";

// A local working copy of a rule (may be new or existing)
type LocalRule = {
  id: string;
  name: string | null;
  namePattern: string;
  enabled: boolean;
  intervalSeconds: number | null;
};

type RuleCardProps = {
  rule: LocalRule;
  index: number;
  totalRules: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (
    updates: Partial<Pick<LocalRule, "name" | "namePattern" | "enabled" | "intervalSeconds">>
  ) => void;
};

const RuleCard = ({
  rule,
  index,
  totalRules,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdate
}: RuleCardProps) => {
  const [localName, setLocalName] = useState(rule.name ?? "");
  const [localPattern, setLocalPattern] = useState(rule.namePattern);
  const [localInterval, setLocalInterval] = useState(
    rule.intervalSeconds ? formatIntervalDays(rule.intervalSeconds) : "30"
  );

  useEffect(() => {
    setLocalName(rule.name ?? "");
    setLocalPattern(rule.namePattern);
    setLocalInterval(rule.intervalSeconds ? formatIntervalDays(rule.intervalSeconds) : "30");
  }, [rule]);

  const handleNameBlur = () => {
    if (localName !== (rule.name ?? "")) {
      onUpdate({ name: localName || null });
    }
  };

  const handlePatternBlur = () => {
    if (localPattern !== rule.namePattern && localPattern.trim()) {
      onUpdate({ namePattern: localPattern });
    }
  };

  const handleIntervalBlur = () => {
    const days = parseInt(localInterval, 10);
    if (!Number.isNaN(days) && days > 0) {
      const seconds = days * 86400;
      if (seconds !== rule.intervalSeconds) {
        onUpdate({ intervalSeconds: seconds });
      }
    }
  };

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-mineshaft-700/30 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="mr-1 text-lg font-medium text-muted">{index + 1}</span>
          <Switch
            id={`rule-enabled-${rule.id}`}
            checked={rule.enabled}
            onCheckedChange={(checked) => onUpdate({ enabled: checked })}
            variant="project"
          />
          {rule.enabled ? (
            <Label>Rotate</Label>
          ) : (
            <Label className="opacity-50">Do Not Rotate</Label>
          )}
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Rule Name</span>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g., Service accounts"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Account Pattern</span>
            <Input
              value={localPattern}
              onChange={(e) => setLocalPattern(e.target.value)}
              onBlur={handlePatternBlur}
              placeholder="*"
              className="h-8 font-mono text-sm"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Interval</span>
            <div className="flex items-center gap-1">
              <Input
                value={localInterval}
                onChange={(e) => setLocalInterval(e.target.value)}
                onBlur={handleIntervalBlur}
                className={twMerge("h-8 w-16 text-center text-sm", !rule.enabled && "opacity-50")}
                isDisabled={!rule.enabled}
                disabled={!rule.enabled}
              />
              <span className="text-xs text-muted">days</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <UnstableIconButton variant="ghost" size="xs" onClick={onDelete}>
          <TrashIcon className="text-danger" />
        </UnstableIconButton>
        <UnstableIconButton variant="ghost" size="xs" onClick={onMoveUp} isDisabled={index === 0}>
          <ArrowUpIcon />
        </UnstableIconButton>
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={onMoveDown}
          isDisabled={index >= totalRules - 1}
        >
          <ArrowDownIcon />
        </UnstableIconButton>
      </div>
    </div>
  );
};

const credentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .refine(
    (data) =>
      (data.username === "" && data.password === "") ||
      (data.username !== "" && data.password !== ""),
    {
      message:
        "Both username and password must be provided, or both must be empty to remove credentials",
      path: ["username"]
    }
  );

type CredentialsFormData = z.infer<typeof credentialsSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resource: TPamResource;
};

const toLocalRules = (rules: TPamRotationRule[]): LocalRule[] =>
  rules.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    namePattern: r.namePattern,
    enabled: r.enabled,
    intervalSeconds: r.intervalSeconds ?? null
  }));

export const PamRotationPolicyModal = ({ isOpen, onOpenChange, resource }: Props) => {
  const { data: rules = [] } = useGetPamRotationRules(resource.id);
  const createRule = useCreatePamRotationRule();
  const updateRule = useUpdatePamRotationRule();
  const deleteRule = useDeletePamRotationRule();
  const reorderRules = useReorderPamRotationRules();
  const updateResource = useUpdatePamResource();

  const hasRotationCredentials =
    "rotationAccountCredentials" in resource && !!resource.rotationAccountCredentials;

  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Local working copy of rules — only persisted on save
  const [localRules, setLocalRules] = useState<LocalRule[]>([]);
  const [deletedRuleIds, setDeletedRuleIds] = useState<string[]>([]);

  const existingUsername =
    "rotationAccountCredentials" in resource
      ? ((resource.rotationAccountCredentials as { username?: string } | null)?.username ?? "")
      : "";

  const {
    control: credControl,
    handleSubmit: handleCredSubmit,
    reset: resetCred,
    formState: { isDirty: isCredDirty }
  } = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      username: existingUsername,
      password: hasRotationCredentials ? UNCHANGED_PASSWORD_SENTINEL : ""
    }
  });

  const resetAll = useCallback(() => {
    setLocalRules(toLocalRules(rules));
    setDeletedRuleIds([]);
    const uname =
      "rotationAccountCredentials" in resource
        ? ((resource.rotationAccountCredentials as { username?: string } | null)?.username ?? "")
        : "";
    resetCred({
      username: uname,
      password: hasRotationCredentials ? UNCHANGED_PASSWORD_SENTINEL : ""
    });
    setShowPassword(false);
  }, [rules, resource, hasRotationCredentials, resetCred]);

  useEffect(() => {
    if (isOpen) {
      resetAll();
    }
  }, [isOpen, resetAll]);

  const handleAddRule = () => {
    setLocalRules((prev) => [
      ...prev,
      {
        id: `${TEMP_ID_PREFIX}${crypto.randomUUID()}`,
        name: null,
        namePattern: "*",
        enabled: true,
        intervalSeconds: 2592000
      }
    ]);
  };

  const handleUpdateLocalRule = (
    ruleId: string,
    updates: Partial<Pick<LocalRule, "name" | "namePattern" | "enabled" | "intervalSeconds">>
  ) => {
    setLocalRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
  };

  const handleDeleteLocalRule = (ruleId: string) => {
    setLocalRules((prev) => prev.filter((r) => r.id !== ruleId));
    if (!ruleId.startsWith(TEMP_ID_PREFIX)) {
      setDeletedRuleIds((prev) => [...prev, ruleId]);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setLocalRules((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    setLocalRules((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = async (credData: CredentialsFormData) => {
    setIsSaving(true);
    try {
      // Save credentials if changed (send null to remove)
      if (isCredDirty) {
        const clearingCredentials = credData.username === "" && credData.password === "";
        await updateResource.mutateAsync({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          rotationAccountCredentials: clearingCredentials
            ? null
            : { username: credData.username, password: credData.password }
        });
      }

      // Delete removed rules (sequential to avoid race conditions)
      await deletedRuleIds.reduce(
        (chain, ruleId) =>
          chain.then(() => deleteRule.mutateAsync({ resourceId: resource.id, ruleId }).then()),
        Promise.resolve()
      );

      // Create new rules & update existing ones (sequential to preserve order)
      const serverRuleIds = new Set(rules.map((r) => r.id));
      const newIdMap = new Map<string, string>();

      await localRules.reduce((chain, local) => {
        if (local.id.startsWith(TEMP_ID_PREFIX)) {
          return chain.then(async () => {
            const created = await createRule.mutateAsync({
              resourceId: resource.id,
              namePattern: local.namePattern,
              enabled: local.enabled,
              intervalSeconds: local.intervalSeconds ?? 2592000,
              name: local.name ?? undefined
            });
            newIdMap.set(local.id, created.id);
          });
        }
        if (serverRuleIds.has(local.id)) {
          const server = rules.find((r) => r.id === local.id);
          if (!server) return chain;
          const changed =
            local.name !== (server.name ?? null) ||
            local.namePattern !== server.namePattern ||
            local.enabled !== server.enabled ||
            local.intervalSeconds !== (server.intervalSeconds ?? null);
          if (changed) {
            return chain.then(() =>
              updateRule
                .mutateAsync({
                  resourceId: resource.id,
                  ruleId: local.id,
                  name: local.name,
                  namePattern: local.namePattern,
                  enabled: local.enabled,
                  intervalSeconds: local.intervalSeconds
                })
                .then()
            );
          }
        }
        return chain;
      }, Promise.resolve());

      // Reorder if needed
      const finalIds = localRules.map((r) =>
        r.id.startsWith(TEMP_ID_PREFIX) ? newIdMap.get(r.id)! : r.id
      );
      const serverOrder = rules.filter((r) => !deletedRuleIds.includes(r.id)).map((r) => r.id);
      const orderChanged =
        finalIds.length !== serverOrder.length || finalIds.some((id, i) => id !== serverOrder[i]);

      if (orderChanged && finalIds.length > 0) {
        await reorderRules.mutateAsync({ resourceId: resource.id, ruleIds: finalIds });
      }

      createNotification({ text: "Rotation policy updated", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update rotation policy", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    resetAll();
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit Rotation Policy"
        subTitle="Configure automatic password rotation for accounts under this resource."
      >
        <div className="flex flex-col gap-6">
          {/* Section: Rotation Credentials */}
          <div>
            <h4 className="mb-1 text-sm font-semibold">Rotation Credentials</h4>
            <p className="mb-3 text-xs text-mineshaft-400">
              Privileged account used to perform password rotations
            </p>
            <div className="flex gap-3">
              <Controller
                name="username"
                control={credControl}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    className="mb-0 flex-1"
                    label="Username"
                    isError={!!error}
                    errorText={error?.message}
                  >
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                )}
              />
              <Controller
                name="password"
                control={credControl}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    className="mb-0 flex-1"
                    label="Password"
                    isError={!!error}
                    errorText={error?.message}
                  >
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        onFocus={() => {
                          if (field.value === UNCHANGED_PASSWORD_SENTINEL) {
                            field.onChange("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOffIcon className="size-4" />
                        ) : (
                          <EyeIcon className="size-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                )}
              />
            </div>
            {hasRotationCredentials && (
              <p className="mt-2 text-xs text-mineshaft-400">
                Clear both fields to remove credentials and disable rotation.
              </p>
            )}
          </div>

          {/* Section: Rotation Rules */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Rotation Rules</h4>
                <p className="text-xs text-mineshaft-400">
                  Rules are evaluated top-to-bottom by priority
                </p>
              </div>
              <Button size="xs" onClick={handleAddRule}>
                <PlusIcon className="size-3.5" />
                Add Rule
              </Button>
            </div>

            {localRules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
                No rotation rules configured. Add a rule to get started.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {localRules.map((rule, index) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    index={index}
                    totalRules={localRules.length}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onDelete={() => handleDeleteLocalRule(rule.id)}
                    onUpdate={(updates) => handleUpdateLocalRule(rule.id, updates)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex gap-2">
            <Button
              variant="neutral"
              onClick={handleCredSubmit(handleSave)}
              isPending={isSaving}
              isDisabled={isSaving}
            >
              Update Details
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
