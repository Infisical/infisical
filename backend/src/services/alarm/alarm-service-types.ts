import { TGenericPermission } from "@app/lib/types";

import { TAlarmChannelSummary } from "./alarm-channel-service-types";

export type TCreateAlarmDTO = TGenericPermission & {
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

export type TUpdateAlarmDTO = TGenericPermission & {
  alarmId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  channelIds?: string[];
};

export type TGetAlarmDTO = TGenericPermission & { alarmId: string };

export type TDeleteAlarmDTO = TGenericPermission & { alarmId: string };

export type TListAlarmsDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  enabled?: boolean;
};

export type TAlarmResponse = {
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
  channels: TAlarmChannelSummary[];
  createdAt: Date;
  updatedAt: Date;
};
