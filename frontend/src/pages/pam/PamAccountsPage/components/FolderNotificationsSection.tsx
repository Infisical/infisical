import { useMemo } from "react";
import { Plus, Slack, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterableSelect,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetSlackIntegrationChannels, useGetWorkflowIntegrations } from "@app/hooks/api";
import { PamNotificationEvent } from "@app/hooks/api/pam";
import { TPamNotificationConfig } from "@app/hooks/api/pam/types";
import {
  WorkflowIntegration,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

const EVENT_OPTIONS: { value: PamNotificationEvent; label: string }[] = [
  { value: PamNotificationEvent.AccessRequested, label: "Access requested" },
  { value: PamNotificationEvent.AccessRequestApproved, label: "Request approved" },
  { value: PamNotificationEvent.AccessRequestDenied, label: "Request denied" }
];

type IntegrationOption = { value: string; label: string };
type ChannelOption = { id: string; name: string };
type EventOption = (typeof EVENT_OPTIONS)[number];

type ConfigCardProps = {
  config: TPamNotificationConfig;
  integrationOptions: IntegrationOption[];
  onChange: (config: TPamNotificationConfig) => void;
  onRemove: () => void;
};

const NotificationConfigCard = ({
  config,
  integrationOptions,
  onChange,
  onRemove
}: ConfigCardProps) => {
  const { data: slackChannels, isError: isChannelListError } = useGetSlackIntegrationChannels(
    config.workflowIntegrationId || undefined
  );

  const channelOptions = useMemo<ChannelOption[]>(
    () =>
      (slackChannels ?? [])
        .slice()
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [slackChannels]
  );

  const selectedIntegration =
    integrationOptions.find((opt) => opt.value === config.workflowIntegrationId) ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <FilterableSelect
            value={selectedIntegration}
            options={integrationOptions}
            onChange={(opt) => {
              const next = opt as IntegrationOption | null;
              if (!next || next.value === config.workflowIntegrationId) return;
              // channels belong to the previous workspace, so a workspace change clears them
              onChange({ ...config, workflowIntegrationId: next.value, channels: [] });
            }}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            placeholder="Select a Slack workspace..."
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              aria-label="Remove notification config"
              className="text-muted hover:text-danger"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>

      {config.workflowIntegrationId && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Slack channels</span>
            <FilterableSelect
              isMulti
              value={config.channels}
              options={channelOptions}
              onChange={(selected) => {
                const channels = (selected as ChannelOption[] | null) ?? [];
                onChange({ ...config, channels: channels.map(({ id, name }) => ({ id, name })) });
              }}
              getOptionValue={(opt) => opt.id}
              getOptionLabel={(opt) => `#${opt.name}`}
              placeholder="Add Slack channel..."
              noOptionsMessage={() =>
                "No channels found. Invite the Infisical Slack app to private channels to list them here."
              }
            />
            {isChannelListError && (
              <p className="text-xs text-muted">
                Saved channels are shown, but listing Slack channels requires permission to read
                organization settings.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Notify on</span>
            <FilterableSelect
              isMulti
              value={EVENT_OPTIONS.filter((opt) => config.events.includes(opt.value))}
              options={EVENT_OPTIONS}
              onChange={(selected) => {
                const events = ((selected as EventOption[] | null) ?? []).map((opt) => opt.value);
                onChange({ ...config, events });
              }}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              placeholder="Add event..."
            />
          </div>
        </>
      )}
    </div>
  );
};

type Props = {
  configs: TPamNotificationConfig[];
  onChange: (configs: TPamNotificationConfig[]) => void;
};

export const FolderNotificationsSection = ({ configs, onChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: workflowIntegrations } = useGetWorkflowIntegrations(currentOrg.id);

  const integrationOptions = useMemo<IntegrationOption[]>(
    () =>
      (workflowIntegrations ?? [])
        .filter(
          (integration: WorkflowIntegration) =>
            integration.integration === WorkflowIntegrationPlatform.SLACK
        )
        .map((integration) => ({ value: integration.id, label: integration.slug })),
    [workflowIntegrations]
  );

  const addConfig = () => {
    onChange([...configs, { workflowIntegrationId: "", channels: [], events: [] }]);
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          Notifications
          <Badge variant="pam">{configs.length}</Badge>
        </CardTitle>
        <CardDescription>
          Approvers always get in-app and email notifications. Add Slack to also post to a channel.
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              <DropdownMenuItem onSelect={addConfig}>
                <Slack className="size-4" />
                Slack
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Microsoft Teams (coming soon)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {configs.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
            No chat notifications configured.
          </div>
        ) : (
          configs.map((config, idx) => (
            <NotificationConfigCard
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              config={config}
              integrationOptions={integrationOptions}
              onChange={(next) => onChange(configs.map((c, i) => (i === idx ? next : c)))}
              onRemove={() => onChange(configs.filter((_, i) => i !== idx))}
            />
          ))
        )}
        {integrationOptions.length === 0 && (
          <p className="text-xs text-muted">
            No Slack workflow integrations are connected to this organization yet. Add one under
            Organization Settings, Workflow Integrations.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
