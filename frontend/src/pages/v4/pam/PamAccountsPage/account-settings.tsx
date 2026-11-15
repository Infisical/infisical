import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { StatusText, Text } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  accountTypeRequiresRecording,
  formatRotationInterval,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  PamRotationStatus,
  type TPamAccount,
  type TPamAccountDependency,
  type TPamAccountRotation,
  type TPamAccountTypeMetadata
} from "@app/hooks/api/pam";

import { useOrgId } from "../../access/permissions";
import { errorMessage, failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { GatewayPicker } from "../../networking/gateway-picker";

const relative = (value?: string | null) =>
  value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "Never";

const HEALTH: Record<
  PamHeartbeatStatus,
  {
    label: string;
    tone: "ok" | "bad" | "warn" | "neutral";
    icon: "check-c" | "alert-c" | "alert" | "clock";
  }
> = {
  [PamHeartbeatStatus.Healthy]: { label: "Healthy", tone: "ok", icon: "check-c" },
  [PamHeartbeatStatus.InvalidCredentials]: { label: "Out of sync", tone: "bad", icon: "alert-c" },
  [PamHeartbeatStatus.CannotCheck]: { label: "Unreachable", tone: "warn", icon: "alert" },
  [PamHeartbeatStatus.Unknown]: { label: "Unchecked", tone: "neutral", icon: "clock" }
};

export const CredentialHealth = ({
  accountId,
  canCheck,
  onBeforeCheck
}: {
  accountId: string;
  canCheck: boolean;
  onBeforeCheck: () => Promise<boolean>;
}) => {
  const pamAccess = useV4Adapter("pamAccess");
  const { data: heartbeat } = pamAccess.useHeartbeat(accountId);
  const check = pamAccess.useCheckHeartbeat();
  const [pending, setPending] = useState(false);
  if (!heartbeat) return null;

  const status = heartbeat.status ?? PamHeartbeatStatus.Unknown;
  const { label, tone, icon } = HEALTH[status] ?? HEALTH[PamHeartbeatStatus.Unknown];
  const healthy = status === PamHeartbeatStatus.Healthy;
  const items: DataListItem[] = [
    ...(!heartbeat.enabled && status !== PamHeartbeatStatus.Unknown
      ? [["Result", "From the last check, before checking was turned off"] as DataListItem]
      : []),
    ["Last checked", relative(heartbeat.lastCheckedAt)],
    ...(healthy ? [] : [["Last healthy", relative(heartbeat.lastHealthyAt)] as DataListItem])
  ];

  const runCheck = async () => {
    setPending(true);
    try {
      if (!(await onBeforeCheck())) return;
      await check.mutateAsync({ accountId });
      saved("Credential check complete");
    } catch (error) {
      failed("Failed to check credential", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Credential health"
      badges={
        <StatusText tone={tone} icon={icon}>
          {label}
        </StatusText>
      }
      action={
        <Button
          variant="outline"
          loading={pending}
          disabledReason={
            canCheck ? undefined : "You don't have permission to view this account's credentials"
          }
          onClick={runCheck}
        >
          Check now
        </Button>
      }
    >
      <Stack gap={12}>
        <Text muted>
          {heartbeat.enabled
            ? `Checked every ${formatRotationInterval(heartbeat.intervalSeconds)}, from ${heartbeat.templateName}.`
            : `Scheduled checks are off for ${heartbeat.templateName}.`}
        </Text>
        <DataList variant="props" items={items} />
        {!healthy && heartbeat.lastMessage && (
          <Alert tone={status === PamHeartbeatStatus.InvalidCredentials ? "bad" : "warn"}>
            <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
              {heartbeat.lastMessage}
            </span>
          </Alert>
        )}
      </Stack>
    </Card>
  );
};

const passwordFormat = (reqs: TPamAccountRotation["passwordRequirements"]) => {
  if (!reqs) return [];
  const badges = [`${reqs.length} chars`];
  if (reqs.required.uppercase > 0) badges.push("A to Z");
  if (reqs.required.lowercase > 0) badges.push("a to z");
  if (reqs.required.digits > 0) badges.push("0 to 9");
  if (reqs.required.symbols > 0) badges.push("Symbols");
  return badges;
};

const DEPENDENCY_TYPES: Record<string, string> = {
  "windows-service": "Windows service",
  "scheduled-task": "Scheduled task",
  "iis-app-pool": "IIS app pool"
};

const DEPENDENCY_FIELDS: Record<string, { key: string; label: string }[]> = {
  "windows-service": [
    { key: "pathName", label: "Binary path" },
    { key: "state", label: "State" }
  ],
  "scheduled-task": [
    { key: "taskPath", label: "Task path" },
    { key: "state", label: "State" }
  ],
  "iis-app-pool": [{ key: "state", label: "State" }]
};

const DependencyStatus = ({ dependency }: { dependency: TPamAccountDependency }) => {
  if (dependency.rotationStatus === PamRotationStatus.Success)
    return (
      <StatusText tone="ok" icon="check-c">
        Rotated
      </StatusText>
    );
  if (dependency.rotationStatus === PamRotationStatus.Failed)
    return (
      <Tooltip content={dependency.lastRotationMessage ?? "The last rotation failed"}>
        <StatusText tone="bad" icon="alert" tabIndex={0}>
          Failed
        </StatusText>
      </Tooltip>
    );
  return <StatusText icon="clock">Never</StatusText>;
};

const dependencyDetails = (dependency: TPamAccountDependency): DataListItem[] => {
  const data = dependency.data ?? {};
  const read = (key: string) => {
    const value = data[key];
    return value === null || value === undefined || value === "" ? null : String(value);
  };
  const runAs = read("runAsAccount");
  return [
    ...(runAs
      ? [["Runs as", <MiddleTruncate key="runAs" text={runAs} mono />] as DataListItem]
      : []),
    ...(DEPENDENCY_FIELDS[dependency.type] ?? []).flatMap(({ key, label }): DataListItem[] => {
      const value = read(key);
      return value ? [[label, <MiddleTruncate key={key} text={value} mono />]] : [];
    }),
    [
      "Last rotation",
      dependency.lastRotatedAt
        ? format(new Date(dependency.lastRotatedAt), "MMM d, yyyy h:mm a")
        : "Never"
    ],
    ...(dependency.rotationStatus === PamRotationStatus.Failed && dependency.lastRotationMessage
      ? [["Error", dependency.lastRotationMessage] as DataListItem]
      : [])
  ];
};

const Dependencies = ({ accountId }: { accountId: string }) => {
  const { data: dependencies = [] } = useV4Adapter("pamAccess").useDependencies(accountId);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!dependencies.length) return null;
  const machines = new Set(dependencies.map(({ machine }) => machine)).size;
  const columns: DataTableColumn<TPamAccountDependency>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (dependency) => dependency.name,
      render: (dependency) => <MiddleTruncate text={dependency.name} />
    },
    {
      id: "type",
      header: "Type",
      width: 160,
      render: (dependency) => (
        <Badge tone="outline">{DEPENDENCY_TYPES[dependency.type] ?? dependency.type}</Badge>
      )
    },
    {
      id: "machine",
      header: "Machine",
      width: 200,
      render: (dependency) => <MiddleTruncate text={dependency.machine} mono />
    },
    {
      id: "status",
      header: "Rotation status",
      width: 140,
      render: (dependency) => <DependencyStatus dependency={dependency} />
    }
  ];
  const open = dependencies.find(({ id }) => id === expanded);
  return (
    <Card
      variant="framed"
      flush
      title="Dependencies"
      badges={<Count tone="neutral">{dependencies.length}</Count>}
      hint={`Rotating this account updates ${dependencies.length} ${dependencies.length === 1 ? "dependency" : "dependencies"} across ${machines} ${machines === 1 ? "machine" : "machines"}.`}
      footer={
        open ? (
          <Stack gap={8}>
            <Text>{open.name}</Text>
            <DataList variant="props" items={dependencyDetails(open)} />
          </Stack>
        ) : undefined
      }
    >
      <DataTable
        label="Dependencies"
        rows={dependencies}
        columns={columns}
        getRowId={(dependency) => dependency.id}
        rowLabel={(dependency) => dependency.name}
        focusedRowId={expanded ?? undefined}
        onRowActivate={(dependency) =>
          setExpanded((current) => (current === dependency.id ? null : dependency.id))
        }
      />
    </Card>
  );
};

const NONE = "none";

export const RotationPanel = ({
  accountId,
  metadata
}: {
  accountId: string;
  metadata?: TPamAccountTypeMetadata;
}) => {
  const pam = useV4Adapter("pam");
  const pamAccess = useV4Adapter("pamAccess");
  const { data: rotation, error: rotationError } = pamAccess.useRotation(accountId);
  const { data: candidates = [] } = pamAccess.useRotationCandidates(accountId);
  const { can } = pam.useAccountActions(accountId);
  const canManage = can(PamResourcePermissionActions.ManageRotation);
  const updateRotation = pamAccess.useUpdateRotation();
  const rotateNow = pamAccess.useRotateNow();
  const [rotating, setRotating] = useState(false);
  const rotationAccount = useAutosave({
    value: rotation?.rotationAccountId ?? NONE,
    errorMessage: "Failed to update the rotation account",
    onSave: async (next) => {
      await updateRotation.mutateAsync({
        accountId,
        rotationAccountId: next === NONE ? null : next
      });
    }
  });

  if (!rotation && rotationError)
    return (
      <EmptyState
        size="sm"
        icon="alert"
        title="Could not load rotation settings"
        description={errorMessage(rotationError) || "Close the sheet and try again."}
      />
    );
  if (!rotation)
    return (
      <Stack gap={12}>
        <Skeleton height={120} />
        <Skeleton height={96} />
      </Stack>
    );

  const badges = passwordFormat(rotation.passwordRequirements);
  const options = [
    { value: NONE, label: "None (not configured)" },
    ...candidates.flatMap((group) =>
      group.accounts.map((candidate) => ({
        value: candidate.id,
        label: `${candidate.name}${candidate.id === accountId ? " (this account)" : ""}`,
        description: candidate.host,
        group: group.folderName ?? "Ungrouped"
      }))
    )
  ];
  if (
    rotation.rotationAccountId &&
    !options.some(({ value }) => value === rotation.rotationAccountId)
  )
    options.push({
      value: rotation.rotationAccountId,
      label: rotation.rotationAccountName ?? rotation.rotationAccountId,
      description: "",
      group: "Current"
    });

  const runRotate = async () => {
    setRotating(true);
    try {
      await rotateNow.mutateAsync({ accountId });
      saved("Credential rotated");
    } catch (error) {
      failed("Failed to rotate credential", error);
    } finally {
      setRotating(false);
    }
  };

  let rotateReason: string | undefined;
  if (!canManage) rotateReason = "You don't have permission to rotate this account";
  else if (!rotation.isReady) rotateReason = "Set a rotation account first";

  return (
    <Stack gap={16}>
      <Card
        title="Rotation"
        badges={
          <StatusText tone={rotation.enabled ? "ok" : "neutral"} icon="sync">
            {rotation.enabled ? "Automatic" : "On demand"}
          </StatusText>
        }
        action={
          <Button
            variant="outline"
            icon="sync"
            loading={rotating}
            disabledReason={rotateReason}
            onClick={runRotate}
          >
            Rotate now
          </Button>
        }
      >
        <Stack gap={12}>
          <DataList
            variant="props"
            items={[
              [
                "Schedule",
                rotation.enabled
                  ? formatRotationInterval(rotation.intervalSeconds)
                  : "On demand only"
              ],
              [
                "Password format",
                badges.length ? (
                  <Inline key="format" gap={4}>
                    {badges.map((badge) => (
                      <Badge key={badge} tone="outline">
                        {badge}
                      </Badge>
                    ))}
                  </Inline>
                ) : (
                  "Default"
                )
              ],
              [
                "Last rotated",
                rotation.lastRotatedAt
                  ? format(new Date(rotation.lastRotatedAt), "MMMM do, yyyy")
                  : "Never"
              ]
            ]}
          />
          {rotation.rotationStatus === PamRotationStatus.Failed && rotation.lastRotationError && (
            <Alert tone="bad" title="Last rotation failed">
              <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                {rotation.lastRotationError}
              </span>
            </Alert>
          )}
        </Stack>
      </Card>
      {rotation.sharedIdentity.length > 0 && (
        <Alert tone="warn" title="Shared identity">
          <Stack gap={4}>
            <span>
              Rotating this account changes a credential these accounts also store. They aren&apos;t
              updated automatically and need their credentials refreshed.
            </span>
            {rotation.sharedIdentity.map((ref) => (
              <span key={ref.id}>
                {ref.discoverySources.length
                  ? `${ref.name}, credential for discovery ${ref.discoverySources.length > 1 ? "sources" : "source"} ${ref.discoverySources.join(", ")}`
                  : ref.name}
              </span>
            ))}
          </Stack>
        </Alert>
      )}
      <SettingsCard title="Rotation account" saveStatus={rotationAccount.status}>
        <Field
          label="Rotation account"
          description="The privileged account used to rotate this password. Pick this account to rotate its own password."
        >
          <Select
            label="Rotation account"
            value={rotationAccount.value}
            options={options}
            disabled={!canManage || rotationAccount.pending}
            onValueChange={(next) => {
              if (next !== rotationAccount.value) rotationAccount.save(next);
            }}
          />
        </Field>
      </SettingsCard>
      {metadata?.supportsDependencies && <Dependencies accountId={accountId} />}
      {!rotation.isReady && (
        <Alert tone="warn" title="Not rotating yet">
          This account won&apos;t rotate until a rotation account is set.
        </Alert>
      )}
    </Stack>
  );
};

type RecordingDraft = {
  connectionId: string | null;
  bucket: string;
  region: string;
  keyPrefix: string;
};

const recordingOf = (account: TPamAccount): RecordingDraft => {
  const s3 = account.settingsOverrides?.recordingS3Config;
  return {
    connectionId: account.recordingConnectionId,
    bucket: s3?.bucket ?? "",
    region: s3?.region ?? "",
    keyPrefix: s3?.keyPrefix ?? ""
  };
};

const probeCors = async (url: string) => {
  try {
    await fetch(url, { mode: "cors" });
  } catch {
    toast({
      tone: "bad",
      title: "Bucket CORS not configured",
      description: "Session playback needs the bucket to allow GET requests from this origin.",
      action: {
        label: "CORS setup docs",
        onClick: () =>
          window.open(
            "https://infisical.com/docs/documentation/platform/pam/recording-storage",
            "_blank",
            "noopener,noreferrer"
          )
      }
    });
  }
};

const GatewayOverride = ({ account }: { account: TPamAccount }) => {
  const pam = useV4Adapter("pam");
  const networking = useV4Adapter("networking");
  const update = pam.useUpdateAccount();
  const { data: template } = pam.useTemplate(account.templateId);
  const { data: gateways = [] } = networking.useGateways();
  const { data: pools = [] } = networking.usePools();
  const [picking, setPicking] = useState(false);
  const gateway = useAutosave({
    value: { gatewayId: account.gatewayId, gatewayPoolId: account.gatewayPoolId },
    errorMessage: "Failed to update the gateway override",
    onSave: async (next) => {
      await update.mutateAsync({
        accountId: account.id,
        accountType: account.accountType,
        gatewayId: next.gatewayId,
        gatewayPoolId: next.gatewayPoolId
      });
    }
  });
  const overriding = Boolean(gateway.value.gatewayId || gateway.value.gatewayPoolId) || picking;
  const labelOf = (gatewayId?: string | null, poolId?: string | null) => {
    if (poolId) return pools.find(({ id }) => id === poolId)?.name ?? "Gateway pool";
    if (gatewayId) return gateways.find(({ id }) => id === gatewayId)?.name ?? "Gateway";
    return "No gateway";
  };
  const inherited = labelOf(template?.gatewayId, template?.gatewayPoolId);

  return (
    <SettingsCard
      title="Gateway"
      saveStatus={gateway.status}
      description={
        overriding
          ? `Overrides the template default, ${inherited}.`
          : `Inherited from ${account.templateName}: ${inherited}`
      }
      action={
        overriding ? (
          <Button
            variant="ghost"
            disabled={gateway.pending}
            onClick={() => {
              setPicking(false);
              if (account.gatewayId || account.gatewayPoolId)
                gateway.save({ gatewayId: null, gatewayPoolId: null });
            }}
          >
            Remove override
          </Button>
        ) : (
          <Button variant="outline" icon="pencil" onClick={() => setPicking(true)}>
            Override
          </Button>
        )
      }
    >
      {overriding && (
        <Field label="Gateway">
          <GatewayPicker
            label="Gateway"
            required
            disabled={gateway.pending}
            value={gateway.value}
            onChange={(next) => {
              setPicking(false);
              gateway.save(next);
            }}
          />
        </Field>
      )}
    </SettingsCard>
  );
};

const RecordingOverride = ({
  account,
  onDirtyChange
}: {
  account: TPamAccount;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const orgId = useOrgId();
  const pam = useV4Adapter("pam");
  const update = pam.useUpdateAccount();
  const { data: projectId = "" } = useV4Adapter("access").usePamProjectId(orgId);
  const { data: connections = [] } = pam.useRecordingConnections(projectId);
  const { data: template } = pam.useTemplate(account.templateId);
  const stored = recordingOf(account);
  const [draft, setDraftState] = useState<RecordingDraft | null>(null);
  const setDraft = (next: RecordingDraft | null) => {
    setDraftState(next);
    onDirtyChange(next !== null);
  };
  const [picking, setPicking] = useState(false);
  const values = draft ?? stored;
  const hasOverride = Boolean(values.connectionId || values.bucket || values.region);
  const overriding = hasOverride || picking;
  const edit = (patch: Partial<RecordingDraft>) => setDraft({ ...values, ...patch });
  const connectionApp = connections.find(
    ({ id }) => id === (values.connectionId ?? template?.recordingConnectionId)
  )?.app;
  const isS3Compatible = connectionApp === AppConnection.S3Compatible;
  const inherited = template?.recordingConnectionId
    ? (connections.find(({ id }) => id === template.recordingConnectionId)?.name ?? "Connection")
    : "None";

  const save = async () => {
    const bucket = values.bucket.trim();
    const region = values.region.trim();
    const keyPrefix = values.keyPrefix.trim();
    const result = (await update
      .mutateAsync({
        accountId: account.id,
        accountType: account.accountType,
        recordingConnectionId: values.connectionId,
        settingsOverrides:
          bucket || region
            ? {
                recordingS3Config: {
                  bucket,
                  ...(region && !isS3Compatible ? { region } : {}),
                  ...(keyPrefix ? { keyPrefix } : {})
                }
              }
            : null
      })
      .catch((error: unknown) => {
        failed("Failed to update recording overrides", error);
        throw error;
      })) as { corsProbeUrl?: string | null };
    saved("Overrides updated");
    setDraft(null);
    setPicking(false);
    if (result?.corsProbeUrl) await probeCors(result.corsProbeUrl);
  };

  return (
    <SettingsCard
      title="Recording"
      description={
        overriding
          ? "Overrides the template's recording storage for this account."
          : `Inherited from ${account.templateName}: ${inherited}`
      }
      dirty={Boolean(draft)}
      onDiscard={() => {
        setDraft(null);
        setPicking(false);
      }}
      onSave={save}
      action={
        overriding ? (
          <Button
            variant="ghost"
            onClick={() => {
              setPicking(false);
              setDraft({ connectionId: null, bucket: "", region: "", keyPrefix: "" });
            }}
          >
            Remove override
          </Button>
        ) : (
          <Button variant="outline" icon="pencil" onClick={() => setPicking(true)}>
            Override
          </Button>
        )
      }
    >
      {overriding && (
        <Stack gap={16}>
          <Alert tone="warn" title="Changing the bucket affects existing recordings">
            Recordings stay in the old bucket and become inaccessible unless you migrate each
            object. Keep the same bucket and key prefix when rotating credentials.
          </Alert>
          <Field label="Connection">
            <Select
              label="Connection"
              value={values.connectionId ?? NONE}
              options={[
                { value: NONE, label: "None" },
                ...connections.map((connection) => ({
                  value: connection.id,
                  label: connection.name,
                  description: connection.providerName
                }))
              ]}
              onValueChange={(next) => edit({ connectionId: next === NONE ? null : next })}
            />
          </Field>
          <Field label="Bucket">
            <Input
              mono
              placeholder="my-recordings-bucket"
              value={values.bucket}
              onChange={(event) => edit({ bucket: event.target.value })}
            />
          </Field>
          {!isS3Compatible && (
            <Field label="Region">
              <Input
                mono
                width="md"
                placeholder="us-east-1"
                value={values.region}
                onChange={(event) => edit({ region: event.target.value })}
              />
            </Field>
          )}
          <Field label="Key prefix" optional>
            <Input
              mono
              placeholder="recordings/"
              value={values.keyPrefix}
              onChange={(event) => edit({ keyPrefix: event.target.value })}
            />
          </Field>
        </Stack>
      )}
    </SettingsCard>
  );
};

export const OverridesPanel = ({
  account,
  metadata,
  onDirtyChange
}: {
  account: TPamAccount;
  metadata?: TPamAccountTypeMetadata;
  onDirtyChange: (dirty: boolean) => void;
}) => {
  const showGateway = metadata?.requiresGateway !== false;
  const showRecording = accountTypeRequiresRecording(account.accountType);
  if (!showGateway && !showRecording)
    return <Text muted>No settings available for this account type.</Text>;
  return (
    <Stack gap={16}>
      {showGateway && <GatewayOverride account={account} />}
      {showRecording && <RecordingOverride account={account} onDirtyChange={onDirtyChange} />}
    </Stack>
  );
};
