import type { FieldErrors } from "react-hook-form";
import { subject } from "@casl/ability";
import { z } from "zod";

import { serializeFailureAlertChannels } from "@app/components/secret-syncs/forms/schemas";
import {
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  AlertChannelType,
  channelFormSchema,
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

export type FailureAlertTarget = {
  resourceType: AlertResourceType;
  eventType: AlertEventType;
  noun: string;
  reviewLabel: string;
  alertName: string;
  description: string;
  subject: ProjectPermissionSub;
  editAction: string;
  scopeRequired: boolean;
};

export const SYNC_FAILURE_ALERT: FailureAlertTarget = {
  resourceType: AlertResourceType.SecretSync,
  eventType: AlertEventType.SecretSyncFailed,
  noun: "sync",
  reviewLabel: "Sync failure",
  alertName: "Sync failure alert",
  description: "Sends a notice when a sync, import or remove fails after all of its retries.",
  subject: ProjectPermissionSub.SecretSyncs,
  editAction: ProjectPermissionSecretSyncActions.Edit,
  scopeRequired: false
};

export const ROTATION_FAILURE_ALERT: FailureAlertTarget = {
  resourceType: AlertResourceType.SecretRotation,
  eventType: AlertEventType.SecretRotationFailed,
  noun: "rotation",
  reviewLabel: "Rotation failure",
  alertName: "Rotation failure alert",
  description: "Sends a notice when a scheduled rotation fails after all of its retries.",
  subject: ProjectPermissionSub.SecretRotation,
  editAction: ProjectPermissionSecretRotationActions.Edit,
  scopeRequired: true
};

export type TSavedFailureAlert = { id: string; enabled: boolean; channels: TChannelForm[] };

export const toSavedFailureAlert = (
  alerts?: TAlert[],
  target: FailureAlertTarget = SYNC_FAILURE_ALERT
): TSavedFailureAlert | undefined => {
  const alert = alerts?.find((entry) => entry.eventType === target.eventType);
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

// Mirrors the backend, where adding, changing or removing an alert needs edit on its sync or rotation. A
// sync whose source folder was deleted has no environment or path, and the backend checks it without them
// too; a rotation always has both.
export const canManageFailureAlert = (
  permission: ReturnType<typeof useProjectPermission>["permission"],
  {
    environment,
    secretPath,
    connectionId
  }: { environment?: string; secretPath?: string; connectionId?: string },
  target: FailureAlertTarget = SYNC_FAILURE_ALERT
) => {
  if (target.scopeRequired && (!environment || !secretPath)) return false;
  return permission.can(
    target.editAction as never,
    subject(target.subject, {
      ...(environment && { environment }),
      ...(secretPath && { secretPath }),
      ...(connectionId && { connectionId })
    }) as never
  );
};

// Channels are checked only while the alert is on, and a saved alert left untouched isn't checked at all,
// because recipient cleanup can leave it with an empty, disabled channel.
export const failureAlertSchema = (saved?: Pick<TSavedFailureAlert, "enabled" | "channels">) =>
  z
    .object({ isFailureAlertEnabled: z.boolean(), channels: z.custom<TChannelForm[]>() })
    .superRefine(({ isFailureAlertEnabled, channels }, ctx) => {
      if (!isFailureAlertEnabled) return;
      if (
        saved?.enabled &&
        serializeFailureAlertChannels(saved.channels) === serializeFailureAlertChannels(channels)
      )
        return;
      const result = z
        .array(channelFormSchema)
        .min(1, "At least one channel is required")
        .safeParse(channels);
      if (result.success) return;
      result.error.issues.forEach((issue) =>
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["channels", ...issue.path]
        })
      );
    });

export const failureAlertReviewItems = ({
  enabled,
  channels,
  canManage,
  members,
  target = SYNC_FAILURE_ALERT
}: {
  enabled: boolean;
  channels: TChannelForm[];
  canManage: boolean;
  members: TMemberEmails;
  target?: FailureAlertTarget;
}): [string, string][] => {
  if (!canManage)
    return [
      [
        target.reviewLabel,
        `No alert. Adding one needs permission to edit secret ${target.noun}s in this environment and path.`
      ]
    ];
  if (!enabled) return [[target.reviewLabel, "No alert"]];
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
    resourceId,
    projectId,
    saved,
    enabled,
    channels,
    target = SYNC_FAILURE_ALERT
  }: {
    resourceId: string;
    projectId: string;
    saved?: TSavedFailureAlert;
    enabled: boolean;
    channels: TChannelForm[];
    target?: FailureAlertTarget;
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
      name: target.alertName,
      resourceType: target.resourceType,
      resourceId,
      eventType: target.eventType,
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
    save({ resourceId: sync.id, projectId: sync.projectId, enabled: true, channels }).catch(
      (error: unknown) => failed("Sync created without its failure alert", error)
    );
};

export const useAddRotationFailureAlert = () => {
  const save = useSaveFailureAlert();
  return (rotation: { id: string; projectId: string }, channels?: TChannelForm[]) =>
    channels &&
    save({
      resourceId: rotation.id,
      projectId: rotation.projectId,
      enabled: true,
      channels,
      target: ROTATION_FAILURE_ALERT
    }).catch((error: unknown) => failed("Rotation created without its failure alert", error));
};
