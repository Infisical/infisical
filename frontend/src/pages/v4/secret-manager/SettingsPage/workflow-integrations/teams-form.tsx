import { useState } from "react";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  type MicrosoftTeamsIntegration,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { NoOrgIntegration, type PlatformFormProps, sameDraft, SheetForm } from "./shared";

type Notification = { enabled: boolean; teamId: string; channelIds: string[] };

type TeamsDraft = {
  integrationId: string;
  secretRequest: Notification;
  accessRequest: Notification;
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
  }
] as const;

const off: Notification = { enabled: false, teamId: "", channelIds: [] };

const TeamsEditor = ({
  projectId,
  orgId,
  title,
  lead,
  onClose,
  initial,
  integrations
}: PlatformFormProps & { initial: TeamsDraft; integrations: MicrosoftTeamsIntegration[] }) => {
  const adapter = useV4Adapter("projectIntegrations");
  const updateConfig = adapter.useUpdateWorkflowIntegrationConfig();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const teams = adapter.useMicrosoftTeamsTeams(draft.integrationId || undefined);
  const sortedTeams = [...(teams.data ?? [])].sort((a, b) =>
    a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase())
  );
  const hasIntegrations = integrations.length > 0;

  const errorsOf = (notification: Notification) =>
    submitted && notification.enabled
      ? {
          team: notification.teamId ? undefined : "Select a team",
          channels: notification.channelIds.length ? undefined : "Select at least one channel"
        }
      : {};
  const integrationError =
    submitted && !draft.integrationId ? "Select a Microsoft Teams integration" : undefined;

  const set = (key: (typeof NOTIFICATIONS)[number]["key"], patch: Partial<Notification>) =>
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const submit = async () => {
    setSubmitted(true);
    const invalid = NOTIFICATIONS.some(
      ({ key }) => draft[key].enabled && (!draft[key].teamId || draft[key].channelIds.length === 0)
    );
    if (!draft.integrationId || invalid) return;
    const channelsOf = (notification: Notification) => ({
      teamId: notification.teamId,
      channelIds: notification.channelIds
    });
    setPending(true);
    try {
      await updateConfig.mutateAsync({
        projectId,
        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
        integrationId: draft.integrationId,
        isAccessRequestNotificationEnabled: draft.accessRequest.enabled,
        isSecretRequestNotificationEnabled: draft.secretRequest.enabled,
        ...(draft.accessRequest.enabled && {
          accessRequestChannels: channelsOf(draft.accessRequest)
        }),
        ...(draft.secretRequest.enabled && {
          secretRequestChannels: channelsOf(draft.secretRequest)
        })
      });
      saved("Microsoft Teams integration saved");
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
        <Field wide label="Microsoft Teams integration" error={integrationError}>
          <Select
            label="Microsoft Teams integration"
            placeholder="Select an integration"
            value={draft.integrationId}
            invalid={Boolean(integrationError)}
            options={integrations.map((entry) => ({ value: entry.id, label: entry.slug }))}
            onChange={(integrationId) =>
              setDraft({ integrationId, secretRequest: off, accessRequest: off })
            }
          />
        </Field>
      ) : (
        <NoOrgIntegration orgId={orgId} platform={WorkflowIntegrationPlatform.MICROSOFT_TEAMS} />
      )}
      {Boolean(draft.integrationId) &&
        NOTIFICATIONS.map(({ key, title: label, description }) => {
          const notification = draft[key];
          const errors = errorsOf(notification);
          const channelOptions = (
            sortedTeams.find((team) => team.teamId === notification.teamId)?.channels ?? []
          ).map((channel) => ({ value: channel.channelId, label: channel.channelName }));
          return (
            <Stack key={key} gap={12}>
              <Switch
                layout="row"
                label={label}
                description={description}
                checked={notification.enabled}
                onChange={(enabled) => set(key, { enabled })}
              />
              {notification.enabled && (
                <>
                  <Field wide label="Team" error={errors.team}>
                    <Select
                      label="Team"
                      placeholder={teams.isPending ? "Loading teams" : "Select a team"}
                      value={notification.teamId}
                      invalid={Boolean(errors.team)}
                      options={sortedTeams.map((team) => ({
                        value: team.teamId,
                        label: team.teamName
                      }))}
                      onChange={(teamId) => set(key, { teamId, channelIds: [] })}
                    />
                  </Field>
                  <Field wide label="Channels" error={errors.channels}>
                    <MultiSelect
                      label="Channels"
                      placeholder={notification.teamId ? "Select channels" : "Select a team first"}
                      disabled={!notification.teamId}
                      invalid={Boolean(errors.channels)}
                      options={channelOptions}
                      value={notification.channelIds}
                      onChange={(channelIds) => set(key, { channelIds })}
                    />
                  </Field>
                </>
              )}
            </Stack>
          );
        })}
    </SheetForm>
  );
};

export const MicrosoftTeamsIntegrationForm = (props: PlatformFormProps) => {
  const { projectId, orgId, title, lead } = props;
  const adapter = useV4Adapter("projectIntegrations");
  const config = adapter.useWorkflowIntegrationConfig({
    projectId,
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });
  const integrations = adapter.useMicrosoftTeamsIntegrations(orgId);
  if (config.isPending || integrations.isPending)
    return <SheetForm title={title} lead={lead} loading />;
  const existing =
    config.data?.integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS
      ? config.data
      : undefined;
  const channelsOf = (
    enabled: boolean,
    channels?: { teamId: string; channelIds: string[] }
  ): Notification => ({
    enabled,
    teamId: channels?.teamId ?? "",
    channelIds: channels?.channelIds ?? []
  });
  const initial: TeamsDraft = existing
    ? {
        integrationId: existing.integrationId,
        secretRequest: channelsOf(
          existing.isSecretRequestNotificationEnabled,
          existing.secretRequestChannels
        ),
        accessRequest: channelsOf(
          existing.isAccessRequestNotificationEnabled,
          existing.accessRequestChannels
        )
      }
    : { integrationId: "", secretRequest: off, accessRequest: off };
  return <TeamsEditor {...props} initial={initial} integrations={integrations.data ?? []} />;
};
