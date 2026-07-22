import { Knex } from "knex";
import { z } from "zod";

import { TAlertChannels, TAlerts } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelServiceFactory } from "./alert-channel-service";
import { TAlertChannelEmbedded, TAlertChannelInput } from "./alert-channel-service-types";
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
import { AlertPermissionAction, AlertTriggerType, IResourceAlertProvider } from "./alert-types";

export type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId" | "findByAlertIds">;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "insertMany">;
  alertChannelService: Pick<
    TAlertChannelServiceFactory,
    "createChannelInTx" | "updateChannelInTx" | "deleteChannelInTx" | "getDetailsForChannels"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  alertProviderRegistry: TAlertProviderRegistry;
};

export type TAlertServiceFactory = ReturnType<typeof alertServiceFactory>;

export const alertServiceFactory = ({
  alertDAL,
  alertChannelDAL,
  alertChannelMembershipDAL,
  alertChannelService,
  kmsService,
  alertProviderRegistry
}: TAlertServiceFactoryDep) => {
  const $getProvider = (resourceType: string): IResourceAlertProvider => {
    const provider = alertProviderRegistry.get(resourceType);
    if (!provider) {
      throw new BadRequestError({ message: `No alert provider is registered for resource type '${resourceType}'` });
    }
    return provider;
  };

  const $toActor = (dto: TGenericPermission): TGenericPermission => ({
    actor: dto.actor,
    actorId: dto.actorId,
    actorAuthMethod: dto.actorAuthMethod,
    actorOrgId: dto.actorOrgId
  });

  const $assertAlertPermission = (
    provider: IResourceAlertProvider,
    action: AlertPermissionAction,
    scope: { orgId: string; projectId?: string | null; resourceId?: string | null },
    dto: TGenericPermission
  ) =>
    provider.assertPermission({
      action,
      orgId: scope.orgId,
      projectId: scope.projectId,
      resourceId: scope.resourceId,
      actor: $toActor(dto)
    });

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

  const $assembleResponse = (alert: TAlerts, channels: TAlertChannelEmbedded[]): TAlertResponse => ({
    id: alert.id,
    name: alert.name,
    description: alert.description ?? null,
    resourceType: alert.resourceType,
    resourceId: alert.resourceId ?? null,
    eventType: alert.eventType,
    condition: alert.condition ?? null,
    enabled: alert.enabled,
    orgId: alert.orgId,
    projectId: alert.projectId ?? null,
    channels,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  });

  const createAlert = async (dto: TCreateAlertDTO): Promise<TAlertResponse> => {
    const provider = $getProvider(dto.resourceType);
    $validate(provider, dto, { alwaysValidateCondition: true });

    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Create,
      { orgId: dto.actorOrgId, projectId: dto.projectId, resourceId: dto.resourceId },
      dto
    );

    await provider.assertResourceInScope({
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId
    });

    const duplicate = await alertDAL.findScopedDuplicate({
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      eventType: dto.eventType
    });
    if (duplicate) {
      throw new BadRequestError({
        message: dto.resourceId
          ? "An alert for this resource and event already exists"
          : "An alert for this event already exists in this scope"
      });
    }

    if (!dto.channels || dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }

    const scope = { orgId: dto.actorOrgId, projectId: dto.projectId ?? null };
    const cipher = await getAlertChannelCipher(kmsService, scope);

    const { created, channels } = await alertDAL.transaction(async (tx) => {
      const createdAlert = await alertDAL.create(
        {
          name: dto.name,
          description: dto.description,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
          eventType: dto.eventType,
          triggerType: AlertTriggerType.Scheduled,
          condition: dto.condition != null ? JSON.stringify(dto.condition) : null,
          enabled: dto.enabled ?? true,
          orgId: dto.actorOrgId,
          projectId: dto.projectId,
          createdByUserId: dto.actorId
        },
        tx
      );

      for (const channelInput of dto.channels) {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        const channel = await alertChannelService.createChannelInTx(
          {
            name: channelInput.name,
            channelType: channelInput.channelType,
            config: channelInput.config ?? {},
            enabled: channelInput.enabled,
            recipients: channelInput.recipients,
            orgId: dto.actorOrgId,
            projectId: dto.projectId ?? null,
            createdByUserId: dto.actorId
          },
          cipher.encryptor,
          tx
        );
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: createdAlert.id, channelId: channel.id }], tx);
      }

      const attachedChannels = await alertChannelDAL.findByAlertId(createdAlert.id, {}, tx);
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
      return { created: createdAlert, channels: details };
    });

    return $assembleResponse(created, channels);
  };

  const getAlertById = async (dto: TGetAlertDTO): Promise<TAlertResponse> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Read,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto
    );

    const channels = await alertChannelDAL.findByAlertId(alert.id);
    const cipher = await getAlertChannelCipher(kmsService, { orgId: alert.orgId, projectId: alert.projectId });
    const details = await alertChannelService.getDetailsForChannels(channels, cipher);
    return $assembleResponse(alert, details);
  };

  const listAlerts = async (dto: TListAlertsDTO): Promise<TAlertResponse[]> => {
    const provider = $getProvider(dto.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Read,
      { orgId: dto.actorOrgId, projectId: dto.projectId, resourceId: dto.resourceId },
      dto
    );

    const alerts = await alertDAL.findActiveByScope({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
      projectId: dto.projectId ?? null,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
    if (alerts.length === 0) return [];

    const channels = await alertChannelDAL.findByAlertIds(alerts.map((alert) => alert.id));
    const cipher = await getAlertChannelCipher(kmsService, { orgId: dto.actorOrgId, projectId: dto.projectId ?? null });
    const details = await alertChannelService.getDetailsForChannels(channels, cipher);

    const detailById = new Map(details.map((detail) => [detail.id, detail]));
    const channelIdsByAlert = new Map<string, string[]>();
    channels.forEach((channel) => {
      const list = channelIdsByAlert.get(channel.alertId) ?? [];
      list.push(channel.id);
      channelIdsByAlert.set(channel.alertId, list);
    });

    return alerts.map((alert) =>
      $assembleResponse(
        alert,
        (channelIdsByAlert.get(alert.id) ?? [])
          .map((id) => detailById.get(id))
          .filter((detail): detail is TAlertChannelEmbedded => Boolean(detail))
      )
    );
  };

  const $reconcileChannels = async (
    alert: TAlerts,
    incoming: TAlertChannelInput[],
    cipher: Awaited<ReturnType<typeof getAlertChannelCipher>>,
    tx: Knex
  ) => {
    const existing = await alertChannelDAL.findByAlertId(alert.id, {}, tx);
    const existingById = new Map<string, TAlertChannels>(existing.map((channel) => [channel.id, channel]));

    const incomingIds = new Set(incoming.filter((channel) => channel.id).map((channel) => channel.id as string));
    for (const id of incomingIds) {
      if (!existingById.has(id)) {
        throw new BadRequestError({ message: `Channel '${id}' does not belong to this alert` });
      }
    }

    const toDelete = existing.filter((channel) => !incomingIds.has(channel.id));
    for (const channel of toDelete) {
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      await alertChannelService.deleteChannelInTx(channel.id, tx);
    }

    for (const channelInput of incoming) {
      if (channelInput.id) {
        const existingChannel = existingById.get(channelInput.id) as TAlertChannels;
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelService.updateChannelInTx(
          {
            channelId: channelInput.id,
            name: channelInput.name,
            config: channelInput.config,
            enabled: channelInput.enabled,
            recipients: channelInput.recipients
          },
          existingChannel,
          cipher,
          tx
        );
      } else {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        const channel = await alertChannelService.createChannelInTx(
          {
            name: channelInput.name,
            channelType: channelInput.channelType,
            config: channelInput.config ?? {},
            enabled: channelInput.enabled,
            recipients: channelInput.recipients,
            orgId: alert.orgId,
            projectId: alert.projectId,
            createdByUserId: alert.createdByUserId
          },
          cipher.encryptor,
          tx
        );
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: alert.id, channelId: channel.id }], tx);
      }
    }
  };

  const updateAlert = async (dto: TUpdateAlertDTO): Promise<TAlertResponse> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Edit,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto
    );

    if (dto.condition !== undefined) $validate(provider, { condition: dto.condition });
    if (dto.channels !== undefined && dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }

    const scope = { orgId: alert.orgId, projectId: alert.projectId };
    const cipher = await getAlertChannelCipher(kmsService, scope);

    const { updated, channels } = await alertDAL.transaction(async (tx) => {
      const patch = {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.condition !== undefined
          ? { condition: dto.condition != null ? JSON.stringify(dto.condition) : null }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
      };

      const updatedAlert = Object.keys(patch).length > 0 ? await alertDAL.updateById(alert.id, patch, tx) : alert;

      if (dto.channels !== undefined) {
        await $reconcileChannels(alert, dto.channels, cipher, tx);
      }

      const attachedChannels = await alertChannelDAL.findByAlertId(alert.id, {}, tx);
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
      return { updated: updatedAlert, channels: details };
    });

    return $assembleResponse(updated, channels);
  };

  const deleteAlert = async (dto: TDeleteAlertDTO): Promise<{ id: string }> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Delete,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto
    );

    await alertDAL.transaction(async (tx) => {
      const channels = await alertChannelDAL.findByAlertId(alert.id, {}, tx);
      for (const channel of channels) {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelService.deleteChannelInTx(channel.id, tx);
      }
      await alertDAL.deleteById(alert.id, tx);
    });

    return { id: alert.id };
  };

  return { createAlert, getAlertById, listAlerts, updateAlert, deleteAlert };
};
