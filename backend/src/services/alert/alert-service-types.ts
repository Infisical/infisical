import { TGenericPermission } from "@app/lib/types";

import { TAlertChannelEmbedded, TAlertChannelInput, TChannelRecipientInput } from "./alert-channel-service-types";
import { AlertChannelType } from "./alert-channel-types";
import { AlertRunStatus } from "./alert-types";

export type TCreateAlertDTO = TGenericPermission & {
  name: string;
  description?: string | null;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition?: unknown;
  enabled?: boolean;
  projectId?: string | null;
  channels: TAlertChannelInput[];
};

export type TUpdateAlertDTO = TGenericPermission & {
  alertId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
  enabled?: boolean;
  channels?: TAlertChannelInput[];
};

export type TGetAlertDTO = TGenericPermission & { alertId: string };

export type TDeleteAlertDTO = TGenericPermission & { alertId: string };

export type TListAlertsDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  enabled?: boolean;
};

// A test runs against a channel the caller is still authoring, so it carries the config inline rather
// than an alert id. `channelId` is optional and only names a saved channel to inherit secrets from.
export type TTestAlertChannelDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  alertId?: string;
  channelId?: string;
  channelType: AlertChannelType;
  config?: Record<string, unknown>;
  recipients?: TChannelRecipientInput[];
};

export type TTestAlertChannelResponse = {
  success: boolean;
  deliveredTo?: number;
  error?: string;
};

export type TTestAlertChannelResult = TTestAlertChannelResponse & {
  projectId: string | null;
  resourceName: string | null;
  alertName: string | null;
  channelName: string | null;
};

export type TAlertResponse = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  triggerType: string;
  condition: unknown;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  resourceName?: string | null;
  channels: TAlertChannelEmbedded[];
  lastRun?: TAlertLastRun | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TAlertLastRun = {
  timestamp: Date;
  status: AlertRunStatus;
};

// The alert a domain service keeps on one of its own resources, set in full each time. `channels` is either
// the alert's complete channel list, or the recipients of its channels of one type, which leaves every other
// channel (eg a Slack or webhook channel added through the alert API) as it is.
export type TPrepareAlertForResourceDTO = TGenericPermission & {
  resourceType: string;
  resourceId: string;
  projectId: string;
  eventType: string;
  name: string;
  channels:
    | { replaceAll: TAlertChannelInput[] }
    | { replaceRecipients: { channelType: AlertChannelType; recipients: TChannelRecipientInput[] } };
};
