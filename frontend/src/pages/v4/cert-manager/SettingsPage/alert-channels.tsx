import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { CertificateEnterpriseAlertingUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import { isValidEmail } from "@app/helpers/email";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
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
  CHANNEL_ICONS,
  ENTERPRISE_CHANNEL_TYPES,
  getAlertResourceType,
  KEEP_PLACEHOLDER,
  MAX_CHANNELS,
  normalizeEmail,
  pluralize,
  type TAlertForm,
  type TMemberEmails,
  toRecipientEmails,
  WEBHOOK_AUTH_COPY
} from "./alert-model";

const NO_AUTH = "none";

export const AddChannelMenu = ({
  channelCount,
  hasEnterprise,
  onAdd
}: {
  channelCount: number;
  hasEnterprise: boolean;
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
                onSelect={() =>
                  isLocked
                    ? openUpgradeGate({
                        intent: CertificateEnterpriseAlertingUpgradeIntent,
                        paywallKey: "cert-manager.application-alert-channels"
                      })
                    : onAdd(channelType)
                }
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

const EmailRecipientsField = ({
  value,
  onChange,
  error,
  members
}: {
  value: TAlertChannelRecipient[];
  onChange: (recipients: TAlertChannelRecipient[]) => void;
  error?: string;
  members: TMemberEmails;
}) => {
  const emails = toRecipientEmails(value, members);
  const groups = value.filter((recipient) => recipient.principalType === AlertPrincipalType.Group);
  const unlistedUsers = value.filter(
    (recipient) =>
      recipient.principalType === AlertPrincipalType.User &&
      !members.emailByUserId.has(recipient.principalId)
  );
  const options = [...new Set([...members.memberIdByEmail.keys(), ...emails])]
    .sort()
    .map((email) => ({ value: email, label: email }));

  const setEmails = (nextEmails: string[]) =>
    onChange([
      ...nextEmails.map((email) => {
        const userId = members.memberIdByEmail.get(email);
        return userId
          ? { principalType: AlertPrincipalType.User, principalId: userId }
          : { principalType: AlertPrincipalType.Email, principalId: email };
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
        value={emails}
        onChange={setEmails}
        placeholder="Select members or type an email"
        emptyText="No matching members. Type a full email to add it."
        invalid={Boolean(error)}
        onCreate={(query) => {
          const email = normalizeEmail(query);
          if (!isValidEmail(email)) throw new Error("Enter a full email address");
          if (!emails.includes(email)) setEmails([...emails, email]);
        }}
      />
    </Field>
  );
};

const WebhookAuthenticationField = ({ index }: { index: number }) => {
  const { control, setValue, formState } = useFormContext<TAlertForm>();
  const channel = useWatch({ control, name: `channels.${index}` });
  const channelErrors = formState.errors.channels?.[index];
  const authType = channel?.authType;
  const isUrlChanged = isWebhookUrlChanged(channel ?? {});
  const fields = authType ? WEBHOOK_AUTH_FIELDS[authType] : undefined;
  const hasSavedSecret = Boolean(fields && channel?.id && channel[fields.secret.hasSaved]);
  const needsReentry = hasSavedSecret && isUrlChanged;
  let description = "Requests are sent without authentication.";
  if (authType) {
    description =
      needsReentry && fields && !channel?.[fields.secret.field]
        ? "The URL changed, so enter the credentials again. Saved credentials are only sent to the URL they were saved with."
        : WEBHOOK_AUTH_COPY[authType].description;
  }

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
            setValue(
              `channels.${index}.authType`,
              value === NO_AUTH ? undefined : (value as WebhookAuthType),
              { shouldDirty: true }
            )
          }
        />
      </Field>
      {fields && (
        <Inline gap={8} align="start" wrap={false}>
          {fields.name && (
            <Controller
              control={control}
              name={`channels.${index}.${fields.name.field}`}
              render={({ field }) => (
                <Field
                  wide
                  label={fields.name?.label}
                  error={channelErrors?.[fields.name!.field]?.message}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Input
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={fields.name?.placeholder}
                    invalid={Boolean(channelErrors?.[fields.name!.field])}
                    autoComplete="off"
                  />
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name={`channels.${index}.${fields.secret.field}`}
            render={({ field }) => (
              <Field
                wide
                label={fields.secret.label}
                error={channelErrors?.[fields.secret.field]?.message}
                style={{ flex: 1, minWidth: 0 }}
              >
                <SecretInput
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder={hasSavedSecret && !needsReentry ? KEEP_PLACEHOLDER : undefined}
                  invalid={Boolean(channelErrors?.[fields.secret.field])}
                />
              </Field>
            )}
          />
        </Inline>
      )}
    </Stack>
  );
};

const WebhookSigningSecretField = ({ index }: { index: number }) => {
  const { control, setValue, formState } = useFormContext<TAlertForm>();
  const [isEnabled, hasSigningSecret, channelId] = useWatch({
    control,
    name: [
      `channels.${index}.signingSecretEnabled`,
      `channels.${index}.hasSigningSecret`,
      `channels.${index}.id`
    ]
  });
  const error = formState.errors.channels?.[index]?.signingSecret?.message;
  const setEnabled = (enabled: boolean) => {
    setValue(`channels.${index}.signingSecretEnabled`, enabled, { shouldDirty: true });
    setValue(`channels.${index}.signingSecret`, "");
  };

  return (
    <Field
      wide
      label="Signing secret"
      optional
      error={error}
      description="Signs each request in the x-infisical-signature header so your endpoint can verify it came from Infisical."
    >
      {isEnabled ? (
        <Inline gap={8} align="start" wrap={false}>
          <Controller
            control={control}
            name={`channels.${index}.signingSecret`}
            render={({ field }) => (
              <div style={{ flex: 1, minWidth: 0 }}>
                <SecretInput
                  aria-label="Signing secret"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder={channelId && hasSigningSecret ? KEEP_PLACEHOLDER : undefined}
                  invalid={Boolean(error)}
                />
              </div>
            )}
          />
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

const WebhookHeadersField = ({ index }: { index: number }) => {
  const { control, formState } = useFormContext<TAlertForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `channels.${index}.headers`
  });
  const headerErrors = formState.errors.channels?.[index]?.headers;

  return (
    <Field wide label="Custom headers" optional group>
      <Stack gap={8}>
        {fields.map((header, headerIndex) => (
          <Inline key={header.id} gap={8} align="start" wrap={false}>
            <Controller
              control={control}
              name={`channels.${index}.headers.${headerIndex}.key`}
              render={({ field }) => (
                <Field
                  wide
                  error={headerErrors?.[headerIndex]?.key?.message}
                  style={{ width: "40%" }}
                >
                  <Input
                    mono
                    aria-label="Header name"
                    placeholder="X-Env"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(headerErrors?.[headerIndex]?.key)}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={`channels.${index}.headers.${headerIndex}.value`}
              render={({ field }) => (
                <Field
                  wide
                  error={headerErrors?.[headerIndex]?.value?.message}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Input
                    aria-label="Header value"
                    placeholder="production"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(headerErrors?.[headerIndex]?.value)}
                  />
                </Field>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon="trash"
              iconOnly
              onClick={() => remove(headerIndex)}
            >
              Remove header
            </Button>
          </Inline>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() => append({ key: "", value: "" })}
          >
            Add header
          </Button>
        </div>
      </Stack>
    </Field>
  );
};

const SavedSecretField = ({
  index,
  name,
  label,
  placeholder,
  hasSaved
}: {
  index: number;
  name: "webhookUrl" | "integrationKey";
  label: string;
  placeholder: string;
  hasSaved: boolean;
}) => {
  const { control, formState } = useFormContext<TAlertForm>();
  const error = formState.errors.channels?.[index]?.[name]?.message;
  return (
    <Controller
      control={control}
      name={`channels.${index}.${name}`}
      render={({ field }) => (
        <Field wide label={label} error={error}>
          <SecretInput
            value={field.value ?? ""}
            onChange={field.onChange}
            placeholder={hasSaved ? KEEP_PLACEHOLDER : placeholder}
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
};

const ChannelCard = ({
  index,
  projectId,
  alertId,
  members,
  onRemove
}: {
  index: number;
  projectId: string;
  alertId?: string;
  members: TMemberEmails;
  onRemove: () => void;
}) => {
  const { control, getValues, trigger, formState } = useFormContext<TAlertForm>();
  const testChannel = useV4Adapter("certManagerSettings").useTestAlertChannel();
  const channel = useWatch({ control, name: `channels.${index}` });
  const eventType = useWatch({ control, name: "eventType" });
  const channelErrors = formState.errors.channels?.[index];
  const { channelType } = channel;
  const label = ALERT_CHANNEL_TYPE_LABELS[channelType];
  const isExisting = Boolean(channel.id);
  const glyph = CHANNEL_ICONS[channelType];

  const onTest = async () => {
    if (!(await trigger(`channels.${index}`))) return;
    const { config, recipients } = toChannelInput(getValues(`channels.${index}`));
    try {
      const result = await testChannel.mutateAsync({
        resourceType: getAlertResourceType(eventType),
        resourceId: null,
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={testChannel.isPending}
            onClick={onTest}
          >
            Send test
          </Button>
          <Controller
            control={control}
            name={`channels.${index}.enabled`}
            render={({ field }) => (
              <Switch
                aria-label={`${label} channel enabled`}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon="trash"
            iconOnly
            onClick={onRemove}
          >
            Remove channel
          </Button>
        </Inline>
      }
    >
      <Stack gap={16}>
        {channelType === AlertChannelType.Email && (
          <Controller
            control={control}
            name={`channels.${index}.recipients`}
            render={({ field }) => (
              <EmailRecipientsField
                value={field.value ?? []}
                onChange={field.onChange}
                error={(channelErrors?.recipients as { message?: string } | undefined)?.message}
                members={members}
              />
            )}
          />
        )}
        {channelType === AlertChannelType.Slack && (
          <SavedSecretField
            index={index}
            name="webhookUrl"
            label="Webhook URL"
            placeholder="https://hooks.slack.com/..."
            hasSaved={isExisting && Boolean(channel.hasWebhookUrl)}
          />
        )}
        {channelType === AlertChannelType.Webhook && (
          <>
            <Controller
              control={control}
              name={`channels.${index}.url`}
              render={({ field }) => (
                <Field wide label="URL" error={channelErrors?.url?.message}>
                  <Input
                    mono
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="https://example.com/webhook"
                    invalid={Boolean(channelErrors?.url)}
                    autoComplete="off"
                  />
                </Field>
              )}
            />
            <WebhookAuthenticationField index={index} />
            <WebhookSigningSecretField index={index} />
            <WebhookHeadersField index={index} />
          </>
        )}
        {channelType === AlertChannelType.PagerDuty && (
          <SavedSecretField
            index={index}
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
  projectId,
  alertId,
  members,
  hasEnterprise,
  onAdd,
  onRemove,
  fieldIds
}: {
  projectId: string;
  alertId?: string;
  members: TMemberEmails;
  hasEnterprise: boolean;
  onAdd: (channelType: AlertChannelType) => void;
  onRemove: (index: number) => void;
  fieldIds: string[];
}) => (
  <Stack gap={16}>
    <Inline gap={12} justify="between" align="center" wrap={false}>
      <SmallText muted>
        {fieldIds.length ? pluralize(fieldIds.length, "channel") : "No channels yet"}
      </SmallText>
      <AddChannelMenu channelCount={fieldIds.length} hasEnterprise={hasEnterprise} onAdd={onAdd} />
    </Inline>
    {fieldIds.length === 0 ? (
      <EmptyState
        size="sm"
        icon="bell"
        title="No channels"
        description="Add a channel to choose where this alert is sent."
      />
    ) : (
      fieldIds.map((id, index) => (
        <ChannelCard
          key={id}
          index={index}
          projectId={projectId}
          alertId={alertId}
          members={members}
          onRemove={() => onRemove(index)}
        />
      ))
    )}
  </Stack>
);
