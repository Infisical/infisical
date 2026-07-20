import { z } from "zod";

import { TAlertChannels, TAlerts } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelSummary } from "./alert-channel-service-types";
import { AlertChannelType } from "./alert-channel-types";
import { TAlertDALFactory } from "./alert-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import {
  TAlertResponse,
  TCreateAlertDTO,
  TDeleteAlertDTO,
  TGetAlertDTO,
  TListAlertsDTO,
  TUpdateAlertDTO
} from "./alert-service-types";
import { AlertPermissionAction, IResourceAlertProvider } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

export type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByIdsInScope" | "findByAlertId" | "findByAlertIds">;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "insertMany" | "deleteByAlertId">;
  alertProviderRegistry: TAlertProviderRegistry;
};

export type TAlertServiceFactory = ReturnType<typeof alertServiceFactory>;

const toChannelSummary = (channel: TAlertChannels): TAlertChannelSummary => {
  const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
  return {
    id: channel.id,
    name: channel.name,
    channelType: channel.channelType,
    directed: Boolean(definition?.directed),
    enabled: channel.enabled
  };
};

export const alertServiceFactory = ({
  alertDAL,
  alertChannelDAL,
  alertChannelMembershipDAL,
  alertProviderRegistry
}: TAlertServiceFactoryDep) => {
  const $getProvider = (resourceType: string): IResourceAlertProvider => {
    const provider = alertProviderRegistry.get(resourceType);
    if (!provider) {
      throw new BadRequestError({ message: `No alert provider is registered for resource type '${resourceType}'` });
    }
    return provider;
  };

  const $validate = (
    provider: IResourceAlertProvider,
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
        throw new BadRequestError({ message: `Invalid alert condition: ${message}` });
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
    const found = await alertChannelDAL.findByIdsInScope(uniqueIds, scope);
    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((c) => c.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new BadRequestError({ message: `Some channels were not found in this scope: ${missing.join(", ")}` });
    }
  };

  const $buildResponse = (alert: TAlerts, channels: TAlertChannels[]): TAlertResponse => ({
    id: alert.id,
    name: alert.name,
    description: alert.description ?? null,
    resourceType: alert.resourceType,
    resourceId: alert.resourceId ?? null,
    eventType: alert.eventType,
    condition: alert.condition ?? null,
    filters: alert.filters ?? null,
    enabled: alert.enabled,
    orgId: alert.orgId,
    projectId: alert.projectId ?? null,
    channels: channels.map(toChannelSummary),
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  });

  const createAlert = async (dto: TCreateAlertDTO): Promise<TAlertResponse> => {
    const provider = $getProvider(dto.resourceType);
    $validate(provider, dto, { alwaysValidateCondition: true });

    await provider.assertPermission({
      action: AlertPermissionAction.Create,
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

    const { created, channels } = await alertDAL.transaction(async (tx) => {
      const createdAlert = await alertDAL.create(
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

      await alertChannelMembershipDAL.insertMany(
        [...new Set(dto.channelIds)].map((channelId) => ({ alertId: createdAlert.id, channelId })),
        tx
      );

      const attachedChannels = await alertChannelDAL.findByAlertId(createdAlert.id, tx);
      return { created: createdAlert, channels: attachedChannels };
    });

    return $buildResponse(created, channels);
  };

  const getAlertById = async (dto: TGetAlertDTO): Promise<TAlertResponse> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await provider.assertPermission({
      action: AlertPermissionAction.Read,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    const channels = await alertChannelDAL.findByAlertId(alert.id);
    return $buildResponse(alert, channels);
  };

  const listAlerts = async (dto: TListAlertsDTO): Promise<TAlertResponse[]> => {
    const provider = $getProvider(dto.resourceType);
    await provider.assertPermission({
      action: AlertPermissionAction.Read,
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

    const alerts = await alertDAL.findActiveByScope({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
      projectId: dto.projectId ?? null,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
    if (alerts.length === 0) return [];

    const channels = await alertChannelDAL.findByAlertIds(alerts.map((alert) => alert.id));
    const channelsByAlert = new Map<string, TAlertChannels[]>();
    channels.forEach((channel) => {
      const list = channelsByAlert.get(channel.alertId) ?? [];
      list.push(channel);
      channelsByAlert.set(channel.alertId, list);
    });

    return alerts.map((alert) => $buildResponse(alert, channelsByAlert.get(alert.id) ?? []));
  };

  const updateAlert = async (dto: TUpdateAlertDTO): Promise<TAlertResponse> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await provider.assertPermission({
      action: AlertPermissionAction.Edit,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    if (dto.condition !== undefined) $validate(provider, { condition: dto.condition });
    if (dto.channelIds !== undefined) {
      await $resolveChannelsInScope(dto.channelIds, { orgId: alert.orgId, projectId: alert.projectId });
    }

    const { updated, channels } = await alertDAL.transaction(async (tx) => {
      const patch = {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.condition !== undefined
          ? { condition: dto.condition != null ? JSON.stringify(dto.condition) : null }
          : {}),
        ...(dto.filters !== undefined ? { filters: dto.filters != null ? JSON.stringify(dto.filters) : null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
      };

      const updatedAlert = Object.keys(patch).length > 0 ? await alertDAL.updateById(alert.id, patch, tx) : alert;

      if (dto.channelIds !== undefined) {
        await alertChannelMembershipDAL.deleteByAlertId(alert.id, tx);
        await alertChannelMembershipDAL.insertMany(
          [...new Set(dto.channelIds)].map((channelId) => ({ alertId: alert.id, channelId })),
          tx
        );
      }

      const attachedChannels = await alertChannelDAL.findByAlertId(alert.id, tx);
      return { updated: updatedAlert, channels: attachedChannels };
    });

    return $buildResponse(updated, channels);
  };

  const deleteAlert = async (dto: TDeleteAlertDTO): Promise<{ id: string }> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await provider.assertPermission({
      action: AlertPermissionAction.Delete,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      actor: {
        actor: dto.actor,
        actorId: dto.actorId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      }
    });

    await alertDAL.deleteById(alert.id);
    return { id: alert.id };
  };

  return { createAlert, getAlertById, listAlerts, updateAlert, deleteAlert };
};
