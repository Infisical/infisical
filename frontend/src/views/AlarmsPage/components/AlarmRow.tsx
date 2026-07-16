import {
  AlertTriangleIcon,
  BellIcon,
  Ellipsis,
  HashIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  PencilIcon,
  ShieldIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ALARM_CHANNEL_TYPE_LABELS,
  ALARM_EVENT_TYPE_LABELS,
  ALARM_RESOURCE_TYPE_LABELS,
  AlarmChannelType,
  AlarmEventType,
  AlarmPrincipalType,
  AlarmResourceType,
  TAlarm,
  TAlarmRecipient
} from "@app/hooks/api/alarms";

type LucideIcon = typeof MailIcon;

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  [AlarmResourceType.IdentityCredential]: KeyRoundIcon
};

const CHANNEL_ICONS: Record<AlarmChannelType, LucideIcon> = {
  [AlarmChannelType.Email]: MailIcon,
  [AlarmChannelType.Slack]: HashIcon,
  [AlarmChannelType.Webhook]: LinkIcon,
  [AlarmChannelType.PagerDuty]: AlertTriangleIcon
};

const RECIPIENT_ICONS: Record<AlarmPrincipalType, LucideIcon> = {
  [AlarmPrincipalType.Email]: MailIcon,
  [AlarmPrincipalType.User]: UserIcon,
  [AlarmPrincipalType.Group]: UsersIcon,
  [AlarmPrincipalType.Role]: ShieldIcon
};

type Props = {
  alarm: TAlarm;
  resolveRecipientLabel: (recipient: TAlarmRecipient) => string;
  onEdit: (alarm: TAlarm) => void;
  onDelete: (alarm: TAlarm) => void;
};

export const AlarmRow = ({ alarm, resolveRecipientLabel, onEdit, onDelete }: Props) => {
  const ResourceIcon = RESOURCE_ICONS[alarm.resourceType] ?? KeyRoundIcon;
  const resourceLabel =
    ALARM_RESOURCE_TYPE_LABELS[alarm.resourceType as AlarmResourceType] ?? alarm.resourceType;
  const eventLabel = ALARM_EVENT_TYPE_LABELS[alarm.eventType as AlarmEventType] ?? alarm.eventType;
  const condition = alarm.condition?.alertBefore
    ? `Alert before ${alarm.condition.alertBefore}`
    : "On event";

  const [firstRecipient, ...restRecipients] = alarm.recipients;

  const renderRecipient = (recipient: TAlarmRecipient) => {
    const Icon = RECIPIENT_ICONS[recipient.principalType];
    return (
      <Badge
        key={`${recipient.principalType}:${recipient.principalId}`}
        variant="neutral"
        isTruncatable
        className="max-w-[10rem]"
      >
        <Icon className="size-3" />
        <span>{resolveRecipientLabel(recipient)}</span>
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
          <div className="flex flex-col">
            <span className="text-foreground">{resourceLabel}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="warning">{eventLabel}</Badge>
      </TableCell>
      <TableCell>{condition}</TableCell>
      <TableCell>
        {firstRecipient ? (
          <div className="flex items-center gap-1">
            {renderRecipient(firstRecipient)}
            {restRecipients.length > 0 && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger className="flex h-4 items-center">
                    <PopoverTrigger asChild>
                      <Badge variant="neutral" asChild>
                        <button type="button" onClick={(e) => e.stopPropagation()}>
                          +{restRecipients.length}
                        </button>
                      </Badge>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Click to view all recipients</TooltipContent>
                </Tooltip>
                <PopoverContent
                  side="right"
                  className="flex w-auto max-w-sm flex-wrap gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {restRecipients.map((recipient) => renderRecipient(recipient))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-muted">
          {alarm.channels.length ? (
            alarm.channels.map((channel) => {
              const Icon = CHANNEL_ICONS[channel.channelType as AlarmChannelType] ?? BellIcon;
              return (
                <span
                  key={channel.id}
                  title={
                    ALARM_CHANNEL_TYPE_LABELS[channel.channelType as AlarmChannelType] ??
                    channel.channelType
                  }
                  className={channel.enabled ? "" : "opacity-40"}
                >
                  <Icon className="size-4" />
                </span>
              );
            })
          ) : (
            <span>—</span>
          )}
        </div>
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
