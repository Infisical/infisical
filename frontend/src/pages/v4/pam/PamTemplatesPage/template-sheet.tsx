import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Switch } from "@infisical/cipher/ui/switch";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  accountTypeRequiresRecording,
  getRotationIntervalOptions,
  isRotatablePamAccountType,
  maxGeneratedPasswordLength,
  pamAccountTypeSupportsSessionLogMasking,
  PamPolicyType,
  type TPamAccountTemplateDetail,
  type TPamAccountTypeMetadata,
  type TUpdatePamAccountTemplateDTO
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { GatewayPicker } from "../../networking/gateway-picker";
import {
  BooleanPolicyEditor,
  CommandBlockingEditor,
  DurationPolicyEditor,
  OutputMaskingPolicyEditor,
  type PolicyEditorProps
} from "./policy-editors";

const POLICY_EDITORS: Partial<
  Record<PamPolicyType, (props: PolicyEditorProps) => React.JSX.Element>
> = {
  [PamPolicyType.RequiresApproval]: BooleanPolicyEditor,
  [PamPolicyType.AllowAutoApproval]: BooleanPolicyEditor,
  [PamPolicyType.AllowBreakGlass]: BooleanPolicyEditor,
  [PamPolicyType.RequireMfa]: BooleanPolicyEditor,
  [PamPolicyType.RequireReason]: BooleanPolicyEditor,
  [PamPolicyType.MaxSessionDuration]: DurationPolicyEditor,
  [PamPolicyType.CommandBlocking]: CommandBlockingEditor,
  [PamPolicyType.OutputMasking]: OutputMaskingPolicyEditor
};

type Drafts = Record<string, unknown>;
type CardProps = {
  template: TPamAccountTemplateDetail;
  drafts: Drafts;
  setDraft: (key: string, value?: unknown) => void;
};

const APPROVAL_DEPENDENT_POLICIES = [
  PamPolicyType.AllowAutoApproval,
  PamPolicyType.AllowBreakGlass
];
const DEFAULT_INTERVAL = 86400;

const settingsOf = (template: TPamAccountTemplateDetail) =>
  (template.settings ?? {}) as Record<string, unknown>;

const useTemplateUpdate = (template: TPamAccountTemplateDetail) => {
  const update = useV4Adapter("pam").useUpdateTemplate();
  const run = async (
    patch: Omit<TUpdatePamAccountTemplateDTO, "templateId">,
    success: string,
    failure: string
  ) => {
    try {
      const result = await update.mutateAsync({ templateId: template.id, ...patch });
      saved(success);
      return result;
    } catch (error) {
      failed(failure, error);
      return undefined;
    }
  };
  return { run, status: update.isPending ? ("saving" as const) : ("idle" as const) };
};

const intervalOptions = (current?: number | null) =>
  getRotationIntervalOptions(current).map((option) => ({
    value: String(option.seconds),
    label: option.label
  }));

const PoliciesCard = ({
  template,
  meta,
  drafts,
  setDraft
}: CardProps & { meta?: TPamAccountTypeMetadata }) => {
  const { run, status } = useTemplateUpdate(template);
  const policies = (template.policies ?? {}) as Record<string, unknown>;
  const requiresApproval = policies[PamPolicyType.RequiresApproval] === true;
  const applicable = (meta?.applicablePolicies ?? []).filter(
    (policy) =>
      POLICY_EDITORS[policy.key] &&
      (!APPROVAL_DEPENDENT_POLICIES.includes(policy.key) || requiresApproval)
  );

  const savePolicy = async (key: PamPolicyType, label: string, value: unknown) => {
    const next = { ...policies };
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
    if (key === PamPolicyType.RequiresApproval && value !== true)
      APPROVAL_DEPENDENT_POLICIES.forEach((dependent) => delete next[dependent]);
    const result = await run({ policies: next }, `${label} updated`, `Could not update ${label}`);
    if (result) setDraft(`policy:${key}`);
    return Boolean(result);
  };

  return (
    <SettingsCard title="Policies" saveStatus={status}>
      {applicable.length ? (
        <Stack gap={20}>
          {applicable.map((policy) => {
            const Editor = POLICY_EDITORS[policy.key]!;
            return (
              <Editor
                key={policy.key}
                policy={policy}
                accountType={template.type}
                value={policies[policy.key]}
                draft={drafts[`policy:${policy.key}`] as string | undefined}
                onDraft={(draft) => setDraft(`policy:${policy.key}`, draft)}
                onSave={(value) => savePolicy(policy.key, policy.label, value)}
                pending={status === "saving"}
              />
            );
          })}
        </Stack>
      ) : (
        <SmallText muted>No policies apply to this account type.</SmallText>
      )}
    </SettingsCard>
  );
};

type Requirements = {
  length: number;
  uppercase: number;
  lowercase: number;
  digits: number;
  symbols: number;
  allowedSymbols: string;
};

const REQUIREMENT_FIELDS = [
  { key: "length", label: "Min length" },
  { key: "uppercase", label: "Min uppercase" },
  { key: "lowercase", label: "Min lowercase" },
  { key: "digits", label: "Min numbers" },
  { key: "symbols", label: "Min symbols" }
] as const;

const requirementsOf = (
  template: TPamAccountTemplateDetail,
  defaultLength: number
): Requirements => {
  const pw = (settingsOf(template).passwordRequirements ?? {}) as {
    length?: number;
    required?: Partial<Record<"uppercase" | "lowercase" | "digits" | "symbols", number>>;
    allowedSymbols?: string;
  };
  return {
    length: pw.length ?? defaultLength,
    uppercase: pw.required?.uppercase ?? 1,
    lowercase: pw.required?.lowercase ?? 1,
    digits: pw.required?.digits ?? 1,
    symbols: pw.required?.symbols ?? 1,
    allowedSymbols: pw.allowedSymbols ?? "-_.~!*"
  };
};

const requirementErrors = (values: Requirements, maxLength: number) => {
  const errors: Partial<Record<keyof Requirements, string>> = {};
  (["uppercase", "lowercase", "digits", "symbols"] as const).forEach((key) => {
    if (values[key] < 0) errors[key] = "Cannot be negative";
  });
  const total = values.uppercase + values.lowercase + values.digits + values.symbols;
  if (values.length < 1 || values.length > maxLength)
    errors.length = `Length must be between 1 and ${maxLength}`;
  else if (total === 0) errors.length = "Require at least one character type";
  else if (total > values.length) errors.length = "Length must be at least the sum of the minimums";
  return errors;
};

const RequirementsCard = ({ template, drafts, setDraft }: CardProps) => {
  const { run } = useTemplateUpdate(template);
  const maxLength = maxGeneratedPasswordLength(template.type);
  const stored = requirementsOf(template, Math.min(32, maxLength));
  const draft = drafts.requirements as Requirements | undefined;
  const values = draft ?? stored;
  const errors = requirementErrors(values, maxLength);
  const hasErrors = Object.keys(errors).length > 0;
  const edit = (patch: Partial<Requirements>) => setDraft("requirements", { ...values, ...patch });

  return (
    <SettingsCard
      title="Credential requirements"
      description="Applies at onboarding and on rotation."
      dirty={Boolean(draft)}
      saveDisabledReason={hasErrors ? "Fix the highlighted fields first" : undefined}
      onDiscard={() => setDraft("requirements")}
      onSave={async () => {
        const result = await run(
          {
            settings: {
              ...settingsOf(template),
              passwordRequirements: {
                length: values.length,
                required: {
                  uppercase: values.uppercase,
                  lowercase: values.lowercase,
                  digits: values.digits,
                  symbols: values.symbols
                },
                ...(values.allowedSymbols ? { allowedSymbols: values.allowedSymbols } : {})
              }
            }
          },
          "Credential requirements updated",
          "Could not update the credential requirements"
        );
        if (!result) throw new Error("Could not update the credential requirements");
        setDraft("requirements");
      }}
    >
      <Stack gap={16}>
        <Grid columns={2} gap={12}>
          {REQUIREMENT_FIELDS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              error={errors[key]}
              description={key === "length" ? `1 to ${maxLength} characters` : undefined}
            >
              <Input
                type="number"
                width="xs"
                max={key === "length" ? maxLength : undefined}
                value={String(values[key])}
                invalid={Boolean(errors[key])}
                onChange={(event) => edit({ [key]: Number(event.target.value) })}
                onWheel={(event) => event.currentTarget.blur()}
              />
            </Field>
          ))}
        </Grid>
        <Field
          label="Allowed symbols"
          description="Quotes, backticks, backslashes, semicolons, and question marks are not allowed."
        >
          <Input
            mono
            placeholder="-_.~!*"
            value={values.allowedSymbols}
            onChange={(event) => edit({ allowedSymbols: event.target.value })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

type Schedule = { enabled?: boolean; intervalSeconds?: number | null };

const ScheduleCard = ({
  template,
  settingKey,
  title,
  description,
  switchLabel,
  intervalLabel,
  children
}: {
  template: TPamAccountTemplateDetail;
  settingKey: "rotation" | "heartbeat";
  title: string;
  description?: string;
  switchLabel: string;
  intervalLabel: string;
  children?: React.ReactNode;
}) => {
  const { run, status } = useTemplateUpdate(template);
  const schedule = (settingsOf(template)[settingKey] ?? {}) as Schedule;
  const enabled = Boolean(schedule.enabled);
  const interval = schedule.intervalSeconds ?? DEFAULT_INTERVAL;
  const save = (next: Schedule) =>
    run(
      { settings: { ...settingsOf(template), [settingKey]: next } },
      `${title} updated`,
      `Could not update ${title.toLowerCase()}`
    );

  return (
    <SettingsCard
      title={title}
      description={description}
      saveStatus={status}
      action={
        <Switch
          aria-label={switchLabel}
          checked={enabled}
          disabled={status === "saving"}
          onCheckedChange={(checked) =>
            save({ enabled: checked, intervalSeconds: checked ? interval : null })
          }
        />
      }
    >
      {enabled && (
        <Stack gap={16}>
          {children}
          <Field label={intervalLabel}>
            <Select
              label={intervalLabel}
              width="md"
              value={String(interval)}
              disabled={status === "saving"}
              options={intervalOptions(schedule.intervalSeconds)}
              onValueChange={(value) => {
                if (Number(value) !== interval)
                  save({ enabled: true, intervalSeconds: Number(value) });
              }}
            />
          </Field>
        </Stack>
      )}
    </SettingsCard>
  );
};

const RotationImpact = ({ template }: { template: TPamAccountTemplateDetail }) => {
  const impact = template.rotationImpact;
  if (!impact || impact.needsRotationAccount === 0) return null;
  const one = impact.needsRotationAccount === 1;
  const ready =
    impact.willRotate > 0
      ? ` ${impact.willRotate} ${impact.willRotate === 1 ? "account is" : "accounts are"} ready to rotate.`
      : "";
  return (
    <Alert
      tone="warn"
      title={`${impact.needsRotationAccount} ${one ? "account" : "accounts"} won't rotate yet`}
    >
      {`Set a rotation account on ${one ? "it" : "them"} to enable rotation.${ready}`}
    </Alert>
  );
};

const GatewayCard = ({ template }: { template: TPamAccountTemplateDetail }) => {
  const { run, status } = useTemplateUpdate(template);
  return (
    <SettingsCard title="Gateway" saveStatus={status}>
      <Field label="Gateway" description="Used to reach accounts unless overridden on the account.">
        <GatewayPicker
          label="Gateway"
          noGatewayLabel="No gateway"
          disabled={status === "saving"}
          value={{
            gatewayId: template.gatewayId ?? null,
            gatewayPoolId: template.gatewayPoolId ?? null
          }}
          onChange={(value) => run(value, "Gateway updated", "Could not update the gateway")}
        />
      </Field>
    </SettingsCard>
  );
};

type Recording = {
  backend: "postgres" | "aws-s3";
  connectionId: string | null;
  bucket: string;
  region: string;
  keyPrefix: string;
};

const recordingOf = (template: TPamAccountTemplateDetail): Recording => {
  const settings = settingsOf(template);
  const s3 = (settings.recordingS3Config ?? {}) as Record<string, string>;
  return {
    backend: (settings.recordingStorageBackend as Recording["backend"] | undefined) ?? "postgres",
    connectionId: template.recordingConnectionId ?? null,
    bucket: s3.bucket ?? "",
    region: s3.region ?? "",
    keyPrefix: s3.keyPrefix ?? ""
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

const RecordingCard = ({
  template,
  typeName,
  drafts,
  setDraft
}: CardProps & { typeName: string }) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const { data: projectId = "" } = useV4Adapter("access").usePamProjectId(orgId);
  const { data: connections = [] } = useV4Adapter("pam").useRecordingConnections(projectId);
  const { run } = useTemplateUpdate(template);
  const draft = drafts.recording as Recording | undefined;
  const values = draft ?? recordingOf(template);
  const edit = (patch: Partial<Recording>) => setDraft("recording", { ...values, ...patch });
  const isS3 = values.backend === "aws-s3";
  const connectionApp = connections.find(
    (connection) => connection.id === values.connectionId
  )?.app;
  const errors = {
    connectionId: isS3 && !values.connectionId ? "Select a connection" : undefined,
    bucket: isS3 && !values.bucket.trim() ? "Bucket is required" : undefined
  };

  return (
    <SettingsCard
      title="Session recording"
      dirty={Boolean(draft)}
      saveDisabledReason={errors.connectionId ?? errors.bucket}
      onDiscard={() => setDraft("recording")}
      onSave={async () => {
        const settings: Record<string, unknown> = {
          ...settingsOf(template),
          recordingStorageBackend: values.backend
        };
        if (isS3 && values.bucket)
          settings.recordingS3Config = {
            bucket: values.bucket,
            ...(connectionApp === AppConnection.S3Compatible
              ? {}
              : { region: values.region || "us-east-1" }),
            ...(values.keyPrefix ? { keyPrefix: values.keyPrefix } : {})
          };
        else delete settings.recordingS3Config;
        const result = await run(
          { settings, recordingConnectionId: isS3 ? values.connectionId : null },
          "Session recording updated",
          "Could not update session recording"
        );
        if (!result) throw new Error("Could not update session recording");
        setDraft("recording");
        if (result.corsProbeUrl) await probeCors(result.corsProbeUrl);
      }}
    >
      <Stack gap={16}>
        <Field label="Storage backend">
          <Select
            label="Storage backend"
            value={values.backend}
            options={[
              { value: "postgres", label: "Internal database" },
              { value: "aws-s3", label: "S3 bucket" }
            ]}
            onValueChange={(backend) => edit({ backend: backend as Recording["backend"] })}
          />
        </Field>
        {accountTypeRequiresRecording(template.type) && !isS3 && (
          <Alert tone="warn" title="Accounts cannot be launched">
            {`${typeName} accounts need external recording storage. Accounts using this template can still be created, but sessions can't launch until it is configured.`}
          </Alert>
        )}
        {isS3 && (
          <>
            <Alert tone="warn" title="Changing the bucket affects existing recordings">
              Recordings stay in the old bucket and become inaccessible unless you migrate each
              object. Keep the same bucket and key prefix when rotating credentials.
            </Alert>
            <Field
              label="Connection"
              error={draft ? errors.connectionId : undefined}
              description={
                connections.length
                  ? undefined
                  : "No AWS or S3-Compatible Storage connections found. Create one from the App Connections page."
              }
            >
              <Select
                label="Connection"
                placeholder="Select a connection"
                value={values.connectionId ?? ""}
                invalid={Boolean(draft && errors.connectionId)}
                options={connections.map((connection) => ({
                  value: connection.id,
                  label: connection.name,
                  description: connection.providerName
                }))}
                onValueChange={(connectionId) => edit({ connectionId: connectionId || null })}
              />
            </Field>
            <Field label="Bucket" error={draft ? errors.bucket : undefined}>
              <Input
                mono
                placeholder="my-recordings-bucket"
                value={values.bucket}
                invalid={Boolean(draft && errors.bucket)}
                onChange={(event) => edit({ bucket: event.target.value })}
              />
            </Field>
            {connectionApp !== AppConnection.S3Compatible && (
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
                placeholder="pam-recordings/"
                value={values.keyPrefix}
                onChange={(event) => edit({ keyPrefix: event.target.value })}
              />
            </Field>
          </>
        )}
      </Stack>
    </SettingsCard>
  );
};

const MaskingCard = ({ template, drafts, setDraft }: CardProps) => {
  const { run, status } = useTemplateUpdate(template);
  const settings = settingsOf(template);
  const stored =
    typeof settings.sessionLogMaskingPatterns === "string"
      ? settings.sessionLogMaskingPatterns
      : "";
  const draft = drafts.maskingPatterns as string | undefined;

  return (
    <SettingsCard title="Session log masking" saveStatus={status}>
      <Stack gap={16}>
        <Switch
          layout="row"
          label={
            <Inline gap={8} align="center">
              Built-in detection
              <Badge tone="ok">Recommended</Badge>
            </Inline>
          }
          description="API keys and tokens from known providers, and the account's own credentials, are masked automatically."
          checked={settings.sessionLogMaskingBuiltInDetection === true}
          disabled={status === "saving"}
          onCheckedChange={(checked) =>
            run(
              { settings: { ...settings, sessionLogMaskingBuiltInDetection: checked } },
              "Built-in detection updated",
              "Could not update built-in detection"
            )
          }
        />
        <Field label="Custom patterns" description="One regex per line.">
          <Textarea
            mono
            rows={5}
            placeholder={"acme_[a-z0-9]{24}\ninternal-vault://\\S+"}
            value={draft ?? stored}
            onChange={(event) =>
              setDraft(
                "maskingPatterns",
                event.target.value === stored ? undefined : event.target.value
              )
            }
            onBlur={async () => {
              if (draft === undefined) return;
              const next = { ...settings };
              if (draft.trim()) next.sessionLogMaskingPatterns = draft.trim();
              else delete next.sessionLogMaskingPatterns;
              const result = await run(
                { settings: next },
                "Masking patterns updated",
                "Could not update the masking patterns"
              );
              if (result) setDraft("maskingPatterns");
            }}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

type Details = { name: string; description: string };

const DetailsCard = ({ template, drafts, setDraft }: CardProps) => {
  const { run } = useTemplateUpdate(template);
  const draft = drafts.details as Details | undefined;
  const values = draft ?? { name: template.name, description: template.description ?? "" };
  const edit = (patch: Partial<Details>) => setDraft("details", { ...values, ...patch });
  const errors = {
    name: values.name.trim() ? undefined : "Name is required",
    description:
      values.description.length > 256 ? "Keep the description under 256 characters" : undefined
  };
  if (!errors.name && values.name.length > 64) errors.name = "Keep the name under 64 characters";

  return (
    <SettingsCard
      title="Details"
      dirty={Boolean(draft)}
      saveDisabledReason={errors.name ?? errors.description}
      onDiscard={() => setDraft("details")}
      onSave={async () => {
        const result = await run(
          { name: values.name.trim(), description: values.description || null },
          "Template updated",
          "Could not update the template"
        );
        if (!result) throw new Error("Could not update the template");
        setDraft("details");
      }}
    >
      <Stack gap={16}>
        <Field label="Name" error={errors.name}>
          <Input
            value={values.name}
            invalid={Boolean(errors.name)}
            autoComplete="off"
            onChange={(event) => edit({ name: event.target.value })}
          />
        </Field>
        <Field label="Description" optional error={errors.description}>
          <Textarea
            rows={3}
            value={values.description}
            aria-invalid={Boolean(errors.description) || undefined}
            onChange={(event) => edit({ description: event.target.value })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

const GeneralTab = ({
  template,
  meta,
  drafts,
  setDraft
}: CardProps & { meta?: TPamAccountTypeMetadata }) => {
  const typeName = meta?.name ?? template.type;
  const showGatewaySettings = meta?.requiresGateway !== false;
  return (
    <Stack gap={16}>
      <PoliciesCard template={template} meta={meta} drafts={drafts} setDraft={setDraft} />
      {isRotatablePamAccountType(template.type) && (
        <>
          <RequirementsCard template={template} drafts={drafts} setDraft={setDraft} />
          <ScheduleCard
            template={template}
            settingKey="rotation"
            title="Automatic rotation"
            description="When off, credentials rotate only when triggered manually."
            switchLabel="Automatically rotate credentials"
            intervalLabel="Rotate every"
          >
            <RotationImpact template={template} />
          </ScheduleCard>
        </>
      )}
      <ScheduleCard
        template={template}
        settingKey="heartbeat"
        title="Credential health"
        description="Checks that stored credentials still work and shows the result on each account."
        switchLabel="Check credentials"
        intervalLabel="Check every"
      />
      {showGatewaySettings && (
        <>
          <GatewayCard template={template} />
          <RecordingCard
            template={template}
            typeName={typeName}
            drafts={drafts}
            setDraft={setDraft}
          />
          {pamAccountTypeSupportsSessionLogMasking(template.type) && (
            <MaskingCard template={template} drafts={drafts} setDraft={setDraft} />
          )}
        </>
      )}
    </Stack>
  );
};

export const TemplateSheet = ({
  templateId,
  tab,
  onTabChange,
  onClose
}: {
  templateId?: string;
  tab: PamSheetTab;
  onTabChange: (tab: string) => void;
  onClose: () => void;
}) => {
  const pam = useV4Adapter("pam");
  const { data: template } = pam.useTemplate(templateId);
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const [drafts, setDrafts] = useState<Drafts>({});
  const close = () => {
    setDrafts({});
    onClose();
  };
  const guard = useDiscardChangesGuard({
    isDirty: Object.keys(drafts).length > 0,
    onDiscard: close
  });
  const setDraft = (key: string, value?: unknown) =>
    setDrafts((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  const meta = accountTypes.find((entry) => entry.type === template?.type);
  const cardProps = template ? { template, drafts, setDraft } : undefined;

  return (
    <>
      <Sheet open={Boolean(templateId)} onOpenChange={(open) => !open && guard.requestDiscard()}>
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>{template?.name ?? "Template"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {cardProps ? (
              <Stack gap={24}>
                <DataList
                  variant="meta"
                  items={[
                    ["Type", meta?.name ?? cardProps.template.type],
                    ["Accounts", `${cardProps.template.accountCount} using this template`],
                    ["Created", format(new Date(cardProps.template.createdAt), "MMM d, yyyy")]
                  ]}
                />
                <Tabs
                  label="Template sections"
                  value={tab}
                  onChange={onTabChange}
                  tabs={[
                    { value: PamSheetTab.General, label: "General" },
                    { value: PamSheetTab.Configuration, label: "Configuration" }
                  ]}
                />
                {tab === PamSheetTab.Configuration ? (
                  <DetailsCard {...cardProps} />
                ) : (
                  <GeneralTab {...cardProps} meta={meta} />
                )}
              </Stack>
            ) : (
              <Stack gap={16}>
                <Skeleton height={32} width={240} />
                <Skeleton lines={6} />
              </Stack>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this template will be lost."
      />
    </>
  );
};
