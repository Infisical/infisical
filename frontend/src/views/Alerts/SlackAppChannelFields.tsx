import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Link } from "@tanstack/react-router";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  MAX_SLACK_APP_CHANNELS,
  TAlertSlackChannel,
  TAlertSlackIntegration,
  TAlertSlackScope,
  TChannelsForm,
  useListAlertSlackChannels,
  useListAlertSlackIntegrations
} from "@app/hooks/api/alerts";

type Props = {
  index: number;
  scope: TAlertSlackScope;
};

const integrationLabel = (integration: TAlertSlackIntegration) =>
  `${integration.slug} (${integration.teamName})`;

export const SlackAppChannelFields = ({ index, scope }: Props) => {
  const { currentOrg } = useOrganization();
  const {
    control,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channelErrors = errors.channels?.[index];
  const [isSavedIntegrationDeleted, setIsSavedIntegrationDeleted] = useState(false);

  const workflowIntegrationId = useWatch({
    control,
    name: `channels.${index}.workflowIntegrationId`
  });

  const integrationsQuery = useListAlertSlackIntegrations(scope);
  const integrations = integrationsQuery.data ?? [];
  const channelsQuery = useListAlertSlackChannels(workflowIntegrationId || undefined, scope);
  const slackChannels = channelsQuery.data ?? [];

  // Clear an id whose integration was deleted, so the form asks for a new one instead of saving it.
  useEffect(() => {
    if (!integrationsQuery.isSuccess || !workflowIntegrationId) return;
    if (integrations.some((integration) => integration.id === workflowIntegrationId)) return;
    setIsSavedIntegrationDeleted(true);
    setValue(`channels.${index}.workflowIntegrationId`, "", { shouldDirty: true });
  }, [integrationsQuery.isSuccess, integrations, workflowIntegrationId, index, setValue]);

  const knownChannelIds = new Set(slackChannels.map((channel) => channel.id));
  const isMissingChannel = (channel: TAlertSlackChannel) =>
    channelsQuery.isSuccess && !knownChannelIds.has(channel.id);

  const integrationsLink = (
    <Link
      to="/organizations/$orgId/integrations"
      params={{ orgId: currentOrg.id }}
      search={{ selectedTab: "workflow-integrations" }}
      target="_blank"
      className="underline underline-offset-2"
    >
      Workflow Integrations
    </Link>
  );

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`channel-${index}-slackIntegration`}>Slack integration</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`channels.${index}.workflowIntegrationId`}
            render={({ field }) => {
              const selected = integrations.find((integration) => integration.id === field.value);
              return (
                <Combobox
                  id={`channel-${index}-slackIntegration`}
                  placeholder="Select a Slack integration..."
                  searchAriaLabel="Search Slack integrations"
                  options={integrations}
                  value={selected ?? null}
                  isLoading={integrationsQuery.isPending}
                  isError={
                    Boolean(channelErrors?.workflowIntegrationId) || integrationsQuery.isError
                  }
                  onPopupOpenChange={(open) => {
                    if (open) integrationsQuery.refetch();
                  }}
                  emptyMessage={
                    integrationsQuery.isError ? (
                      "Could not load Slack integrations. Close this list and open it again to retry."
                    ) : (
                      <span>
                        No Slack integrations found. Connect one under {integrationsLink} first.
                      </span>
                    )
                  }
                  getOptionValue={(integration) => integration.id}
                  getOptionLabel={integrationLabel}
                  onValueChange={(integration: TAlertSlackIntegration | null) => {
                    if ((integration?.id ?? "") === field.value) return;
                    setIsSavedIntegrationDeleted(false);
                    field.onChange(integration?.id ?? "");
                    setValue(`channels.${index}.slackChannels`, [], { shouldDirty: true });
                  }}
                />
              );
            }}
          />
          {isSavedIntegrationDeleted && !workflowIntegrationId ? (
            <FieldError
              errors={[
                {
                  message:
                    "The Slack integration this channel posted through was deleted. Select another one."
                }
              ]}
            />
          ) : (
            <FieldError errors={[channelErrors?.workflowIntegrationId]} />
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor={`channel-${index}-slackChannels`}>Slack channels</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`channels.${index}.slackChannels`}
            render={({ field }) => {
              const value = field.value ?? [];
              const isAtLimit = value.length >= MAX_SLACK_APP_CHANNELS;
              return (
                <Combobox
                  multiple
                  id={`channel-${index}-slackChannels`}
                  placeholder={
                    workflowIntegrationId ? "Add Slack channels..." : "Select an integration first"
                  }
                  searchAriaLabel="Search Slack channels"
                  options={slackChannels}
                  value={value}
                  isDisabled={!workflowIntegrationId}
                  isLoading={Boolean(workflowIntegrationId) && channelsQuery.isPending}
                  isError={Boolean(channelErrors?.slackChannels) || channelsQuery.isError}
                  onPopupOpenChange={(open) => {
                    if (open && workflowIntegrationId) channelsQuery.refetch();
                  }}
                  isOptionDisabled={(channel) =>
                    isAtLimit && !value.some((selected) => selected.id === channel.id)
                  }
                  emptyMessage={
                    channelsQuery.isError
                      ? "Could not load channels from Slack. If this keeps happening, reconnect the integration under Workflow Integrations."
                      : "No channels found. Private channels appear once the Infisical app is added to them."
                  }
                  getOptionValue={(channel) => channel.id}
                  getOptionLabel={(channel) => `#${channel.name}`}
                  renderValue={(channel) =>
                    isMissingChannel(channel) ? (
                      <span className="text-warning">#{channel.name} (not found in Slack)</span>
                    ) : (
                      `#${channel.name}`
                    )
                  }
                  onValueChange={(next: TAlertSlackChannel[]) =>
                    field.onChange(next.map(({ id, name }) => ({ id, name })))
                  }
                />
              );
            }}
          />
          <FieldDescription>
            Up to {MAX_SLACK_APP_CHANNELS} channels. To post to a private channel, add the Infisical
            app to it in Slack first.
          </FieldDescription>
          <FieldError errors={[channelErrors?.slackChannels as { message?: string } | undefined]} />
        </FieldContent>
      </Field>
    </>
  );
};
