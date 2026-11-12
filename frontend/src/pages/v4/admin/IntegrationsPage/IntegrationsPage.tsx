import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";

import type { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

import { failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const TEAMS_DOCS =
  "https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration";

const slackAppCreationUrl = () =>
  `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(
    JSON.stringify({
      display_information: {
        name: "Infisical",
        description: "Get real-time Infisical updates in Slack",
        // v4-check-ignore raw-color -- Slack app manifest value, not a UI color
        background_color: "#c2d62b",
        long_description: `This Slack application is designed specifically for use with your self-hosted Infisical instance, allowing seamless integration between your Infisical projects and your Slack workspace. With this integration, your team can stay up-to-date with the latest events, changes, and notifications directly inside Slack.
        - Notifications: Receive real-time updates and alerts about critical events in your Infisical projects. Whether it's a new project being created, updates to secrets, or changes to your team's configuration, you will be promptly notified within the designated Slack channels of your choice.
        - Customization: Tailor the notifications to your team's specific needs by configuring which types of events trigger alerts and in which channels they are sent.
        - Collaboration: Keep your entire team in the loop with notifications that help facilitate more efficient collaboration by ensuring that everyone is aware of important developments in your Infisical projects.

        By integrating Infisical with Slack, you can enhance your workflow by combining the power of secure secrets management with the communication capabilities of Slack.`
      },
      features: {
        app_home: {
          home_tab_enabled: false,
          messages_tab_enabled: false,
          messages_tab_read_only_enabled: true
        },
        bot_user: {
          display_name: "Infisical",
          always_online: true
        }
      },
      oauth_config: {
        redirect_urls: [`${window.origin}/api/v1/workflow-integrations/slack/oauth_redirect`],
        scopes: {
          bot: ["chat:write.public", "chat:write", "channels:read", "groups:read"]
        }
      },
      settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false
      }
    })
  )}`;

const changed = <T extends Record<string, string>>(draft: T, saved: T) =>
  Object.keys(draft).some((key) => draft[key] !== saved[key]);

const SlackSettings = ({ config }: { config: AdminIntegrationsConfig["slack"] }) => {
  const updateServerConfig = useV4Adapter("admin").useUpdateServerConfig();
  const [saved, setSaved] = useState(config);
  const [draft, setDraft] = useState(config);
  return (
    <SettingsCard
      title="Slack"
      description="Create the Infisical Slack app, then copy the values from its App Credentials page."
      action={
        <Button asChild variant="outline" size="xs" icon="external">
          <a href={slackAppCreationUrl()} target="_blank" rel="noopener noreferrer">
            Create Slack app
          </a>
        </Button>
      }
      dirty={changed(draft, saved)}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        await updateServerConfig
          .mutateAsync({
            slackClientId: draft.clientId,
            slackClientSecret: draft.clientSecret
          })
          .catch((error: unknown) => {
            failed("Slack settings not saved", error);
            throw error;
          });
        setSaved(draft);
        toast({ tone: "ok", title: "Slack settings saved" });
      }}
    >
      <Stack gap={16}>
        <Field label="Client ID">
          <Input
            mono
            autoComplete="off"
            value={draft.clientId}
            onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}
          />
        </Field>
        <Field label="Client secret">
          <SecretInput
            autoComplete="off"
            value={draft.clientSecret}
            onChange={(clientSecret) => setDraft({ ...draft, clientSecret })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

const MicrosoftTeamsSettings = ({
  config
}: {
  config: AdminIntegrationsConfig["microsoftTeams"];
}) => {
  const updateServerConfig = useV4Adapter("admin").useUpdateServerConfig();
  const [saved, setSaved] = useState(config);
  const [draft, setDraft] = useState(config);
  return (
    <SettingsCard
      title="Microsoft Teams"
      description="Create the Teams bot and its Azure resources, then copy the values from the bot's app registration. The client secret is the bot's password."
      action={
        <Button asChild variant="outline" size="xs" icon="external">
          <a href={TEAMS_DOCS} target="_blank" rel="noopener noreferrer">
            Documentation
          </a>
        </Button>
      }
      dirty={changed(draft, saved)}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        await updateServerConfig
          .mutateAsync({
            microsoftTeamsAppId: draft.appId,
            microsoftTeamsClientSecret: draft.clientSecret,
            microsoftTeamsBotId: draft.botId
          })
          .catch((error: unknown) => {
            failed("Microsoft Teams settings not saved", error);
            throw error;
          });
        setSaved(draft);
        toast({
          tone: "ok",
          title: "Microsoft Teams settings saved",
          description: "Changes can take up to 5 minutes to take effect."
        });
      }}
    >
      <Stack gap={16}>
        <Field label="Application (client) ID">
          <Input
            mono
            autoComplete="off"
            value={draft.appId}
            onChange={(event) => setDraft({ ...draft, appId: event.target.value })}
          />
        </Field>
        <Field
          label="Client secret"
          description="Under Certificates & secrets in the bot's app registration."
        >
          <SecretInput
            autoComplete="off"
            value={draft.clientSecret}
            onChange={(clientSecret) => setDraft({ ...draft, clientSecret })}
          />
        </Field>
        <Field
          label="Microsoft Teams app ID"
          description="In the app overview of the Microsoft Teams Developer Portal."
        >
          <Input
            mono
            autoComplete="off"
            value={draft.botId}
            onChange={(event) => setDraft({ ...draft, botId: event.target.value })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

export const IntegrationsPage = () => {
  const { data: config, error } = useV4Adapter("admin").useIntegrationsConfig();
  if (error) throw error;
  return (
    <Stack gap={24}>
      <PageHeader
        title="Integrations"
        description="Instance-wide credentials for workflow integrations."
      />
      {config ? (
        <>
          <SlackSettings config={config.slack} />
          <MicrosoftTeamsSettings config={config.microsoftTeams} />
        </>
      ) : (
        <>
          <SettingsCard title="Slack" loading />
          <SettingsCard title="Microsoft Teams" loading />
        </>
      )}
    </Stack>
  );
};
