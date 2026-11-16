import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";

import { CertificateEnterpriseAlertingUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { isValidEmail } from "@app/helpers/email";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  channelFormSchema,
  isWebhookUrlChanged,
  type TAlertChannelRecipient,
  WEBHOOK_AUTH_FIELDS,
  WebhookAuthType
} from "@app/hooks/api/alerts/types";
import { toChannelInput } from "@app/hooks/api/alerts/utils";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import {
  buildNextChannel,
  CHANNEL_ICONS,
  ENTERPRISE_CHANNEL_TYPES,
  KEEP_PLACEHOLDER,
  MAX_CHANNELS,
  normalizeEmail,
  pluralize,
  type TDraftChannel,
  type TFieldErrors,
  type TMemberEmails,
  toDraftChannel,
  removeIndexedErrors,
  toDraftHeader,
  toFieldErrors,
  toRecipientEmails,
  WEBHOOK_AUTH_COPY,
  withoutErrors
} from "./alert-model";

const NO_AUTH = "none";

type TUpgradeGateRequest = Parameters<ReturnType<typeof useUpgradeGate>["openUpgradeGate"]>[0];

export type TChannelResource = { resourceType: string; resourceId: string | null };

const CERTIFICATE_CHANNEL_UPGRADE: TUpgradeGateRequest = {
  intent: CertificateEnterpriseAlertingUpgradeIntent,
  paywallKey: "cert-manager.application-alert-channels"
};

export const AddChannelMenu = ({
  channelCount,
  hasEnterprise,
  upgrade = CERTIFICATE_CHANNEL_UPGRADE,
  onAdd
}: {
  channelCount: number;
  hasEnterprise: boolean;
  upgrade?: TUpgradeGateRequest;
  onAdd: (channelType: AlertChannelType) => void;
}) => {
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon="plus"
            layout="trigger"
            disabledReason={
              channelCount >= MAX_CHANNELS
                ? `An alert can have up to ${MAX_CHANNELS} channels`
                : undefined
            }
          >
            Add channel
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {Object.values(AlertChannelType).map((channelType) => {
            const isLocked = !hasEnterprise && ENTERPRISE_CHANNEL_TYPES.includes(channelType);
            const glyph = CHANNEL_ICONS[channelType];
            return (
              <DropdownMenuItem
                key={channelType}
                onSelect={() => (isLocked ? openUpgradeGate(upgrade) : onAdd(channelType))}
              >
                {typeof glyph === "string" ? <Icon name={glyph} /> : <Icon icon={glyph} />}
                {ALERT_CHANNEL_TYPE_LABELS[channelType]}
                {isLocked && <Badge tone="soft">Enterprise</Badge>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {upgradeGate}
    </>
  );
};

const PROJECT_PRINCIPALS: string[] = [
  AlertPrincipalType.ProjectMembers,
  AlertPrincipalType.ProjectAdmins
];
const PROJECT_RECIPIENT_LABELS: Record<string, string> = {
  [AlertPrincipalType.ProjectMembers]: "All project members",
  [AlertPrincipalType.ProjectAdmins]: "Project admins"
};

const EmailRecipientsField = ({
  value,
  onChange,
  error,
  members,
  projectId,
  projectRecipients
}: {
  value: TAlertChannelRecipient[];
  onChange: (recipients: TAlertChannelRecipient[]) => void;
  error?: string;
  members: TMemberEmails;
  projectId: string;
  projectRecipients?: boolean;
}) => {
  const projectValues = value
    .filter((recipient) => PROJECT_PRINCIPALS.includes(recipient.principalType))
    .map((recipient) => recipient.principalType as string);
  const emails = toRecipientEmails(value, members);
  const selected = [...projectValues, ...emails];
  const groups = value.filter((recipient) => recipient.principalType === AlertPrincipalType.Group);
  const unlistedUsers = value.filter(
    (recipient) =>
      recipient.principalType === AlertPrincipalType.User &&
      !members.emailByUserId.has(recipient.principalId)
  );
  const projectOptions = (projectRecipients ? PROJECT_PRINCIPALS : projectValues).map(
    (principalType) => ({
      value: principalType,
      label: PROJECT_RECIPIENT_LABELS[principalType],
      group: "Project"
    })
  );
  const options = [
    ...projectOptions,
    ...[...new Set([...members.memberIdByEmail.keys(), ...emails])].sort().map((email) => ({
      value: email,
      label: email,
      ...(projectOptions.length && { group: "Members" })
    }))
  ];

  const setEmails = (nextValues: string[]) =>
    onChange([
      ...nextValues.map((entry) => {
        if (PROJECT_PRINCIPALS.includes(entry))
          return { principalType: entry as AlertPrincipalType, principalId: projectId };
        const userId = members.memberIdByEmail.get(entry);
        return userId
          ? { principalType: AlertPrincipalType.User, principalId: userId }
          : { principalType: AlertPrincipalType.Email, principalId: entry };
      }),
      ...unlistedUsers,
      ...groups
    ]);

  const also = [
    unlistedUsers.length ? pluralize(unlistedUsers.length, "more member") : undefined,
    groups.length ? pluralize(groups.length, "group") : undefined
  ].filter(Boolean);

  return (
    <Field
      wide
      label="Recipients"
      error={error}
      description={`Pick organization members or type an email address on a verified email domain.${
        also.length ? ` Also sent to ${also.join(" and ")}.` : ""
      }`}
    >
      <Combobox
        multiple
        label="Recipients"
        options={options}
        value={selected}
        onChange={setEmails}
        placeholder="Select members or type an email"
        emptyText="No matching members. Type a full email to add it."
        invalid={Boolean(error)}
        onCreate={(query) => {
          const email = normalizeEmail(query);
          if (!isValidEmail(email)) throw new Error("Enter a full email address");
          if (!selected.includes(email)) setEmails([...selected, email]);
        }}
      />
    </Field>
  );
};

type TChannelFieldProps = {
  channel: TDraftChannel;
  error: (field: string) => string | undefined;
  onChange: (
    patch: Partial<TDraftChannel>,
    fixErrors?: (errors: TFieldErrors) => TFieldErrors
  ) => void;
};

const WebhookAuthenticationField = ({ channel, error, onChange }: TChannelFieldProps) => {
  const { authType } = channel;
  const isUrlChanged = isWebhookUrlChanged(channel);
  const fields = authType ? WEBHOOK_AUTH_FIELDS[authType] : undefined;
  const hasSavedSecret = Boolean(fields && channel.id && channel[fields.secret.hasSaved]);
  const needsReentry = hasSavedSecret && isUrlChanged;
  let description = "Requests are sent without authentication.";
  if (authType) {
    description =
      needsReentry && fields && !channel[fields.secret.field]
        ? "The URL changed, so enter the credentials again. Saved credentials are only sent to the URL they were saved with."
        : WEBHOOK_AUTH_COPY[authType].description;
  }
  const nameError = fields?.name ? error(fields.name.field) : undefined;
  const secretError = fields ? error(fields.secret.field) : undefined;

  return (
    <Stack gap={12}>
      <Field wide label="Authentication" description={description}>
        <Select
          label="Authentication"
          value={authType ?? NO_AUTH}
          options={[
            { value: NO_AUTH, label: "None" },
            ...Object.values(WebhookAuthType).map((type) => ({
              value: type,
              label: WEBHOOK_AUTH_COPY[type].label
            }))
          ]}
          onChange={(value) =>
            onChange({ authType: value === NO_AUTH ? undefined : (value as WebhookAuthType) })
          }
        />
      </Field>
      {fields && (
        <Inline gap={8} align="start" wrap={false}>
          {fields.name && (
            <Field
              wide
              label={fields.name.label}
              error={nameError}
              style={{ flex: 1, minWidth: 0 }}
            >
              <Input
                value={channel[fields.name.field] ?? ""}
                onChange={(event) => onChange({ [fields.name!.field]: event.target.value })}
                placeholder={fields.name.placeholder}
                invalid={Boolean(nameError)}
                autoComplete="off"
              />
            </Field>
          )}
          <Field
            wide
            label={fields.secret.label}
            error={secretError}
            style={{ flex: 1, minWidth: 0 }}
          >
            <SecretInput
              value={channel[fields.secret.field] ?? ""}
              onChange={(value) => onChange({ [fields.secret.field]: value })}
              placeholder={hasSavedSecret && !needsReentry ? KEEP_PLACEHOLDER : undefined}
              invalid={Boolean(secretError)}
            />
          </Field>
        </Inline>
      )}
    </Stack>
  );
};

const WebhookSigningSecretField = ({ channel, error, onChange }: TChannelFieldProps) => {
  const message = error("signingSecret");
  const setEnabled = (enabled: boolean) =>
    onChange({ signingSecretEnabled: enabled, signingSecret: "" });

  return (
    <Field
      wide
      label="Signing secret"
      optional
      error={message}
      description="Signs each request in the x-infisical-signature header so your endpoint can verify it came from Infisical."
    >
      {channel.signingSecretEnabled ? (
        <Inline gap={8} align="start" wrap={false}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SecretInput
              aria-label="Signing secret"
              value={channel.signingSecret ?? ""}
              onChange={(value) => onChange({ signingSecret: value })}
              placeholder={channel.id && channel.hasSigningSecret ? KEEP_PLACEHOLDER : undefined}
              invalid={Boolean(message)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon="trash"
            iconOnly
            onClick={() => setEnabled(false)}
          >
            Remove signing secret
          </Button>
        </Inline>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() => setEnabled(true)}
          >
            Add signing secret
          </Button>
        </div>
      )}
    </Field>
  );
};

const WebhookHeadersField = ({ channel, error, onChange }: TChannelFieldProps) => {
  const { headers } = channel;
  const setHeader = (headerIndex: number, field: "key" | "value", value: string) =>
    onChange(
      {
        headers: headers.map((header, position) =>
          position === headerIndex ? { ...header, [field]: value } : header
        )
      },
      (errors) => withoutErrors(errors, `headers.${headerIndex}.${field}`)
    );

  return (
    <Field wide label="Custom headers" optional group>
      <Stack gap={8}>
        {headers.map((header, headerIndex) => {
          const keyError = error(`headers.${headerIndex}.key`);
          const valueError = error(`headers.${headerIndex}.value`);
          return (
            <Inline key={header.uid} gap={8} align="start" wrap={false}>
              <Field wide error={keyError} style={{ width: "40%" }}>
                <Input
                  mono
                  aria-label="Header name"
                  placeholder="X-Env"
                  value={header.key}
                  onChange={(event) => setHeader(headerIndex, "key", event.target.value)}
                  invalid={Boolean(keyError)}
                />
              </Field>
              <Field wide error={valueError} style={{ flex: 1, minWidth: 0 }}>
                <Input
                  aria-label="Header value"
                  placeholder="production"
                  value={header.value}
                  onChange={(event) => setHeader(headerIndex, "value", event.target.value)}
                  invalid={Boolean(valueError)}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon="trash"
                iconOnly
                onClick={() =>
                  onChange({ headers: headers.filter(({ uid }) => uid !== header.uid) }, (errors) =>
                    removeIndexedErrors(errors, "headers.", headerIndex)
                  )
                }
              >
                Remove header
              </Button>
            </Inline>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() =>
              onChange(
                { headers: [...headers, toDraftHeader({ key: "", value: "" })] },
                (errors) => errors
              )
            }
          >
            Add header
          </Button>
        </div>
      </Stack>
    </Field>
  );
};

const SavedSecretField = ({
  channel,
  error,
  onChange,
  name,
  label,
  placeholder,
  hasSaved
}: TChannelFieldProps & {
  name: "webhookUrl" | "integrationKey";
  label: string;
  placeholder: string;
  hasSaved: boolean;
}) => {
  const message = error(name);
  return (
    <Field wide label={label} error={message}>
      <SecretInput
        value={channel[name] ?? ""}
        onChange={(value) => onChange({ [name]: value })}
        placeholder={hasSaved ? KEEP_PLACEHOLDER : placeholder}
        invalid={Boolean(message)}
      />
    </Field>
  );
};

const ChannelCard = ({
  channel,
  error,
  onChange,
  projectId,
  alertId,
  members,
  resource,
  projectRecipients,
  onInvalid,
  onRemove
}: TChannelFieldProps & {
  projectId: string;
  alertId?: string;
  members: TMemberEmails;
  resource: TChannelResource;
  projectRecipients?: boolean;
  onInvalid: (errors: TFieldErrors) => void;
  onRemove: () => void;
}) => {
  const testChannel = useV4Adapter("certManagerSettings").useTestAlertChannel();
  const { channelType } = channel;
  const label = ALERT_CHANNEL_TYPE_LABELS[channelType];
  const isExisting = Boolean(channel.id);
  const glyph = CHANNEL_ICONS[channelType];
  const fieldProps = { channel, error, onChange };

  const onTest = async () => {
    const parsed = channelFormSchema.safeParse(channel);
    if (!parsed.success) {
      onInvalid(toFieldErrors(parsed.error, () => true));
      return;
    }
    const { config, recipients } = toChannelInput(parsed.data);
    try {
      const result = await testChannel.mutateAsync({
        ...resource,
        projectId,
        alertId,
        channelId: channel.id,
        channelType,
        config,
        recipients
      });
      if (result.success) {
        saved(
          `Test ${label} alert sent${
            result.deliveredTo && result.deliveredTo > 1
              ? ` to ${result.deliveredTo} recipients`
              : ""
          }`
        );
      } else {
        failed(
          `Test ${label} notification failed`,
          new Error(result.error ?? "The channel couldn't be reached.")
        );
      }
    } catch {
      // Request errors are toasted globally.
    }
  };

  return (
    <Card
      title={
        <Inline gap={8} align="center" wrap={false}>
          {typeof glyph === "string" ? <Icon name={glyph} /> : <Icon icon={glyph} />}
          {label}
        </Inline>
      }
      action={
        <Inline gap={8} align="center" wrap={false}>
          <Button type="button" variant="outline" loading={testChannel.isPending} onClick={onTest}>
            Send test
          </Button>
          <Switch
            aria-label={`${label} channel enabled`}
            checked={channel.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
          <Button type="button" variant="ghost" icon="trash" iconOnly onClick={onRemove}>
            Remove channel
          </Button>
        </Inline>
      }
    >
      <Stack gap={16}>
        {channelType === AlertChannelType.Email && (
          <EmailRecipientsField
            value={channel.recipients ?? []}
            onChange={(recipients) => onChange({ recipients })}
            error={error("recipients")}
            members={members}
            projectId={projectId}
            projectRecipients={projectRecipients}
          />
        )}
        {channelType === AlertChannelType.Slack && (
          <SavedSecretField
            {...fieldProps}
            name="webhookUrl"
            label="Webhook URL"
            placeholder="https://hooks.slack.com/..."
            hasSaved={isExisting && Boolean(channel.hasWebhookUrl)}
          />
        )}
        {channelType === AlertChannelType.Webhook && (
          <>
            <Field wide label="URL" error={error("url")}>
              <Input
                mono
                value={channel.url ?? ""}
                onChange={(event) => onChange({ url: event.target.value })}
                placeholder="https://example.com/webhook"
                invalid={Boolean(error("url"))}
                autoComplete="off"
              />
            </Field>
            <WebhookAuthenticationField {...fieldProps} />
            <WebhookSigningSecretField {...fieldProps} />
            <WebhookHeadersField {...fieldProps} />
          </>
        )}
        {channelType === AlertChannelType.PagerDuty && (
          <SavedSecretField
            {...fieldProps}
            name="integrationKey"
            label="Integration key"
            placeholder="32-character integration key"
            hasSaved={isExisting && Boolean(channel.hasIntegrationKey)}
          />
        )}
      </Stack>
    </Card>
  );
};

export const ChannelsStep = ({
  channels,
  errors,
  onChange,
  onErrorsChange,
  projectId,
  alertId,
  members,
  hasEnterprise,
  resource,
  upgrade,
  projectRecipients
}: {
  channels: TDraftChannel[];
  errors: TFieldErrors;
  onChange: (channels: TDraftChannel[]) => void;
  onErrorsChange: (errors: TFieldErrors) => void;
  projectId: string;
  alertId?: string;
  members: TMemberEmails;
  hasEnterprise: boolean;
  resource: TChannelResource;
  upgrade?: TUpgradeGateRequest;
  projectRecipients?: boolean;
}) => (
  <Stack gap={16}>
    <Inline gap={12} justify="between" align="center" wrap={false}>
      <SmallText muted>
        {channels.length ? pluralize(channels.length, "channel") : "No channels yet"}
      </SmallText>
      <AddChannelMenu
        channelCount={channels.length}
        hasEnterprise={hasEnterprise}
        upgrade={upgrade}
        onAdd={(channelType) =>
          onChange([...channels, toDraftChannel(buildNextChannel(channels, channelType))])
        }
      />
    </Inline>
    {channels.length === 0 ? (
      <EmptyState
        size="sm"
        icon="bell"
        title="No channels"
        description="Add a channel to choose where this alert is sent."
      />
    ) : (
      channels.map((channel, index) => (
        <ChannelCard
          key={channel.uid}
          channel={channel}
          error={(field) => errors[`${index}.${field}`]}
          onChange={(patch, fixErrors) => {
            onChange(
              channels.map((entry) => (entry.uid === channel.uid ? { ...entry, ...patch } : entry))
            );
            const prefix = `${index}.`;
            const own = Object.fromEntries(
              Object.entries(errors)
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, message]) => [key.slice(prefix.length), message])
            );
            const fixed = fixErrors
              ? fixErrors(own)
              : Object.keys(patch).reduce((next, field) => withoutErrors(next, field), own);
            onErrorsChange({
              ...withoutErrors(errors, String(index)),
              ...Object.fromEntries(
                Object.entries(fixed).map(([key, message]) => [`${prefix}${key}`, message])
              )
            });
          }}
          onInvalid={(channelErrors) =>
            onErrorsChange({
              ...withoutErrors(errors, String(index)),
              ...Object.fromEntries(
                Object.entries(channelErrors).map(([field, message]) => [
                  `${index}.${field}`,
                  message
                ])
              )
            })
          }
          projectId={projectId}
          alertId={alertId}
          members={members}
          resource={resource}
          projectRecipients={projectRecipients}
          onRemove={() => {
            onChange(channels.filter(({ uid }) => uid !== channel.uid));
            onErrorsChange(removeIndexedErrors(errors, "", index));
          }}
        />
      ))
    )}
  </Stack>
);
