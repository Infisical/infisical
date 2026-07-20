import { Ellipsis, PencilIcon, Trash2Icon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import { TAlertChannel } from "@app/hooks/api/alertChannels";
import { ALERT_CHANNEL_TYPE_LABELS } from "@app/hooks/api/alerts";

import { getChannelIcon } from "../channelIcons";

type Props = {
  channel: TAlertChannel;
  onEdit: (channel: TAlertChannel) => void;
  onDelete: (channel: TAlertChannel) => void;
};

export const ChannelRow = ({ channel, onEdit, onDelete }: Props) => {
  const Icon = getChannelIcon(channel.channelType);
  const typeLabel = ALERT_CHANNEL_TYPE_LABELS[channel.channelType] ?? channel.channelType;

  return (
    <TableRow>
      <TableCell>
        <span className={channel.enabled ? "text-foreground" : "text-muted"}>{channel.name}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-muted">
          <Icon className="size-4 shrink-0" />
          <span className="text-foreground">{typeLabel}</span>
        </div>
      </TableCell>
      <TableCell>
        {channel.usageCount ? (
          <span className="text-warning">
            {channel.usageCount} alert{channel.usageCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-muted">Unused</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Options" variant="ghost" size="xs">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem onClick={() => onEdit(channel)}>
                <PencilIcon />
                Edit Channel
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={() => onDelete(channel)}>
                <Trash2Icon />
                Delete Channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
