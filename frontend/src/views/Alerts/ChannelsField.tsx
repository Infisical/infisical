import { useFieldArray, useFormContext } from "react-hook-form";
import { ChevronDownIcon, PlusIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label
} from "@app/components/v3";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  TAlertForm,
  TChannelForm
} from "@app/hooks/api/alerts";

import { ChannelCard } from "./ChannelCard";
import { getChannelIcon } from "./channelIcons";

type Props = {
  projectId?: string;
  resourceType: string;
  resourceId?: string | null;
};

const buildNewChannel = (channelType: AlertChannelType, name: string): TChannelForm => ({
  channelType,
  name,
  enabled: true,
  recipients: [] as { principalType: AlertPrincipalType; principalId: string }[],
  webhookUrl: "",
  url: "",
  signingSecret: "",
  integrationKey: ""
});

export const ChannelsField = ({ projectId, resourceType, resourceId }: Props) => {
  const {
    control,
    getValues,
    formState: { errors }
  } = useFormContext<TAlertForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "channels" });
  const rootError = errors.channels?.message || errors.channels?.root?.message;

  // The name input was dropped from the design; new channels are named after their type,
  // suffixed to stay unique so multiples remain distinguishable (e.g. in Terraform).
  const appendChannel = (channelType: AlertChannelType) => {
    const takenNames = new Set((getValues("channels") ?? []).map((channel) => channel.name));
    const baseName = ALERT_CHANNEL_TYPE_LABELS[channelType];
    let name = baseName;
    for (let suffix = 2; takenNames.has(name); suffix += 1) {
      name = `${baseName} ${suffix}`;
    }
    append(buildNewChannel(channelType, name));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label>
            Channels <span className="text-danger">*</span>
          </Label>
          <span className="text-xs text-muted">Add at least one delivery channel.</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <PlusIcon className="size-4" />
              Add channel
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="w-[var(--radix-dropdown-menu-trigger-width)]"
          >
            {Object.values(AlertChannelType).map((type) => {
              const Icon = getChannelIcon(type);
              return (
                <DropdownMenuItem key={type} onClick={() => appendChannel(type)}>
                  <Icon className="size-4" />
                  {ALERT_CHANNEL_TYPE_LABELS[type]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rootError && <p className="text-xs text-danger">{rootError}</p>}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          No channels yet. Add at least one channel to receive notifications.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <ChannelCard
              key={field.id}
              index={index}
              projectId={projectId}
              resourceType={resourceType}
              resourceId={resourceId}
              canRemove={fields.length > 1}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
