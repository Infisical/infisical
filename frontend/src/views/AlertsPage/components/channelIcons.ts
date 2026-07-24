import { AlertTriangleIcon, BellIcon, HashIcon, LinkIcon, MailIcon } from "lucide-react";

import { AlertChannelType } from "@app/hooks/api/alerts";

export type LucideIcon = typeof MailIcon;

const CHANNEL_ICONS: Record<AlertChannelType, LucideIcon> = {
  [AlertChannelType.Email]: MailIcon,
  [AlertChannelType.Slack]: HashIcon,
  [AlertChannelType.Webhook]: LinkIcon,
  [AlertChannelType.PagerDuty]: AlertTriangleIcon
};

export const getChannelIcon = (channelType: AlertChannelType): LucideIcon =>
  CHANNEL_ICONS[channelType] ?? BellIcon;
