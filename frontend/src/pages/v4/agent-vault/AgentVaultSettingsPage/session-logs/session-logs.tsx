import { type ReactNode, useEffect, useState } from "react";
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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  canTurnOnAgentVaultSessionLogs,
  getAgentVaultSessionLogRetentionDays,
  isAgentVaultSessionLogBlockedByPlan,
  isAgentVaultSessionLogStorageOnPlan
} from "@app/helpers/agentVaultSessionLogs";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSessionLogReadAccess,
  TAgentVaultSessionLogSettings,
  TAgentVaultSessionLogSettingsState,
  TUpdateAgentVaultSessionLogSettingsDTO
} from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  buildSessionLogSchema,
  needsSessionLogUpgrade,
  S3_BUCKET_NAME,
  toStorage,
  type TSessionLogFormValues
} from "@app/pages/agent-vault/AgentVaultSettingsPage/components/SessionLogModal.utils";
import { connectionCreation } from "@app/pages/v4/components/app-connection-form";

import { useProjectScope } from "../../../access/project/scope";
import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { TSessionLogPlan } from "../../../data/agent-vault-settings/contract";
import { CONNECTION_PRESETS } from "../../../data/integrations/connection-presets";
import { AwsSetupDialog, HostBlockedMessage } from "./aws-setup-dialog";
import {
  EditCredentialsDialog,
  SessionLogConnections,
  useConnectionPermissions,
  useCreateAwsConnection
} from "./connections";
import { UpgradeDialog } from "./upgrade-dialog";

const SESSION_LOGS_DOCS =
  "https://infisical.com/docs/documentation/platform/agent-vault/session-logs";

const REGION_OPTIONS = AWS_REGIONS.map((region) => ({
  value: region.slug,
  label: region.name,
  meta: region.slug
}));

type AwsSetupTarget = { bucket: string | null; keyPrefix: string | null; unsaved?: boolean };

const externalOf = (settings: TAgentVaultSessionLogSettings | null | undefined) =>
  settings?.storage.type === AgentVaultSessionLogStorageType.External ? settings.storage : null;

const READ_ACCESS_ALERTS: Record<
  Exclude<TAgentVaultSessionLogReadAccess, "readable">,
  { title: string; message: (host: string) => ReactNode; action?: string }
> = {
  "cors-missing": {
    title: "Session logs can't be read back",
    message: () => "The bucket they're stored in isn't allowing requests from this origin.",
    action: "View CORS rule"
  },
  "access-denied": {
    title: "Session logs can't be read back",
    message: () => "The AWS connection isn't allowed to read from the bucket they're stored in.",
    action: "View IAM policy"
  },
  "host-blocked": {
    title: "Session log storage is blocked",
    message: (host) => <HostBlockedMessage host={host} />
  }
};

const SessionLogAlerts = ({
  state,
  plan,
  onUpgrade,
  onAwsSetup
}: {
  state: TAgentVaultSessionLogSettingsState;
  plan: TSessionLogPlan;
  onUpgrade: (type: AgentVaultSessionLogStorageType) => void;
  onAwsSetup: (target: AwsSetupTarget) => void;
}) => {
  const { orgId, projectId } = useProjectScope();
  const adapter = useV4Adapter("agentVaultSettings");
  const { data: health } = adapter.useSessionLogHealth(orgId, projectId);
  const { data: readCheck } = adapter.useSessionLogReadCheck(orgId, projectId);
  const { settings } = state;
  const storageType = settings?.storage.type ?? AgentVaultSessionLogStorageType.External;
  const isOnPlan = (type: AgentVaultSessionLogStorageType) =>
    isAgentVaultSessionLogStorageOnPlan(type, plan);
  const isDefaultUsable =
    state.defaultStorage.configured && isOnPlan(AgentVaultSessionLogStorageType.Default);
  const isBlockedByPlan = isAgentVaultSessionLogBlockedByPlan(settings, plan);
  const external = externalOf(settings);
  const readAlert =
    readCheck && readCheck.status !== "readable" ? READ_ACCESS_ALERTS[readCheck.status] : null;

  let planAlert: { title: string; message: string } | null = null;
  // Default storage can be on without anyone choosing it, so its message can't say the plan "no longer" includes it.
  if (isBlockedByPlan && storageType === AgentVaultSessionLogStorageType.Default) {
    planAlert = {
      title: "Session logs aren't being recorded",
      message: `Your plan doesn't include default storage. Upgrade to record and view them, or turn session logs off${
        isOnPlan(AgentVaultSessionLogStorageType.External) ? " or switch to external storage" : ""
      }.`
    };
  } else if (isBlockedByPlan) {
    planAlert = {
      title: "Your plan no longer includes external storage",
      message: `Upgrade to see recorded logs and keep recording. Recorded logs stay in your bucket. You can also turn session logs off${
        isDefaultUsable ? " or switch to default storage" : ""
      }.`
    };
  }

  return (
    <>
      {health?.connectionError && (
        <Alert tone="bad" title="Session log storage isn't working">
          {health.connectionError}
        </Alert>
      )}
      {planAlert && (
        <Alert
          tone="warn"
          title={planAlert.title}
          actions={
            <Button variant="outline" size="sm" onClick={() => onUpgrade(storageType)}>
              Upgrade
            </Button>
          }
        >
          {planAlert.message}
        </Alert>
      )}
      {/* While the storage is broken, fixing it comes first, so its error shows alone. */}
      {!health?.connectionError && readAlert && (
        <Alert
          tone="warn"
          title={readAlert.title}
          actions={
            readAlert.action && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onAwsSetup({
                    bucket: external?.bucket ?? null,
                    keyPrefix: external?.keyPrefix ?? null
                  })
                }
              >
                {readAlert.action}
              </Button>
            )
          }
        >
          {readAlert.message(readCheck?.host ?? "")}
        </Alert>
      )}
    </>
  );
};

const initialValues = (
  state: TAgentVaultSessionLogSettingsState,
  isDefaultUsable: boolean
): TSessionLogFormValues => {
  const current = state.settings;
  const external = externalOf(current);
  // While on, the form opens on the storage in use, even one the plan leaves out, so it matches the plan
  // warning. An off row holds default storage without anyone picking it, so off starts on what the plan allows.
  const unchosenStorageType = isDefaultUsable
    ? AgentVaultSessionLogStorageType.Default
    : AgentVaultSessionLogStorageType.External;
  return {
    enabled: current?.enabled ?? false,
    storageType: current?.enabled ? current.storage.type : unchosenStorageType,
    appConnectionId: external?.appConnectionId ?? "",
    bucket: external?.bucket ?? "",
    region: external?.region ?? AWS_REGIONS[0].slug,
    keyPrefix: external?.keyPrefix ?? ""
  };
};

const isSameValues = (a: TSessionLogFormValues, b: TSessionLogFormValues) =>
  (Object.keys(a) as (keyof TSessionLogFormValues)[]).every((key) => a[key] === b[key]);

const SessionLogSettingsCard = ({
  state,
  plan,
  onUpgrade,
  onAwsSetup
}: {
  state: TAgentVaultSessionLogSettingsState;
  plan: TSessionLogPlan;
  onUpgrade: (type: AgentVaultSessionLogStorageType) => void;
  onAwsSetup: (target: AwsSetupTarget) => void;
}) => {
  const { orgId, projectId } = useProjectScope();
  const adapter = useV4Adapter("agentVaultSettings");
  const updateSettings = adapter.useUpdateSessionLogSettings(orgId, projectId);
  const { fetch: fetchReadCheck } = adapter.useSessionLogReadCheckActions(orgId, projectId);
  const { data: connections, isPending: isLoadingConnections } = adapter.useAvailableConnections(
    AppConnection.AWS,
    projectId
  );
  const { data: projectConnections = [] } = adapter.useProjectConnections(projectId);
  const { canCreate, canEdit } = useConnectionPermissions();
  const createAwsConnection = useCreateAwsConnection();

  const { settings } = state;
  const isDefaultStorageConfigured = state.defaultStorage.configured;
  const retentionDays = getAgentVaultSessionLogRetentionDays(plan);
  const isOnPlan = (type: AgentVaultSessionLogStorageType) =>
    isAgentVaultSessionLogStorageOnPlan(type, plan);
  const savedExternal = externalOf(settings);
  // Without the plan and with nothing saved, the bucket fields could never be saved, so they aren't shown.
  const isExternalUsable =
    isOnPlan(AgentVaultSessionLogStorageType.External) || Boolean(savedExternal);
  const isDefaultUsable =
    isDefaultStorageConfigured && isOnPlan(AgentVaultSessionLogStorageType.Default);
  // The saved bucket stays visible after the plan lapses, but only turning off or switching is allowed.
  const isExternalReadOnly =
    Boolean(savedExternal) && !isOnPlan(AgentVaultSessionLogStorageType.External);
  const canTurnOn = canTurnOnAgentVaultSessionLogs(isDefaultStorageConfigured, plan);
  const isRecording = Boolean(settings?.enabled && isOnPlan(settings.storage.type));

  const initial = initialValues(state, isDefaultUsable);
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [confirmOff, setConfirmOff] = useState<((confirmed: boolean) => void) | null>(null);
  const [editingCredentials, setEditingCredentials] = useState(false);

  useEffect(() => {
    setDraft(initialValues(state, isDefaultUsable));
    setSubmitted(false);
  }, [state, isDefaultUsable]);

  const set = (patch: Partial<TSessionLogFormValues>) => setDraft({ ...draft, ...patch });
  const dirty = !isSameValues(draft, initial);
  const issues = buildSessionLogSchema(settings, isExternalUsable)
    .safeParse(draft)
    .error?.flatten().fieldErrors;
  const shown = submitted ? issues : undefined;

  const isExternal = draft.storageType === AgentVaultSessionLogStorageType.External;
  const typedBucket = draft.bucket.trim();
  const isBucketChange =
    isExternal &&
    Boolean(savedExternal) &&
    S3_BUCKET_NAME.test(typedBucket) &&
    typedBucket !== savedExternal?.bucket;
  const isPrefixOnlyChange =
    isExternal &&
    Boolean(savedExternal) &&
    !isBucketChange &&
    draft.keyPrefix.trim() !== (savedExternal?.keyPrefix ?? "");
  const isSwitchingStorage = isRecording && draft.storageType !== settings?.storage.type;

  const editableConnection = projectConnections.find(
    ({ id }) => id === savedExternal?.appConnectionId
  );
  const canEditConnection = editableConnection ? canEdit(editableConnection.id) : false;

  const connectionOptions = (connections ?? []).map((connection) => ({
    value: connection.id,
    label: connection.name,
    meta: connection.projectId ? undefined : "Organization"
  }));
  const awsPreset = CONNECTION_PRESETS[AppConnection.AWS];
  const creation =
    awsPreset && !isExternalReadOnly
      ? connectionCreation({
          preset: awsPreset,
          disabledReason: canCreate ? undefined : "Your role doesn't allow creating connections",
          create: createAwsConnection
        })
      : undefined;

  const storageOptions = [
    {
      value: AgentVaultSessionLogStorageType.Default,
      label: "Default storage",
      disabled: !isDefaultStorageConfigured,
      description: isDefaultStorageConfigured
        ? `${isOnPlan(AgentVaultSessionLogStorageType.Default) ? "" : "Needs an upgrade. "}Kept ${retentionDays} days. Nothing to set up.`
        : "Not set up on this instance. Contact your server administrator."
    },
    {
      value: AgentVaultSessionLogStorageType.External,
      label: "External storage",
      description: `${isOnPlan(AgentVaultSessionLogStorageType.External) ? "" : "Needs an upgrade. "}Your own S3 bucket. You keep logs as long as you like.`
    }
  ];
  const storageValue =
    isOnPlan(draft.storageType) ||
    (settings?.enabled && settings.storage.type === draft.storageType)
      ? draft.storageType
      : "";

  const save = async (request: TUpdateAgentVaultSessionLogSettingsDTO) => {
    const result = await updateSettings.mutateAsync(request);
    saved("Session log settings saved");
    const next = result.settings;
    // Saving with session logs on already proved Infisical can write, so the setup dialog only opens for a
    // step the read check finds missing.
    if (!next?.enabled || next.storage.type !== AgentVaultSessionLogStorageType.External) return;
    const { bucket, keyPrefix } = next.storage;
    fetchReadCheck().then((readCheck) => {
      if (readCheck?.status === "cors-missing" || readCheck?.status === "access-denied")
        onAwsSetup({ bucket, keyPrefix });
    });
  };

  const onSave = async () => {
    setSubmitted(true);
    if (issues) throw new Error("Fix the highlighted fields, then save again.");
    // Turning off forgets the storage, and an external bucket is easy to lose track of, so that one is confirmed.
    if (!draft.enabled) {
      if (savedExternal) {
        const confirmed = await new Promise<boolean>((resolve) => {
          setConfirmOff(() => resolve);
        });
        if (!confirmed) throw new Error("Not saved. Session logs are still on.");
      }
      await save({ enabled: false });
      return;
    }
    if (needsSessionLogUpgrade(draft, settings, isOnPlan)) {
      onUpgrade(draft.storageType);
      throw new Error("Not saved. Your plan doesn't include this storage.");
    }
    await save({ enabled: true, storage: toStorage(draft) });
  };

  const answerConfirmOff = (confirmed: boolean) => {
    confirmOff?.(confirmed);
    setConfirmOff(null);
  };

  return (
    <>
      <SettingsCard
        title={
          <Inline gap={8} align="center">
            Session logs
            <Badge tone={isRecording ? "ok" : "outline"}>{isRecording ? "On" : "Off"}</Badge>
          </Inline>
        }
        action={<DocumentationLinkBadge href={SESSION_LOGS_DOCS} />}
        dirty={dirty}
        onDiscard={() => {
          setDraft(initial);
          setSubmitted(false);
        }}
        onSave={onSave}
      >
        <Stack gap={16}>
          <Switch
            layout="row"
            label="Record session logs"
            description="Records every request your agents make through a proxy, encrypted."
            checked={draft.enabled}
            onCheckedChange={(checked) => {
              if (checked && !canTurnOn) {
                onUpgrade(
                  isDefaultStorageConfigured
                    ? AgentVaultSessionLogStorageType.Default
                    : AgentVaultSessionLogStorageType.External
                );
                return;
              }
              set({ enabled: checked });
            }}
          />
          {draft.enabled && (
            <>
              <Field label="Storage">
                <Select
                  aria-label="Storage"
                  placeholder="Choose where to store session logs"
                  options={storageOptions}
                  value={storageValue}
                  onChange={(value) => {
                    const type = value as AgentVaultSessionLogStorageType;
                    if (!isOnPlan(type)) {
                      onUpgrade(type);
                      return;
                    }
                    set({ storageType: type });
                  }}
                />
              </Field>
              {isExternal && isExternalUsable && (
                <>
                  <Field
                    label="AWS connection"
                    description="Its credentials write the records, and read them back when you open a session's logs."
                    error={shown?.appConnectionId?.[0]}
                  >
                    <Combobox
                      label="AWS connection"
                      placeholder="Select a connection"
                      options={connectionOptions}
                      value={draft.appConnectionId}
                      loading={isLoadingConnections}
                      invalid={Boolean(shown?.appConnectionId)}
                      disabled={isExternalReadOnly}
                      creation={creation}
                      onChange={(value) => set({ appConnectionId: value })}
                    />
                  </Field>
                  <Field label="Region" error={shown?.region?.[0]}>
                    <Combobox
                      label="Region"
                      placeholder="Select a region"
                      options={REGION_OPTIONS}
                      value={draft.region}
                      invalid={Boolean(shown?.region)}
                      disabled={isExternalReadOnly}
                      onChange={(value) => set({ region: value })}
                    />
                  </Field>
                  <Field label="Bucket" error={shown?.bucket?.[0]}>
                    <Input
                      mono
                      value={draft.bucket}
                      placeholder="acme-agent-vault-session-logs"
                      autoComplete="off"
                      invalid={Boolean(shown?.bucket)}
                      disabled={isExternalReadOnly}
                      onChange={(event) => set({ bucket: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Key prefix"
                    optional
                    description="Session logs are written under this prefix."
                    error={shown?.keyPrefix?.[0]}
                  >
                    <Input
                      mono
                      value={draft.keyPrefix}
                      autoComplete="off"
                      invalid={Boolean(shown?.keyPrefix)}
                      disabled={isExternalReadOnly}
                      onChange={(event) => set({ keyPrefix: event.target.value })}
                    />
                  </Field>
                  <Inline>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() =>
                        onAwsSetup({
                          bucket: draft.bucket.trim(),
                          keyPrefix: draft.keyPrefix.trim(),
                          unsaved: true
                        })
                      }
                    >
                      View AWS setup
                    </Button>
                  </Inline>
                </>
              )}
              {isSwitchingStorage && (
                <Alert tone="warn" title="Older logs won't show after switching">
                  {settings?.storage.type === AgentVaultSessionLogStorageType.Default
                    ? `Logs in default storage keep their ${retentionDays}-day retention.`
                    : "Logs in your bucket stay in the bucket."}
                </Alert>
              )}
              {!isSwitchingStorage && isBucketChange && (
                <Alert
                  tone="warn"
                  title="Older logs stay in the current bucket"
                  actions={
                    canEditConnection && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCredentials(true)}
                      >
                        Edit AWS credentials
                      </Button>
                    )
                  }
                >
                  Everything already recorded stays in <Code>{savedExternal?.bucket ?? ""}</Code>{" "}
                  and won&apos;t show in Infisical until you switch back to it. To rotate
                  credentials, update the AWS connection instead of moving the bucket.
                </Alert>
              )}
              {!isSwitchingStorage && isPrefixOnlyChange && (
                <Alert tone="info" title="Older logs won't show">
                  Logs written under the current prefix show again if you change it back.
                </Alert>
              )}
            </>
          )}
        </Stack>
      </SettingsCard>

      <AlertDialog
        open={Boolean(confirmOff)}
        onOpenChange={(open) => !open && answerConfirmOff(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off session logs?</AlertDialogTitle>
            <AlertDialogDescription>
              Turning off forgets <Code>{savedExternal?.bucket ?? ""}</Code>. To see its logs again,
              set up the same bucket and prefix.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                answerConfirmOff(true);
              }}
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingCredentials && editableConnection && (
        <EditCredentialsDialog
          connection={editableConnection}
          onClose={() => setEditingCredentials(false)}
        />
      )}
    </>
  );
};

export const SessionLogsTab = () => {
  const { orgId, projectId } = useProjectScope();
  const adapter = useV4Adapter("agentVaultSettings");
  const { data: state } = adapter.useSessionLogSettings(orgId, projectId);
  const { data: plan } = adapter.useSessionLogPlan(orgId);
  const [upgradeFor, setUpgradeFor] = useState<AgentVaultSessionLogStorageType | null>(null);
  const [awsSetup, setAwsSetup] = useState<AwsSetupTarget | null>(null);
  if (!state || !plan) return <SettingsCard title="Session logs" loading />;
  return (
    <Stack gap={24}>
      <SessionLogAlerts
        state={state}
        plan={plan}
        onUpgrade={setUpgradeFor}
        onAwsSetup={setAwsSetup}
      />
      <SessionLogSettingsCard
        state={state}
        plan={plan}
        onUpgrade={setUpgradeFor}
        onAwsSetup={setAwsSetup}
      />
      <SessionLogConnections inUseId={externalOf(state.settings)?.appConnectionId ?? null} />
      <AwsSetupDialog
        open={Boolean(awsSetup)}
        onOpenChange={(open) => !open && setAwsSetup(null)}
        bucket={awsSetup?.bucket ?? null}
        keyPrefix={awsSetup?.keyPrefix ?? null}
        unsaved={awsSetup?.unsaved}
      />
      <UpgradeDialog storageType={upgradeFor} onClose={() => setUpgradeFor(null)} />
    </Stack>
  );
};
