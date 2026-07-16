import { TGenericPermission } from "@app/lib/types";

import { AlarmChannelType } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";

export type TAlarmRecipientInput = {
  principalType: AlarmPrincipalType;
  principalId: string;
};

export type TAlarmChannelInput = {
  id?: string;
  channelType: AlarmChannelType;
  config: unknown;
  enabled?: boolean;
};

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
  recipients: TAlarmRecipientInput[];
  channels: TAlarmChannelInput[];
};

export type TUpdateAlarmDTO = TGenericPermission & {
  alarmId: string;
  name?: string;
  description?: string | null;
  condition?: unknown;
  filters?: unknown;
  enabled?: boolean;
  recipients?: TAlarmRecipientInput[];
  channels?: TAlarmChannelInput[];
};

export type TGetAlarmDTO = TGenericPermission & { alarmId: string };

export type TDeleteAlarmDTO = TGenericPermission & { alarmId: string };

export type TListAlarmsDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  enabled?: boolean;
};

export type TAlarmChannelResponse = {
  id: string;
  channelType: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TAlarmRecipientResponse = {
  principalType: string;
  principalId: string;
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
  recipients: TAlarmRecipientResponse[];
  channels: TAlarmChannelResponse[];
  createdAt: Date;
  updatedAt: Date;
};
