import type { FieldErrors } from "react-hook-form";
import { subject } from "@casl/ability";

import { serializeFailureAlertChannels } from "@app/components/secret-syncs/forms/schemas";
import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  AlertChannelType,
  AlertEventType,
  AlertPrincipalType,
  AlertResourceType,
  type TAlert,
  type TChannelForm
} from "@app/hooks/api/alerts/types";
import { toChannelForm, toChannelInput } from "@app/hooks/api/alerts/utils";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";

import type { useProjectPermission } from "../../../../access/permissions";
import { failed } from "../../../../access/toast";
import {
  buildNextChannel,
  describeChannel,
  type TDraftChannel,
  type TMemberEmails
} from "../../../../cert-manager/SettingsPage/alert-model";
import { useV4Adapter } from "../../../../data/adapters";

export const FAILURE_ALERT_FIELDS = ["isFailureAlertEnabled", "channels"];

export type TSavedFailureAlert = { id: string; enabled: boolean; channels: TChannelForm[] };

export const toSavedFailureAlert = (alerts?: TAlert[]): TSavedFailureAlert | undefined => {
  const alert = alerts?.find((entry) => entry.eventType === AlertEventType.SecretSyncFailed);
  return (
    alert && { id: alert.id, enabled: alert.enabled, channels: alert.channels.map(toChannelForm) }
  );
};

export const buildProjectAdminsChannel = (projectId: string): TChannelForm => ({
  ...buildNextChannel([], AlertChannelType.Email),
  recipients: [{ principalType: AlertPrincipalType.ProjectAdmins, principalId: projectId }]
});

export const failureAlertDefaults = (projectId: string, saved?: TSavedFailureAlert) => ({
  isFailureAlertEnabled: saved?.enabled ?? false,
  channels: saved?.channels ?? [buildProjectAdminsChannel(projectId)]
});

export const fromDraftChannel = ({
  uid: _uid,
  headers,
  ...channel
}: TDraftChannel): TChannelForm => ({
  ...channel,
  headers: headers.map(({ key, value }) => ({ key, value }))
});

// Mirrors the backend, where adding, changing or removing a sync's alert needs edit on the sync. A sync
// whose source folder was deleted has no environment or path, and the backend checks it without them too.
export const canManageFailureAlert = (
  permission: ReturnType<typeof useProjectPermission>["permission"],
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

export const failureAlertReviewItems = ({
  enabled,
  channels,
  canManage,
  members
}: {
  enabled: boolean;
  channels: TChannelForm[];
  canManage: boolean;
  members: TMemberEmails;
}): [string, string][] => {
  if (!canManage)
    return [
      [
        "Sync failure",
        "No alert. Adding one needs permission to edit secret syncs in this environment and path."
      ]
    ];
  if (!enabled) return [["Sync failure", "No alert"]];
  return channels.map((channel) => [
    channel.name,
    [
      describeChannel(channel, members) || "No recipients",
      channel.enabled ? "" : " (disabled)"
    ].join("")
  ]);
};

export const channelErrorsOf = (errors: FieldErrors | undefined) => {
  const flat: Record<string, string> = {};
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object") return;
    const { message } = node as { message?: unknown };
    if (typeof message === "string" && path.length) flat[path.join(".")] = message;
    Object.entries(node).forEach(([key, child]) => {
      if (key !== "ref" && key !== "message" && key !== "type") walk(child, [...path, key]);
    });
  };
  walk(errors?.channels, []);
  return flat;
};

export const useSaveFailureAlert = () => {
  const settings = useV4Adapter("certManagerSettings");
  const createAlert = settings.useCreateAlert();
  const updateAlert = settings.useUpdateAlert();
  return async ({
    syncId,
    projectId,
    saved,
    enabled,
    channels
  }: {
    syncId: string;
    projectId: string;
    saved?: TSavedFailureAlert;
    enabled: boolean;
    channels: TChannelForm[];
  }) => {
    if (saved) {
      if (enabled) {
        const unchanged =
          serializeFailureAlertChannels(channels) === serializeFailureAlertChannels(saved.channels);
        if (saved.enabled && unchanged) return;
        await updateAlert.mutateAsync({
          alertId: saved.id,
          enabled: true,
          channels: channels.map(toChannelInput)
        });
      } else if (saved.enabled) {
        await updateAlert.mutateAsync({ alertId: saved.id, enabled: false });
      }
      return;
    }
    if (!enabled) return;
    await createAlert.mutateAsync({
      name: "Sync failure alert",
      resourceType: AlertResourceType.SecretSync,
      resourceId: syncId,
      eventType: AlertEventType.SecretSyncFailed,
      projectId,
      enabled: true,
      condition: null,
      channels: channels.map(toChannelInput)
    });
  };
};

export const useAddSyncFailureAlert = () => {
  const save = useSaveFailureAlert();
  return (sync: TSecretSync, channels?: TChannelForm[]) =>
    channels &&
    save({ syncId: sync.id, projectId: sync.projectId, enabled: true, channels }).catch(
      (error: unknown) => failed("Sync created without its failure alert", error)
    );
};
