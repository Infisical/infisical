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
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import {
  AlertChannelType,
  AlertPrincipalType,
  AlertResourceType,
  TChannelForm
} from "@app/hooks/api/alerts";
import { buildNextChannel, ChannelsField } from "@app/views/Alerts";

import { TSecretSyncForm } from "./schemas";

type TProjectPermission = ReturnType<typeof useProjectPermission>["permission"];

// Mirrors the backend, where adding, changing or removing a sync's alert needs edit on the sync. A sync whose
// source folder was deleted has no environment or path, and the backend checks it without them too.
export const canManageFailureAlert = (
  permission: TProjectPermission,
  {
    environment,
    secretPath,
    connectionId
  }: { environment?: string; secretPath?: string; connectionId?: string }
) =>
  permission.can(
    ProjectPermissionSecretSyncActions.Edit,
    subject(ProjectPermissionSub.SecretSyncs, {
      ...(environment && { environment }),
      ...(secretPath && { secretPath }),
      ...(connectionId && { connectionId })
    })
  );

export const buildProjectAdminsChannel = (projectId: string): TChannelForm => ({
  ...buildNextChannel([], AlertChannelType.Email),
  recipients: [{ principalType: AlertPrincipalType.ProjectAdmins, principalId: projectId }]
});

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
  const { control } = useFormContext<TSecretSyncForm>();
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
  syncId?: string;
  isAlertUnavailable: boolean;
};

export const SecretSyncAlertsFields = ({ projectId, syncId, isAlertUnavailable }: Props) => {
  const { control, clearErrors, setValue } = useFormContext<TSecretSyncForm>();
  const { permission } = useProjectPermission();
  const [isFailureAlertEnabled, environment, secretPath, connection] = useWatch({
    control,
    name: ["isFailureAlertEnabled", "environment", "secretPath", "connection"]
  });

  const canManage = canManageFailureAlert(permission, {
    environment: environment?.slug,
    secretPath,
    connectionId: connection?.id
  });

  useEffect(() => {
    if (canManage || !isFailureAlertEnabled) return;
    setValue("isFailureAlertEnabled", false, { shouldDirty: false });
    clearErrors("channels");
  }, [canManage, isFailureAlertEnabled, setValue, clearErrors]);

  if (isAlertUnavailable) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load this sync&apos;s failure alert. Saving leaves it unchanged. Close and
        reopen the sync to try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="isFailureAlertEnabled"
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <Item variant="outline" className={canManage ? undefined : "opacity-60"}>
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id="secret-sync-failure-alert-title">Alert on Sync Failure</ItemTitle>
              <ItemDescription id="secret-sync-failure-alert-description">
                Sends a notice when a sync, import or remove fails after all of its retries.
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
                aria-labelledby="secret-sync-failure-alert-title"
                aria-describedby="secret-sync-failure-alert-description"
              />
            </ItemActions>
          </Item>
        )}
      />
      {!canManage && (
        <p className="text-sm text-muted">
          You can&apos;t set up a failure alert for this sync. That needs permission to edit secret
          syncs in this environment and path. Ask a project admin to add one.
        </p>
      )}
      {canManage && isFailureAlertEnabled && (
        <>
          <EmptiedChannelsWarning />
          <ChannelsField
            projectId={projectId}
            resourceType={AlertResourceType.SecretSync}
            resourceId={syncId}
          />
        </>
      )}
      {canManage && !isFailureAlertEnabled && (
        <p className="text-sm text-muted">
          No alert for this sync. Admins still get an in-app notification when the sync fails.
        </p>
      )}
    </div>
  );
};
