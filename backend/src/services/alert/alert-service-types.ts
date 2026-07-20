import { TGenericPermission } from "@app/lib/types";

import { TAlertChannelSummary } from "./alert-channel-service-types";

export type TCreateAlertDTO = TGenericPermission & {
  name: string;
  description?: string | null;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  projectId?: string | null;
  channelIds: string[];
};

export type TUpdateAlertDTO = TGenericPermission & {
  alertId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  channelIds?: string[];
};

export type TGetAlertDTO = TGenericPermission & { alertId: string };

export type TDeleteAlertDTO = TGenericPermission & { alertId: string };

export type TListAlertsDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  enabled?: boolean;
};

export type TAlertResponse = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  condition: unknown;
  filters: unknown;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  channels: TAlertChannelSummary[];
  createdAt: Date;
  updatedAt: Date;
};
