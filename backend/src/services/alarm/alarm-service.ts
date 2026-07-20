import { z } from "zod";

import { TAlarmChannels, TAlarms } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAlarmChannelDALFactory } from "./alarm-channel-dal";
import { TAlarmChannelMembershipDALFactory } from "./alarm-channel-membership-dal";
import { TAlarmChannelSummary } from "./alarm-channel-service-types";
import { AlarmChannelType } from "./alarm-channel-types";
import { TAlarmDALFactory } from "./alarm-dal";
import { TAlarmProviderRegistry } from "./alarm-provider-registry";
import {
  TAlarmResponse,
  TCreateAlarmDTO,
  TDeleteAlarmDTO,
  TGetAlarmDTO,
  TListAlarmsDTO,
  TUpdateAlarmDTO
} from "./alarm-service-types";
import { AlarmPermissionAction, IResourceAlarmProvider } from "./alarm-types";
import { ALARM_CHANNEL_REGISTRY } from "./channels/alarm-channel-registry";

export type TAlarmServiceFactoryDep = {
  alarmDAL: TAlarmDALFactory;
  alarmChannelDAL: Pick<TAlarmChannelDALFactory, "findByIdsInScope" | "findByAlarmId" | "findByAlarmIds">;
  alarmChannelMembershipDAL: Pick<TAlarmChannelMembershipDALFactory, "insertMany" | "deleteByAlarmId">;
  alarmProviderRegistry: TAlarmProviderRegistry;
};

export type TAlarmServiceFactory = ReturnType<typeof alarmServiceFactory>;

const toChannelSummary = (channel: TAlarmChannels): TAlarmChannelSummary => {
  const definition = ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType];
  return {
    id: channel.id,
    name: channel.name,
    channelType: channel.channelType,
    directed: Boolean(definition?.directed),
    enabled: channel.enabled
  };
};

export const alarmServiceFactory = ({
  alarmDAL,
  alarmChannelDAL,
  alarmChannelMembershipDAL,
  alarmProviderRegistry
}: TAlarmServiceFactoryDep) => {
  const $getProvider = (resourceType: string): IResourceAlarmProvider => {
    const provider = alarmProviderRegistry.get(resourceType);
    if (!provider) {
      throw new BadRequestError({ message: `No alarm provider is registered for resource type '${resourceType}'` });
    }
    return provider;
  };

  const $validate = (
    provider: IResourceAlarmProvider,
    input: { eventType?: string; condition?: unknown },
    opts: { alwaysValidateCondition?: boolean } = {}
  ) => {
    if (input.eventType && !provider.eventTypes.includes(input.eventType)) {
      throw new BadRequestError({
        message: `Event type '${input.eventType}' is not supported by resource type '${provider.resourceType}'`
      });
    }

    if (opts.alwaysValidateCondition || input.condition !== undefined) {
      try {
        provider.conditionSchema.parse(input.condition);
      } catch (err) {
        const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid condition";
        throw new BadRequestError({ message: `Invalid alarm condition: ${message}` });
      }
    }
  };

  const $resolveChannelsInScope = async (
    channelIds: string[],
    scope: { orgId: string; projectId?: string | null }
  ): Promise<void> => {
    if (channelIds.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }
    const uniqueIds = [...new Set(channelIds)];
    const found = await alarmChannelDAL.findByIdsInScope(uniqueIds, scope);
    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((c) => c.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new BadRequestError({ message: `Some channels were not found in this scope: ${missing.join(", ")}` });
    }
  };

  const $buildResponse = (alarm: TAlarms, channels: TAlarmChannels[]): TAlarmResponse => ({
    id: alarm.id,
    name: alarm.name,
    description: alarm.description ?? null,
    resourceType: alarm.resourceType,
    resourceId: alarm.resourceId ?? null,
    eventType: alarm.eventType,
    condition: alarm.condition ?? null,
    filters: alarm.filters ?? null,
    enabled: alarm.enabled,
    orgId: alarm.orgId,
    projectId: alarm.projectId ?? null,
    channels: channels.map(toChannelSummary),
    createdAt: alarm.createdAt,
    updatedAt: alarm.updatedAt
  });

  const createAlarm = async (dto: TCreateAlarmDTO): Promise<TAlarmResponse> => {
    const provider = $getProvider(dto.resourceType);
    $validate(provider, dto, { alwaysValidateCondition: true });

    await provider.assertPermission({
      action: AlarmPermissionAction.Create,
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    await provider.assertResourceInScope({
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId
    });

    await $resolveChannelsInScope(dto.channelIds, { orgId: dto.actorOrgId, projectId: dto.projectId });

    const { created, channels } = await alarmDAL.transaction(async (tx) => {
      const createdAlarm = await alarmDAL.create(
        {
          name: dto.name,
          description: dto.description,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
          eventType: dto.eventType,
          condition: dto.condition != null ? JSON.stringify(dto.condition) : null,
          filters: dto.filters != null ? JSON.stringify(dto.filters) : null,
          enabled: dto.enabled ?? true,
          orgId: dto.actorOrgId,
          projectId: dto.projectId,
          createdByUserId: dto.actorId
        },
        tx
      );

      await alarmChannelMembershipDAL.insertMany(
        [...new Set(dto.channelIds)].map((channelId) => ({ alarmId: createdAlarm.id, channelId })),
        tx
      );

      const attachedChannels = await alarmChannelDAL.findByAlarmId(createdAlarm.id, tx);
      return { created: createdAlarm, channels: attachedChannels };
    });

    return $buildResponse(created, channels);
  };

  const getAlarmById = async (dto: TGetAlarmDTO): Promise<TAlarmResponse> => {
    const alarm = await alarmDAL.findActiveById(dto.alarmId);
    if (!alarm) throw new NotFoundError({ message: `Alarm with ID '${dto.alarmId}' not found` });

    const provider = $getProvider(alarm.resourceType);
    await provider.assertPermission({
      action: AlarmPermissionAction.Read,
      orgId: alarm.orgId,
      projectId: alarm.projectId,
      resourceId: alarm.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    const channels = await alarmChannelDAL.findByAlarmId(alarm.id);
    return $buildResponse(alarm, channels);
  };

  const listAlarms = async (dto: TListAlarmsDTO): Promise<TAlarmResponse[]> => {
    const provider = $getProvider(dto.resourceType);
    await provider.assertPermission({
      action: AlarmPermissionAction.Read,
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    const alarms = await alarmDAL.findActiveByScope({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
      projectId: dto.projectId ?? null,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
    if (alarms.length === 0) return [];

    const channels = await alarmChannelDAL.findByAlarmIds(alarms.map((alarm) => alarm.id));
    const channelsByAlarm = new Map<string, TAlarmChannels[]>();
    channels.forEach((channel) => {
      const list = channelsByAlarm.get(channel.alarmId) ?? [];
      list.push(channel);
      channelsByAlarm.set(channel.alarmId, list);
    });

    return alarms.map((alarm) => $buildResponse(alarm, channelsByAlarm.get(alarm.id) ?? []));
  };

  const updateAlarm = async (dto: TUpdateAlarmDTO): Promise<TAlarmResponse> => {
    const alarm = await alarmDAL.findActiveById(dto.alarmId);
    if (!alarm) throw new NotFoundError({ message: `Alarm with ID '${dto.alarmId}' not found` });

    const provider = $getProvider(alarm.resourceType);
    await provider.assertPermission({
      action: AlarmPermissionAction.Edit,
      orgId: alarm.orgId,
      projectId: alarm.projectId,
      resourceId: alarm.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    if (dto.condition !== undefined) $validate(provider, { condition: dto.condition });
    if (dto.channelIds !== undefined) {
      await $resolveChannelsInScope(dto.channelIds, { orgId: alarm.orgId, projectId: alarm.projectId });
    }

    const { updated, channels } = await alarmDAL.transaction(async (tx) => {
      const patch = {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.condition !== undefined
          ? { condition: dto.condition != null ? JSON.stringify(dto.condition) : null }
          : {}),
        ...(dto.filters !== undefined ? { filters: dto.filters != null ? JSON.stringify(dto.filters) : null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
      };

      const updatedAlarm = Object.keys(patch).length > 0 ? await alarmDAL.updateById(alarm.id, patch, tx) : alarm;

      if (dto.channelIds !== undefined) {
        await alarmChannelMembershipDAL.deleteByAlarmId(alarm.id, tx);
        await alarmChannelMembershipDAL.insertMany(
          [...new Set(dto.channelIds)].map((channelId) => ({ alarmId: alarm.id, channelId })),
          tx
        );
      }

      const attachedChannels = await alarmChannelDAL.findByAlarmId(alarm.id, tx);
      return { updated: updatedAlarm, channels: attachedChannels };
    });

    return $buildResponse(updated, channels);
  };

  const deleteAlarm = async (dto: TDeleteAlarmDTO): Promise<{ id: string }> => {
    const alarm = await alarmDAL.findActiveById(dto.alarmId);
    if (!alarm) throw new NotFoundError({ message: `Alarm with ID '${dto.alarmId}' not found` });

    const provider = $getProvider(alarm.resourceType);
    await provider.assertPermission({
      action: AlarmPermissionAction.Delete,
      orgId: alarm.orgId,
      projectId: alarm.projectId,
      resourceId: alarm.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    await alarmDAL.deleteById(alarm.id);
    return { id: alarm.id };
  };

  return { createAlarm, getAlarmById, listAlarms, updateAlarm, deleteAlarm };
};
