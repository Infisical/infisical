import { TAlerts, TAlertsInsert } from "@app/db/schemas";
import { TGenericPermission } from "@app/lib/types";

import {
  TAlertChannelEmbedded,
  TAlertChannelInput,
  TChannelRecipientInput,
  TPreparedChannelCreate,
  TPreparedChannelUpdate
} from "./alert-channel-service-types";
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

// An alert write that has passed every check, with channel configs already encrypted. Built by
// prepareCreateAlert or prepareUpdateAlert and written by applyAlertWrite, which a caller can run inside
// its own transaction so the alert lands, or does not, together with the caller's rows.
export type TAlertWritePlan =
  | {
      kind: "create";
      alert: TAlertsInsert;
      channels: TPreparedChannelCreate[];
    }
  | {
      kind: "update";
      alert: TAlerts;
      patch: Partial<Pick<TAlertsInsert, "name" | "description" | "condition" | "enabled">>;
      deleteChannelIds: string[];
      channelUpdates: TPreparedChannelUpdate[];
      channelCreates: TPreparedChannelCreate[];
    };
