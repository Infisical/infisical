import { useMemo } from "react";
import {
  components as selectComponents,
  MultiValueGenericProps,
  OptionProps,
  SingleValueProps
} from "react-select";
import { Bell, ChevronDown, Plus, Slack, Trash2 } from "lucide-react";

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

const SlackLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 122.8 122.8" className={className} aria-hidden="true">
    <path
      d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
      fill="#e01e5a"
    />
    <path
      d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
      fill="#36c5f0"
    />
    <path
      d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
      fill="#2eb67d"
    />
    <path
      d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
      fill="#ecb22e"
    />
  </svg>
);

const EVENT_OPTIONS: { value: PamNotificationEvent; label: string }[] = [
  { value: PamNotificationEvent.AccessRequested, label: "Access requested" },
  { value: PamNotificationEvent.AccessRequestApproved, label: "Request approved" },
  { value: PamNotificationEvent.AccessRequestDenied, label: "Request denied" }
];

type IntegrationOption = { value: string; label: string };
type ChannelOption = { id: string; name: string };
type EventOption = (typeof EVENT_OPTIONS)[number];

const WorkspaceOption = ({ children, ...props }: OptionProps<IntegrationOption>) => (
  <selectComponents.Option {...props}>
    <div className="flex items-center gap-2">
      <SlackLogo className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  </selectComponents.Option>
);

const WorkspaceSingleValue = ({ children, ...props }: SingleValueProps<IntegrationOption>) => (
  <selectComponents.SingleValue {...props}>
    <div className="flex items-center gap-2">
      <SlackLogo className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  </selectComponents.SingleValue>
);

const ChannelMultiValueLabel = ({ children, ...props }: MultiValueGenericProps<ChannelOption>) => (
  <selectComponents.MultiValueLabel {...props}>
    <div className="flex items-center gap-1.5">
      <SlackLogo className="size-3.5 shrink-0" />
      {children}
    </div>
  </selectComponents.MultiValueLabel>
);

const EventMultiValueLabel = ({ children, ...props }: MultiValueGenericProps<EventOption>) => (
  <selectComponents.MultiValueLabel {...props}>
    <div className="flex items-center gap-1.5">
      <Bell className="size-3.5 shrink-0 text-muted" />
      {children}
    </div>
  </selectComponents.MultiValueLabel>
);

type ConfigCardProps = {
  config: TPamNotificationConfig;
  integrationOptions: IntegrationOption[];
  integrationSlugById: Record<string, string>;
  onChange: (config: TPamNotificationConfig) => void;
  onRemove: () => void;
};

const NotificationConfigCard = ({
  config,
  integrationOptions,
  integrationSlugById,
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

  // Viewers without org Settings read can't list integrations, so fall back to the slug the
  // saved config was returned with to keep the selected workspace readable
  const workspaceOptions = useMemo<IntegrationOption[]>(() => {
    const { workflowIntegrationId } = config;
    if (
      !workflowIntegrationId ||
      integrationOptions.some((opt) => opt.value === workflowIntegrationId)
    ) {
      return integrationOptions;
    }
    const fallbackLabel = integrationSlugById[workflowIntegrationId];
    return fallbackLabel
      ? [...integrationOptions, { value: workflowIntegrationId, label: fallbackLabel }]
      : integrationOptions;
  }, [integrationOptions, config.workflowIntegrationId, integrationSlugById]);

  const selectedIntegration =
    workspaceOptions.find((opt) => opt.value === config.workflowIntegrationId) ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <FilterableSelect
            value={selectedIntegration}
            options={workspaceOptions}
            onChange={(opt) => {
              const next = opt as IntegrationOption | null;
              if (!next || next.value === config.workflowIntegrationId) return;
              // channels belong to the previous workspace, so a workspace change clears them
              onChange({ ...config, workflowIntegrationId: next.value, channels: [] });
            }}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            components={{ Option: WorkspaceOption, SingleValue: WorkspaceSingleValue }}
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
              components={{ MultiValueLabel: ChannelMultiValueLabel }}
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
              components={{ MultiValueLabel: EventMultiValueLabel }}
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
  integrationSlugById: Record<string, string>;
  onChange: (configs: TPamNotificationConfig[]) => void;
};

export const FolderNotificationsSection = ({ configs, integrationSlugById, onChange }: Props) => {
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
          Notify external channels about access request activity for accounts in this folder.
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="size-4" />
                Add
                <ChevronDown className="size-4 text-muted" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              <DropdownMenuItem onSelect={addConfig}>
                <Slack className="size-4" />
                Slack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {configs.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
            No chat notifications yet. Add Slack to post this folder&apos;s approval activity to a
            channel.
          </div>
        ) : (
          configs.map((config, idx) => (
            <NotificationConfigCard
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              config={config}
              integrationOptions={integrationOptions}
              integrationSlugById={integrationSlugById}
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
