import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, PlusIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableInput
} from "@app/components/v3";
import {
  PamResourceType,
  TPamResource,
  TPamRotationRule,
  useUpdatePamResource
} from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import {
  useCreatePamRotationRule,
  useDeletePamRotationRule,
  useReorderPamRotationRules,
  useUpdatePamRotationRule
} from "@app/hooks/api/pam/mutations";
import { useGetPamRotationRules } from "@app/hooks/api/pam/queries";

import { LocalRule, RotationRuleCard } from "./rotation-policy";

const TEMP_ID_PREFIX = "_new_";

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

  // Rules
  const [localRules, setLocalRules] = useState<LocalRule[]>([]);
  const [deletedRuleIds, setDeletedRuleIds] = useState<string[]>([]);

  // Credentials form
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, resource, hasRotationCredentials, resetCred]);

  useEffect(() => {
    if (isOpen) resetAll();
  }, [isOpen, resetAll]);

  // Rule handlers
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

  // Dirty checks

  const isRulesDirty = (() => {
    if (deletedRuleIds.length > 0) return true;
    if (localRules.some((r) => r.id.startsWith(TEMP_ID_PREFIX))) return true;
    const serverOrder = rules.map((r) => r.id);
    if (localRules.length !== serverOrder.length) return true;
    return localRules.some((local, i) => {
      if (local.id !== serverOrder[i]) return true;
      const server = rules.find((r) => r.id === local.id);
      if (!server) return true;
      return (
        local.name !== (server.name ?? null) ||
        local.namePattern !== server.namePattern ||
        local.enabled !== server.enabled ||
        local.intervalSeconds !== (server.intervalSeconds ?? null)
      );
    });
  })();

  const hasChanges = isCredDirty || isRulesDirty;

  const handleSave = async (credData: CredentialsFormData) => {
    setIsSaving(true);
    try {
      const clearingCredentials =
        isCredDirty && credData.username === "" && credData.password === "";
      const updatePayload: Record<string, unknown> = {
        resourceId: resource.id,
        resourceType: resource.resourceType
      };

      if (isCredDirty) {
        updatePayload.rotationAccountCredentials = clearingCredentials
          ? null
          : { username: credData.username, password: credData.password };
        await updateResource.mutateAsync(
          updatePayload as Parameters<typeof updateResource.mutateAsync>[0]
        );
      }

      // Persist rule changes
      await deletedRuleIds.reduce(
        (chain, ruleId) =>
          chain.then(() => deleteRule.mutateAsync({ resourceId: resource.id, ruleId }).then()),
        Promise.resolve()
      );

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

      const finalIds = localRules
        .map((r) => (r.id.startsWith(TEMP_ID_PREFIX) ? newIdMap.get(r.id) : r.id))
        .filter((id): id is string => !!id);

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

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Rotation Policy</SheetTitle>
          <SheetDescription>
            Configure automatic password rotation for accounts under this resource.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {/* Local account warning for Windows Server resources */}
          {resource.resourceType === PamResourceType.Windows && (
            <UnstableAlert variant="info">
              <InfoIcon />
              <UnstableAlertTitle>Local Accounts Only</UnstableAlertTitle>
              <UnstableAlertDescription>
                Rotation on Windows Server resources applies to local machine accounts only. To
                rotate domain accounts, configure rotation on the Active Directory resource instead.
              </UnstableAlertDescription>
            </UnstableAlert>
          )}

          {/* Rotation Credentials */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Rotation Credentials</Label>
              <p className="text-xs text-muted">
                Privileged account used to perform password rotations
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="username"
                control={credControl}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Username</FieldLabel>
                    <FieldContent>
                      <UnstableInput {...field} isError={Boolean(error)} autoComplete="off" />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={credControl}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Password</FieldLabel>
                    <FieldContent>
                      <div className="relative">
                        <UnstableInput
                          {...field}
                          placeholder="••••••"
                          isError={Boolean(error)}
                          autoComplete="new-password"
                          type={showPassword ? "text" : "password"}
                          onFocus={() => {
                            if (field.value === UNCHANGED_PASSWORD_SENTINEL) {
                              field.onChange("");
                            }
                            setShowPassword(true);
                          }}
                          onBlur={() => {
                            if (field.value === "") {
                              field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                            }
                            setShowPassword(false);
                          }}
                        />
                        <button
                          type="button"
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-foreground"
                          onClick={() => field.onChange("")}
                          tabIndex={-1}
                        >
                          <XIcon className="size-4" />
                        </button>
                      </div>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
            {hasRotationCredentials && (
              <p className="text-xs text-warning">
                Clear both fields to remove credentials and disable rotation
              </p>
            )}
          </div>

          {/* Rotation Rules */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label>Auto Rotation Rules</Label>
                <p className="text-xs text-muted">
                  Rules are evaluated top-to-bottom by priority and define which accounts get their
                  credentials automatically rotated
                </p>
              </div>

              <Button variant="neutral" size="xs" onClick={handleAddRule}>
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
                  <RotationRuleCard
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
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            variant="neutral"
            onClick={handleCredSubmit(handleSave)}
            isPending={isSaving}
            isDisabled={isSaving || !hasChanges}
          >
            Update Details
          </Button>
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() => {
              resetAll();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
