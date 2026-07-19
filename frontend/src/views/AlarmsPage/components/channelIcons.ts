import { AlertTriangleIcon, BellIcon, HashIcon, LinkIcon, MailIcon } from "lucide-react";

import { AlarmChannelType } from "@app/hooks/api/alarms";

export type LucideIcon = typeof MailIcon;

const CHANNEL_ICONS: Record<AlarmChannelType, LucideIcon> = {
  [AlarmChannelType.Email]: MailIcon,
  [AlarmChannelType.Slack]: HashIcon,
  [AlarmChannelType.Webhook]: LinkIcon,
  [AlarmChannelType.PagerDuty]: AlertTriangleIcon
};

export const getChannelIcon = (channelType: AlarmChannelType): LucideIcon =>
  CHANNEL_ICONS[channelType] ?? BellIcon;
