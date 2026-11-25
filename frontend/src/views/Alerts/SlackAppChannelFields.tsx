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
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { MAX_SLACK_APP_CHANNELS, TAlertSlackChannel, TChannelsForm } from "@app/hooks/api/alerts";
import {
  useGetSlackIntegrationChannels,
  useGetWorkflowIntegrations
} from "@app/hooks/api/workflowIntegrations/queries";
import {
  WorkflowIntegration,
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { getChannelErrors, useChannelPath } from "./channelPath";

type Props = {
  index: number;
};

const SlackChannelsWithoutAccess = ({ index }: Props) => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channelPath = useChannelPath(index);
  const savedChannels = useWatch({ control, name: `${channelPath}.slackChannels` }) ?? [];
  const channelErrors = getChannelErrors(errors, channelPath);

  return (
    <Field>
      <FieldLabel>Slack channels</FieldLabel>
      <FieldContent>
        {savedChannels.length > 0 && (
          <p className="text-sm text-foreground">
            {savedChannels.map((channel) => `#${channel.name}`).join(", ")}
          </p>
        )}
        <FieldDescription>
          Picking a Slack integration and channels needs permission to read organization settings.
          Ask an organization admin, or select Webhook URL instead.
        </FieldDescription>
        <FieldError
          errors={[
            channelErrors?.workflowIntegrationId,
            channelErrors?.slackChannels as { message?: string } | undefined
          ]}
        />
      </FieldContent>
    </Field>
  );
};

const SlackChannelPickers = ({ index }: Props) => {
  const { currentOrg } = useOrganization();
  const {
    control,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channelPath = useChannelPath(index);
  const channelErrors = getChannelErrors(errors, channelPath);
  const [isSavedIntegrationDeleted, setIsSavedIntegrationDeleted] = useState(false);

  const workflowIntegrationId = useWatch({
    control,
    name: `${channelPath}.workflowIntegrationId`
  });

  const integrationsQuery = useGetWorkflowIntegrations(currentOrg.id);
  const integrations = (integrationsQuery.data ?? []).filter(
    (integration) =>
      integration.integration === WorkflowIntegrationPlatform.SLACK &&
      integration.status === WorkflowIntegrationStatus.Installed
  );
  const channelsQuery = useGetSlackIntegrationChannels(workflowIntegrationId || undefined);
  const slackChannels = channelsQuery.data ?? [];

  // Only a list fetched after mount proves the saved integration was deleted; a cached one can predate it.
  const { isSuccess, isFetching, isFetchedAfterMount, refetch } = integrationsQuery;
  useEffect(() => {
    if (!isSuccess || !workflowIntegrationId) return;
    if (integrations.some((integration) => integration.id === workflowIntegrationId)) return;
    if (isFetching) return;
    if (!isFetchedAfterMount) {
      refetch();
      return;
    }
    setIsSavedIntegrationDeleted(true);
    setValue(`${channelPath}.workflowIntegrationId`, "", { shouldDirty: true });
  }, [
    isSuccess,
    isFetching,
    isFetchedAfterMount,
    refetch,
    integrations,
    workflowIntegrationId,
    index,
    setValue
  ]);

  const knownChannelIds = new Set(slackChannels.map((channel) => channel.id));
  const archivedChannelIds = new Set(
    slackChannels.filter((channel) => channel.isArchived).map((channel) => channel.id)
  );
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
        <FieldLabel htmlFor={`${channelPath}-slackIntegration`}>Slack integration</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`${channelPath}.workflowIntegrationId`}
            render={({ field }) => {
              const selected = integrations.find((integration) => integration.id === field.value);
              return (
                <Combobox
                  id={`${channelPath}-slackIntegration`}
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
                  getOptionLabel={(integration) => integration.slug}
                  onValueChange={(integration: WorkflowIntegration | null) => {
                    if ((integration?.id ?? "") === field.value) return;
                    setIsSavedIntegrationDeleted(false);
                    field.onChange(integration?.id ?? "");
                    setValue(`${channelPath}.slackChannels`, [], { shouldDirty: true });
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
        <FieldLabel htmlFor={`${channelPath}-slackChannels`}>Slack channels</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`${channelPath}.slackChannels`}
            render={({ field }) => {
              const value = field.value ?? [];
              const isAtLimit = value.length >= MAX_SLACK_APP_CHANNELS;
              return (
                <Combobox
                  multiple
                  id={`${channelPath}-slackChannels`}
                  placeholder={
                    workflowIntegrationId ? "Add Slack channels..." : "Select an integration first"
                  }
                  searchAriaLabel="Search Slack channels"
                  options={slackChannels.filter(
                    (channel) =>
                      !channel.isArchived || value.some((selected) => selected.id === channel.id)
                  )}
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
                  renderValue={(channel) => {
                    if (isMissingChannel(channel)) {
                      return (
                        <span className="text-warning">#{channel.name} (not found in Slack)</span>
                      );
                    }
                    if (archivedChannelIds.has(channel.id)) {
                      return <span className="text-warning">#{channel.name} (archived)</span>;
                    }
                    return `#${channel.name}`;
                  }}
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

export const SlackAppChannelFields = ({ index }: Props) => {
  const { permission } = useOrgPermission();
  if (!permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings)) {
    return <SlackChannelsWithoutAccess index={index} />;
  }
  return <SlackChannelPickers index={index} />;
};
