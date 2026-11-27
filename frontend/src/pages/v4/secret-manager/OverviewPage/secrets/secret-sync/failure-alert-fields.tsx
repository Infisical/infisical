import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Alert } from "@infisical/cipher/ui/alert";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  ALERT_RESOURCE_TYPES_WITH_EMAIL_ADDRESSES,
  AlertChannelType,
  type TChannelForm
} from "@app/hooks/api/alerts/types";

import { ChannelsStep } from "../../../../cert-manager/SettingsPage/alert-channels";
import { useAlertMembers } from "../../../../cert-manager/SettingsPage/alert-members";
import {
  type TFieldErrors,
  toDraftChannel
} from "../../../../cert-manager/SettingsPage/alert-model";
import {
  channelErrorsOf,
  type FailureAlertTarget,
  fromDraftChannel,
  SYNC_FAILURE_ALERT
} from "./failure-alert";

const isEmptiedChannel = (channel: TChannelForm) =>
  Boolean(channel.id) &&
  !channel.enabled &&
  channel.channelType === AlertChannelType.Email &&
  channel.recipients.length === 0;

const emptiedWarning = (names: string[]) =>
  names.length === 1
    ? `The "${names[0]}" channel has no recipients left, so it's switched off. Add a recipient or remove the channel.`
    : `The ${names.map((name) => `"${name}"`).join(", ")} channels have no recipients left, so they're switched off. Add a recipient or remove them.`;

export function FailureAlertFields({
  projectId,
  resourceId,
  alertId,
  canManage,
  unavailable,
  target = SYNC_FAILURE_ALERT
}: {
  projectId: string;
  resourceId?: string;
  alertId?: string;
  canManage: boolean;
  unavailable?: boolean;
  target?: FailureAlertTarget;
}) {
  const { noun } = target;
  const {
    control,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors }
  } = useFormContext();
  const enabled = Boolean(useWatch({ control, name: "isFailureAlertEnabled" }));
  const [drafts, setDrafts] = useState(() =>
    ((getValues("channels") ?? []) as TChannelForm[]).map(toDraftChannel)
  );
  const members = useAlertMembers(projectId);
  const channelErrors = channelErrorsOf(errors);
  const rootError = (errors.channels as { message?: string } | undefined)?.message;
  const emptied = drafts.filter(isEmptiedChannel).map((channel) => channel.name);

  if (unavailable)
    return (
      <Alert tone="bad" title={`Couldn't load this ${noun}'s failure alert`}>
        {`Saving leaves it unchanged. Close and reopen the ${noun} to try again.`}
      </Alert>
    );

  const onErrorsChange = (next: TFieldErrors) => {
    Object.keys(channelErrors)
      .filter((key) => !(key in next))
      .forEach((key) => clearErrors(`channels.${key}`));
    Object.entries(next)
      .filter(([key, message]) => channelErrors[key] !== message)
      .forEach(([key, message]) => setError(`channels.${key}`, { type: "manual", message }));
  };

  return (
    <Stack gap={16}>
      <Switch
        layout="row"
        label={`Alert on ${noun} failure`}
        description={target.description}
        checked={canManage && enabled}
        disabled={!canManage}
        onCheckedChange={(checked) => {
          setValue("isFailureAlertEnabled", checked, { shouldDirty: true });
          if (!checked) clearErrors("channels");
        }}
      />
      {!canManage && (
        <SmallText muted>
          {`You can't set up a failure alert for this ${noun}. That needs permission to edit secret ${noun}s in this environment and path.`}
        </SmallText>
      )}
      {canManage && enabled && (
        <>
          {emptied.length > 0 && <Alert tone="warn">{emptiedWarning(emptied)}</Alert>}
          {rootError && <Alert tone="bad">{rootError}</Alert>}
          <ChannelsStep
            channels={drafts}
            errors={channelErrors}
            onChange={(next) => {
              setDrafts(next);
              setValue("channels", next.map(fromDraftChannel), { shouldDirty: true });
              if (rootError) clearErrors("channels");
            }}
            onErrorsChange={onErrorsChange}
            projectId={projectId}
            alertId={alertId}
            members={members}
            hasEnterprise
            resource={{ resourceType: target.resourceType, resourceId: resourceId ?? null }}
            projectRecipients
            allowEmailAddresses={ALERT_RESOURCE_TYPES_WITH_EMAIL_ADDRESSES.includes(
              target.resourceType
            )}
          />
        </>
      )}
      {canManage && !enabled && (
        <SmallText muted>
          {`No alert for this ${noun}. Admins still get an in-app notification when the ${noun} fails.`}
        </SmallText>
      )}
    </Stack>
  );
}
