import { TGenericPermission } from "@app/lib/types";

import { TAlertChannelEmbedded, TAlertChannelInput } from "./alert-channel-service-types";

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

export type TAlertResponse = {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  resourceId: string | null;
  eventType: string;
  condition: unknown;
  enabled: boolean;
  orgId: string;
  projectId: string | null;
  channels: TAlertChannelEmbedded[];
  createdAt: Date;
  updatedAt: Date;
};
