import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  InfoIcon,
  PlusIcon,
  TrashIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
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
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableIconButton,
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
    <div className="flex gap-2 rounded-lg border border-border bg-card p-4">
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
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
          <Field>
            <FieldLabel>Rule Name</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="e.g., Service accounts"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Account Pattern</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localPattern}
                onChange={(e) => setLocalPattern(e.target.value)}
                onBlur={handlePatternBlur}
                placeholder="*"
                className="font-mono"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Interval (days)</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localInterval}
                onChange={(e) => setLocalInterval(e.target.value)}
                onBlur={handleIntervalBlur}
                className={twMerge(!rule.enabled && "opacity-50")}
                disabled={!rule.enabled}
              />
            </FieldContent>
          </Field>
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

  // WinRM config for Windows Server resources (stored in connectionDetails)
  const isWindowsResource = resource.resourceType === PamResourceType.Windows;
  const getWinrmDefaults = () => {
    const cd = resource.connectionDetails as {
      winrmPort?: number;
      useWinrmHttps?: boolean;
      winrmRejectUnauthorized?: boolean;
      winrmCaCert?: string;
    };
    return {
      winrmPort: cd.winrmPort ?? 5985,
      useWinrmHttps: cd.useWinrmHttps ?? false,
      winrmRejectUnauthorized: cd.winrmRejectUnauthorized ?? true,
      winrmCaCert: cd.winrmCaCert ?? ""
    };
  };
  const [winrmPort, setWinrmPort] = useState(() => getWinrmDefaults().winrmPort);
  const [useWinrmHttps, setUseWinrmHttps] = useState(() => getWinrmDefaults().useWinrmHttps);
  const [winrmRejectUnauthorized, setWinrmRejectUnauthorized] = useState(
    () => getWinrmDefaults().winrmRejectUnauthorized
  );
  const [winrmCaCert, setWinrmCaCert] = useState(() => getWinrmDefaults().winrmCaCert);

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
    const wd = getWinrmDefaults();
    setWinrmPort(wd.winrmPort);
    setUseWinrmHttps(wd.useWinrmHttps);
    setWinrmRejectUnauthorized(wd.winrmRejectUnauthorized);
    setWinrmCaCert(wd.winrmCaCert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Compute whether any changes exist
  const wd = getWinrmDefaults();
  const isWinrmDirty =
    isWindowsResource &&
    (winrmPort !== wd.winrmPort ||
      useWinrmHttps !== wd.useWinrmHttps ||
      winrmRejectUnauthorized !== wd.winrmRejectUnauthorized ||
      (winrmCaCert || "") !== (wd.winrmCaCert || ""));

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

  const hasChanges = isCredDirty || isWinrmDirty || isRulesDirty;

  const handleSave = async (credData: CredentialsFormData) => {
    setIsSaving(true);
    try {
      // Save credentials and WinRM config if changed
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
      }

      if (isWinrmDirty) {
        updatePayload.connectionDetails = {
          ...(resource.connectionDetails as Record<string, unknown>),
          winrmPort,
          useWinrmHttps,
          winrmRejectUnauthorized,
          winrmCaCert: winrmCaCert || undefined
        };
      }

      if (isCredDirty || isWinrmDirty) {
        await updateResource.mutateAsync(
          updatePayload as Parameters<typeof updateResource.mutateAsync>[0]
        );
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
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Rotation Policy</SheetTitle>
          <SheetDescription>
            Configure automatic password rotation for accounts under this resource.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {resource.resourceType === PamResourceType.ActiveDirectory &&
            !(resource.connectionDetails as { useLdaps?: boolean }).useLdaps && (
              <UnstableAlert variant="info">
                <TriangleAlertIcon />
                <UnstableAlertTitle>LDAPS Required for Rotation</UnstableAlertTitle>
                <UnstableAlertDescription>
                  Active Directory requires LDAPS (TLS) to change passwords. Enable LDAPS in the
                  resource connection settings before configuring rotation.
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

          {/* WinRM Config (Windows Server only) */}
          {isWindowsResource && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>WinRM Configuration</Label>
                <p className="text-xs text-muted">
                  WinRM is used to execute password rotation commands on the Windows machine
                </p>
              </div>

              <Field>
                <FieldLabel>
                  Port
                  <Tooltip>
                    <TooltipTrigger>
                      <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                    </TooltipTrigger>
                    <TooltipContent>
                      The WinRM port on this machine. Default is 5985 for HTTP or 5986 for HTTPS
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <UnstableInput
                    type="number"
                    value={winrmPort}
                    onChange={(e) => setWinrmPort(Number(e.target.value))}
                    placeholder="5985"
                  />
                </FieldContent>
              </Field>

              <Field orientation="horizontal">
                <FieldLabel>Enable HTTPS</FieldLabel>
                <Switch
                  variant="project"
                  checked={useWinrmHttps}
                  onCheckedChange={setUseWinrmHttps}
                />
              </Field>

              <Field>
                <FieldLabel>CA Certificate</FieldLabel>
                <FieldContent>
                  <TextArea
                    value={winrmCaCert}
                    onChange={(e) => setWinrmCaCert(e.target.value)}
                    className="max-h-32"
                    disabled={!useWinrmHttps}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                  />
                </FieldContent>
              </Field>

              <Field orientation="horizontal">
                <FieldLabel>
                  Reject Unauthorized
                  <Tooltip>
                    <TooltipTrigger>
                      <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                    </TooltipTrigger>
                    <TooltipContent>
                      If enabled, Infisical will only connect if the machine has a valid, trusted
                      TLS certificate
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Switch
                  variant="project"
                  disabled={!useWinrmHttps}
                  checked={useWinrmHttps ? winrmRejectUnauthorized : false}
                  onCheckedChange={setWinrmRejectUnauthorized}
                />
              </Field>
            </div>
          )}

          {/* Rotation Rules */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label>Rotation Rules</Label>
                <p className="text-xs text-muted">Rules are evaluated top-to-bottom by priority</p>
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
          <Button variant="outline" className="mr-auto" onClick={handleCancel}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
