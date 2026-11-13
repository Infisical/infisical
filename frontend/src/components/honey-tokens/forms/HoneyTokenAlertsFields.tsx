import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";
import { BellIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionHoneyTokenActions } from "@app/context/ProjectPermissionContext/types";
import { AlertChannelType, AlertResourceType, TChannelForm } from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { THoneyTokenForm } from "./schemas";

type TProjectPermission = ReturnType<typeof useProjectPermission>["permission"];

// Mirrors the backend, where adding, changing or removing a honey token's alert needs edit on the token.
export const canManageTriggerAlert = (
  permission: TProjectPermission,
  { environment, secretPath }: { environment?: string; secretPath?: string }
) => {
  if (!environment || !secretPath) return false;

  return permission.can(
    ProjectPermissionHoneyTokenActions.Edit,
    subject(ProjectPermissionSub.HoneyTokens, { environment, secretPath })
  );
};

// Recipient cleanup switches off a saved email channel once everyone on it has left.
const isEmptiedChannel = (channel: TChannelForm) =>
  Boolean(channel.id) &&
  !channel.enabled &&
  channel.channelType === AlertChannelType.Email &&
  channel.recipients.length === 0;

const describeEmptiedChannels = (names: string[]) =>
  names.length === 1
    ? `The "${names[0]}" channel has no recipients left, so it's switched off. Add a recipient or remove the channel.`
    : `The ${names.map((name) => `"${name}"`).join(", ")} channels have no recipients left, so they're switched off. Add a recipient or remove them.`;

// Watches the channels on its own so typing in a channel doesn't re-render every other channel card.
const EmptiedChannelsWarning = () => {
  const { control } = useFormContext<THoneyTokenForm>();
  const channels = useWatch({ control, name: "channels" });
  const names = (channels ?? []).filter(isEmptiedChannel).map((channel) => channel.name);
  if (names.length === 0) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertDescription>{describeEmptiedChannels(names)}</AlertDescription>
    </Alert>
  );
};

type Props = {
  projectId: string;
  honeyTokenId?: string;
  isAlertUnavailable: boolean;
};

export const HoneyTokenAlertsFields = ({ projectId, honeyTokenId, isAlertUnavailable }: Props) => {
  const { control, clearErrors, setValue } = useFormContext<THoneyTokenForm>();
  const { permission } = useProjectPermission();
  const [isTriggerAlertEnabled, environment, secretPath] = useWatch({
    control,
    name: ["isTriggerAlertEnabled", "environment", "secretPath"]
  });

  const canManage = canManageTriggerAlert(permission, {
    environment: environment?.slug,
    secretPath
  });

  useEffect(() => {
    if (canManage || !isTriggerAlertEnabled) return;
    setValue("isTriggerAlertEnabled", false, { shouldDirty: false });
    clearErrors("channels");
  }, [canManage, isTriggerAlertEnabled, setValue, clearErrors]);

  if (isAlertUnavailable) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load this honey token&apos;s alert. Saving leaves it unchanged. Close and
        reopen the honey token to try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="isTriggerAlertEnabled"
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <Item variant="outline" className={canManage ? undefined : "opacity-60"}>
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id="honey-token-trigger-alert-title">Alert When Triggered</ItemTitle>
              <ItemDescription id="honey-token-trigger-alert-description">
                Sends a notice when someone uses the decoy credentials.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Toggle
                ref={ref}
                variant="project"
                checked={canManage && value}
                disabled={!canManage}
                onBlur={onBlur}
                onCheckedChange={(checked) => {
                  onChange(checked);
                  if (!checked) clearErrors("channels");
                }}
                aria-labelledby="honey-token-trigger-alert-title"
                aria-describedby="honey-token-trigger-alert-description"
              />
            </ItemActions>
          </Item>
        )}
      />
      {!canManage && (
        <p className="text-sm text-muted">
          You can&apos;t set up an alert for this honey token. That needs permission to edit honey
          tokens in this environment and path. Ask a project admin to add one.
        </p>
      )}
      {canManage && isTriggerAlertEnabled && (
        <>
          <EmptiedChannelsWarning />
          <ChannelsField
            projectId={projectId}
            resourceType={AlertResourceType.HoneyToken}
            resourceId={honeyTokenId}
          />
        </>
      )}
      {canManage && !isTriggerAlertEnabled && (
        <p className="text-sm text-muted">
          No alert for this honey token. Infisical still records each trigger and marks the token as
          triggered.
        </p>
      )}
    </div>
  );
};
