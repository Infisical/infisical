import { Controller, useFormContext } from "react-hook-form";
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FieldLabel,
  IconButton,
  Skeleton
} from "@app/components/v3";
import { TAlertChannel, useListAlertChannels } from "@app/hooks/api/alertChannels";
import { TAlertForm } from "@app/hooks/api/alerts";

import { getChannelIcon } from "./channelIcons";

type Props = {
  projectId?: string;
};

export const AttachChannelsField = ({ projectId }: Props) => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TAlertForm>();
  const { isPending, data: channels = [] } = useListAlertChannels(projectId ? { projectId } : {});

  const byId = new Map(channels.map((c) => [c.id, c]));
  const rootError = errors.channelIds?.message || errors.channelIds?.root?.message;

  return (
    <Controller
      control={control}
      name="channelIds"
      render={({ field }) => {
        const selectedIds: string[] = field.value ?? [];
        const available = channels.filter((c) => !selectedIds.includes(c.id));

        const renderCard = (channel: TAlertChannel) => {
          const Icon = getChannelIcon(channel.channelType);
          return (
            <div
              key={channel.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <Icon className="size-4 text-muted" />
                <span className="text-sm text-foreground">{channel.name}</span>
              </div>
              <IconButton
                aria-label="Detach channel"
                variant="ghost"
                size="xs"
                onClick={() => field.onChange(selectedIds.filter((id) => id !== channel.id))}
              >
                <XIcon className="size-4" />
              </IconButton>
            </div>
          );
        };

        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <FieldLabel>
                  Channels <span className="text-red">*</span>
                </FieldLabel>
                <span className="text-xs text-muted">
                  Pick from your channels, at least one is required.
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={available.length === 0}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isDisabled={available.length === 0}
                  >
                    <PlusIcon className="size-4" />
                    Attach channel
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={4}
                  className="max-h-64 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                >
                  {available.map((channel) => {
                    const Icon = getChannelIcon(channel.channelType);
                    return (
                      <DropdownMenuItem
                        key={channel.id}
                        onClick={() => field.onChange([...selectedIds, channel.id])}
                      >
                        <Icon className="size-4" />
                        {channel.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {rootError && <p className="text-xs text-red-500">{rootError}</p>}

            {isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex flex-col gap-2">
                {selectedIds.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
                    No channels attached yet. Attach at least one channel to receive notifications.
                  </div>
                ) : (
                  selectedIds
                    .map((id) => byId.get(id))
                    .filter((c): c is TAlertChannel => Boolean(c))
                    .map(renderCard)
                )}
              </div>
            )}
          </div>
        );
      }}
    />
  );
};
