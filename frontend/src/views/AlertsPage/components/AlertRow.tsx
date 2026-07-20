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
  ALERT_EVENT_TYPE_LABELS,
  ALERT_RESOURCE_TYPE_LABELS,
  AlertEventType,
  AlertResourceType,
  TAlert,
  TAlertChannelSummary
} from "@app/hooks/api/alerts";

import { getChannelIcon, LucideIcon } from "./channelIcons";

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  [AlertResourceType.IdentityCredential]: KeyRoundIcon
};

type Props = {
  alert: TAlert;
  onEdit: (alert: TAlert) => void;
  onDelete: (alert: TAlert) => void;
};

export const AlertRow = ({ alert, onEdit, onDelete }: Props) => {
  const ResourceIcon = RESOURCE_ICONS[alert.resourceType] ?? KeyRoundIcon;
  const resourceLabel =
    ALERT_RESOURCE_TYPE_LABELS[alert.resourceType as AlertResourceType] ?? alert.resourceType;
  const eventLabel = ALERT_EVENT_TYPE_LABELS[alert.eventType as AlertEventType] ?? alert.eventType;
  const condition = alert.condition?.alertBefore
    ? `Alert before ${alert.condition.alertBefore}`
    : "On event";

  const renderChannel = (channel: TAlertChannelSummary) => {
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
        <span className="text-foreground">{alert.name}</span>
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
        {alert.channels.length ? (
          <div className="flex flex-wrap items-center gap-1">
            {alert.channels.map(renderChannel)}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
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
              <DropdownMenuItem onClick={() => onEdit(alert)}>
                <PencilIcon />
                Edit Alert
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={() => onDelete(alert)}>
                <Trash2Icon />
                Delete Alert
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
