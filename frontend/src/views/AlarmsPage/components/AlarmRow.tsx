import { Ellipsis, KeyRoundIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow
} from "@app/components/v3";
import {
  ALARM_EVENT_TYPE_LABELS,
  ALARM_RESOURCE_TYPE_LABELS,
  AlarmEventType,
  AlarmResourceType,
  TAlarm,
  TAlarmChannelSummary
} from "@app/hooks/api/alarms";

import { getChannelIcon, LucideIcon } from "./channelIcons";

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  [AlarmResourceType.IdentityCredential]: KeyRoundIcon
};

type Props = {
  alarm: TAlarm;
  onEdit: (alarm: TAlarm) => void;
  onDelete: (alarm: TAlarm) => void;
};

export const AlarmRow = ({ alarm, onEdit, onDelete }: Props) => {
  const ResourceIcon = RESOURCE_ICONS[alarm.resourceType] ?? KeyRoundIcon;
  const resourceLabel =
    ALARM_RESOURCE_TYPE_LABELS[alarm.resourceType as AlarmResourceType] ?? alarm.resourceType;
  const eventLabel = ALARM_EVENT_TYPE_LABELS[alarm.eventType as AlarmEventType] ?? alarm.eventType;
  const condition = alarm.condition?.alertBefore
    ? `Alert before ${alarm.condition.alertBefore}`
    : "On event";

  const renderChannel = (channel: TAlarmChannelSummary) => {
    const Icon = getChannelIcon(channel.channelType);
    return (
      <Badge
        key={channel.id}
        variant="neutral"
        isTruncatable
        className={`max-w-[10rem] ${channel.enabled ? "" : "opacity-40"}`}
      >
        <Icon className="size-3" />
        <span>{channel.name}</span>
      </Badge>
    );
  };

  return (
    <TableRow>
      <TableCell>
        <span className="text-foreground">{alarm.name}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ResourceIcon className="size-4 shrink-0 text-muted" />
          <span className="text-foreground">{resourceLabel}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="warning">{eventLabel}</Badge>
      </TableCell>
      <TableCell>{condition}</TableCell>
      <TableCell>
        {alarm.channels.length ? (
          <div className="flex flex-wrap items-center gap-1">
            {alarm.channels.map(renderChannel)}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={alarm.enabled ? "success" : "neutral"}>
          {alarm.enabled ? "Enabled" : "Disabled"}
        </Badge>
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
              <DropdownMenuItem onClick={() => onEdit(alarm)}>
                <PencilIcon />
                Edit Alarm
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={() => onDelete(alarm)}>
                <Trash2Icon />
                Delete Alarm
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
