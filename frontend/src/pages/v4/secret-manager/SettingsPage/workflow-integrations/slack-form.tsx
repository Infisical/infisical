import { useState } from "react";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  type SlackIntegrationChannel,
  type WorkflowIntegration,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { NoOrgIntegration, type PlatformFormProps, sameDraft, SheetForm } from "./shared";

type Notification = { enabled: boolean; channels: string[] };

type SlackDraft = {
  integrationId: string;
  secretRequest: Notification;
  accessRequest: Notification;
  secretSyncError: Notification;
};

const NOTIFICATIONS = [
  {
    key: "secretRequest",
    title: "Secret approval requests",
    description: "Send a notification when a secret approval request is opened."
  },
  {
    key: "accessRequest",
    title: "Access requests",
    description: "Send a notification when an access request is opened."
  },
  {
    key: "secretSyncError",
    title: "Secret sync errors",
    description: "Send a notification when a secret sync fails."
  }
] as const;

const off: Notification = { enabled: false, channels: [] };

const SlackEditor = ({
  projectId,
  orgId,
  title,
  lead,
  onClose,
  initial,
  integrations
}: PlatformFormProps & { initial: SlackDraft; integrations: WorkflowIntegration[] }) => {
  const adapter = useV4Adapter("projectIntegrations");
  const updateConfig = adapter.useUpdateWorkflowIntegrationConfig();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const channels = adapter.useSlackChannels(draft.integrationId || undefined);
  const channelOptions = [...(channels.data ?? [])]
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map((channel) => ({ value: channel.id, label: channel.name }));
  const integrationError =
    submitted && !draft.integrationId ? "Select a Slack integration" : undefined;
  const hasIntegrations = integrations.length > 0;

  const submit = async () => {
    setSubmitted(true);
    if (!draft.integrationId) return;
    const joined = (notification: Notification) => notification.channels.filter(Boolean).join(", ");
    setPending(true);
    try {
      await updateConfig.mutateAsync({
        projectId,
        integration: WorkflowIntegrationPlatform.SLACK,
        integrationId: draft.integrationId,
        isSecretRequestNotificationEnabled: draft.secretRequest.enabled,
        secretRequestChannels: joined(draft.secretRequest),
        isAccessRequestNotificationEnabled: draft.accessRequest.enabled,
        accessRequestChannels: joined(draft.accessRequest),
        isSecretSyncErrorNotificationEnabled: draft.secretSyncError.enabled,
        secretSyncErrorChannels: joined(draft.secretSyncError)
      });
      saved("Slack integration saved");
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <SheetForm
      title={title}
      lead={lead}
      pending={pending}
      saveDisabled={sameDraft(draft, initial) || !hasIntegrations}
      onSubmit={submit}
    >
      {hasIntegrations ? (
        <Field wide label="Slack integration" error={integrationError}>
          <Select
            label="Slack integration"
            placeholder="Select an integration"
            value={draft.integrationId}
            invalid={Boolean(integrationError)}
            options={integrations.map((entry) => ({ value: entry.id, label: entry.slug }))}
            onChange={(integrationId) =>
              setDraft((current) => ({
                ...current,
                integrationId,
                secretRequest: { ...current.secretRequest, channels: [] },
                accessRequest: { ...current.accessRequest, channels: [] },
                secretSyncError: { ...current.secretSyncError, channels: [] }
              }))
            }
          />
        </Field>
      ) : (
        <NoOrgIntegration orgId={orgId} platform={WorkflowIntegrationPlatform.SLACK} />
      )}
      {Boolean(draft.integrationId) &&
        NOTIFICATIONS.map(({ key, title: label, description }) => (
          <Stack key={key} gap={12}>
            <Switch
              layout="row"
              label={label}
              description={description}
              checked={draft[key].enabled}
              onChange={(enabled) =>
                setDraft((current) => ({ ...current, [key]: { ...current[key], enabled } }))
              }
            />
            {draft[key].enabled && (
              <Field wide label="Slack channels">
                <MultiSelect
                  label="Slack channels"
                  placeholder={channels.isPending ? "Loading channels" : "Select channels"}
                  options={channelOptions}
                  value={draft[key].channels}
                  onChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: { ...current[key], channels: next }
                    }))
                  }
                />
              </Field>
            )}
          </Stack>
        ))}
    </SheetForm>
  );
};

const knownChannels = (value: string, channels: SlackIntegrationChannel[]) => {
  const known = new Set(channels.map((channel) => channel.id));
  return (value || "").split(", ").filter((id) => known.has(id));
};

export const SlackIntegrationForm = (props: PlatformFormProps) => {
  const { projectId, orgId, title, lead } = props;
  const adapter = useV4Adapter("projectIntegrations");
  const config = adapter.useWorkflowIntegrationConfig({
    projectId,
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const integrations = adapter.useWorkflowIntegrations(orgId);
  const existing =
    config.data?.integration === WorkflowIntegrationPlatform.SLACK ? config.data : undefined;
  const existingChannels = adapter.useSlackChannels(existing?.integrationId);
  if (config.isPending || integrations.isPending || (existing && existingChannels.isPending))
    return <SheetForm title={title} lead={lead} loading />;
  const channels = existingChannels.data ?? [];
  const initial: SlackDraft = existing
    ? {
        integrationId: existing.integrationId,
        secretRequest: {
          enabled: existing.isSecretRequestNotificationEnabled,
          channels: knownChannels(existing.secretRequestChannels, channels)
        },
        accessRequest: {
          enabled: existing.isAccessRequestNotificationEnabled,
          channels: knownChannels(existing.accessRequestChannels, channels)
        },
        secretSyncError: {
          enabled: existing.isSecretSyncErrorNotificationEnabled,
          channels: knownChannels(existing.secretSyncErrorChannels, channels)
        }
      }
    : { integrationId: "", secretRequest: off, accessRequest: off, secretSyncError: off };
  return (
    <SlackEditor
      {...props}
      initial={initial}
      integrations={(integrations.data ?? []).filter(
        (entry) => entry.integration === WorkflowIntegrationPlatform.SLACK
      )}
    />
  );
};
