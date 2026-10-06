import { Knex } from "knex";
import { z } from "zod";

import { TAlertChannels, TAlerts } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelServiceFactory } from "./alert-channel-service";
import { TAlertChannelEmbedded, TAlertChannelInput, TChannelRecipientInput } from "./alert-channel-service-types";
import { TAlertDALFactory } from "./alert-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import {
  TAlertResponse,
  TCreateAlertDTO,
  TDeleteAlertDTO,
  TGetAlertDTO,
  TListAlertsDTO,
  TNewAlertRows,
  TUpdateAlertDTO
} from "./alert-service-types";
import { AlertPermissionAction, IResourceAlertProvider, TAlertEventDefinition, toAlertActor } from "./alert-types";

export type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId" | "findByAlertIds" | "delete">;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "insertMany">;
  alertChannelService: Pick<
    TAlertChannelServiceFactory,
    | "createChannelInTx"
    | "updateChannelInTx"
    | "deleteChannelInTx"
    | "getDetailsForChannels"
    | "filterRecipientsInScope"
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
      actor: toAlertActor(dto)
    });

  const $getEvent = (provider: IResourceAlertProvider, eventType: string): TAlertEventDefinition => {
    const event = provider.events.find((candidate) => candidate.key === eventType);
    if (!event) {
      throw new BadRequestError({
        message: `Event type '${eventType}' is not supported by resource type '${provider.resourceType}'`
      });
    }
    return event;
  };

  const $validateCondition = (event: TAlertEventDefinition, condition: unknown) => {
    try {
      event.conditionSchema.parse(condition);
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid condition";
      throw new BadRequestError({ message: `Invalid alert condition: ${message}` });
    }
  };

  const $assembleResponse = (alert: TAlerts, channels: TAlertChannelEmbedded[]): TAlertResponse => ({
    id: alert.id,
    name: alert.name,
    description: alert.description ?? null,
    resourceType: alert.resourceType,
    resourceId: alert.resourceId ?? null,
    eventType: alert.eventType,
    triggerType: alert.triggerType,
    condition: alert.condition ?? null,
    enabled: alert.enabled,
    orgId: alert.orgId,
    projectId: alert.projectId ?? null,
    channels,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  });

  const $createAlertRows = async (
    input: TNewAlertRows,
    event: TAlertEventDefinition,
    cipher: Awaited<ReturnType<typeof getAlertChannelCipher>>,
    tx: Knex
  ): Promise<TAlertResponse> => {
    let createdAlert: TAlerts;
    try {
      createdAlert = await alertDAL.create(
        {
          name: input.name,
          description: input.description,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          eventType: input.eventType,
          triggerType: event.triggerType,
          condition: input.condition != null ? JSON.stringify(input.condition) : null,
          enabled: input.enabled ?? true,
          orgId: input.orgId,
          projectId: input.projectId,
          createdByActorId: input.createdBy.actorId,
          createdByActorType: input.createdBy.actorType
        },
        tx
      );
    } catch (err) {
      // findScopedDuplicate reads the replica, so two concurrent creates can both pass it.
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: "An alert for this resource and event already exists" });
      }
      throw err;
    }

    for (const channelInput of input.channels) {
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      const channel = await alertChannelService.createChannelInTx(
        {
          name: channelInput.name,
          channelType: channelInput.channelType,
          config: channelInput.config ?? {},
          enabled: channelInput.enabled,
          recipients: channelInput.recipients,
          orgId: input.orgId,
          projectId: input.projectId,
          createdByActorId: input.createdBy.actorId,
          createdByActorType: input.createdBy.actorType
        },
        cipher.encryptor,
        tx
      );
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      await alertChannelMembershipDAL.insertMany([{ alertId: createdAlert.id, channelId: channel.id }], tx);
    }

    const attachedChannels = await alertChannelDAL.findByAlertId(createdAlert.id, {}, tx);
    const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
    return $assembleResponse(createdAlert, details);
  };

  const createAlert = async (dto: TCreateAlertDTO): Promise<TAlertResponse> => {
    if (!dto.resourceId) {
      throw new BadRequestError({
        message:
          "Alerts must be bound to a specific resource. Organization wide and project wide alerts are not supported yet."
      });
    }

    const provider = $getProvider(dto.resourceType);
    const event = $getEvent(provider, dto.eventType);
    $validateCondition(event, dto.condition);

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

    const input: TNewAlertRows = {
      name: dto.name,
      description: dto.description,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      eventType: dto.eventType,
      condition: dto.condition,
      enabled: dto.enabled,
      orgId: dto.actorOrgId,
      projectId: dto.projectId ?? null,
      channels: dto.channels,
      createdBy: { actorType: dto.actor, actorId: dto.actorId }
    };
    const cipher = await getAlertChannelCipher(kmsService, input);
    return alertDAL.transaction((tx) => $createAlertRows(input, event, cipher, tx));
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
            channelType: channelInput.channelType,
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
            createdByActorId: alert.createdByActorId ?? null,
            createdByActorType: alert.createdByActorType
          },
          cipher.encryptor,
          tx
        );
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: alert.id, channelId: channel.id }], tx);
      }
    }
  };

  const $updateAlertRows = async (
    alert: TAlerts,
    input: Omit<TUpdateAlertDTO, keyof TGenericPermission>,
    cipher: Awaited<ReturnType<typeof getAlertChannelCipher>>,
    tx: Knex
  ): Promise<TAlertResponse> => {
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.condition !== undefined
        ? { condition: input.condition != null ? JSON.stringify(input.condition) : null }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {})
    };

    const updatedAlert = Object.keys(patch).length > 0 ? await alertDAL.updateById(alert.id, patch, tx) : alert;

    if (input.channels !== undefined) {
      await $reconcileChannels(alert, input.channels, cipher, tx);
    }

    const attachedChannels = await alertChannelDAL.findByAlertId(alert.id, {}, tx);
    const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
    return $assembleResponse(updatedAlert, details);
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

    if (dto.condition !== undefined) $validateCondition($getEvent(provider, alert.eventType), dto.condition);
    if (dto.channels !== undefined && dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }

    const cipher = await getAlertChannelCipher(kmsService, { orgId: alert.orgId, projectId: alert.projectId });
    return alertDAL.transaction((tx) => $updateAlertRows(alert, dto, cipher, tx));
  };

  const $deleteAlertsByFilter = async (filter: Parameters<typeof alertDAL.delete>[0], tx: Knex): Promise<number> => {
    const alerts = await alertDAL.find(filter, { tx });
    const channels = await alertChannelDAL.findByAlertIds(
      alerts.map((alert) => alert.id),
      tx
    );

    const deleted = await alertDAL.delete(filter, tx);
    if (channels.length > 0) {
      await alertChannelDAL.delete({ $in: { id: [...new Set(channels.map((channel) => channel.id))] } }, tx);
    }
    return deleted.length;
  };

  const deleteAlert = async (
    dto: TDeleteAlertDTO
  ): Promise<{
    id: string;
    name: string;
    resourceType: string;
    eventType: string;
    orgId: string;
    projectId: string | null;
  }> => {
    const alert = await alertDAL.findActiveById(dto.alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });

    const provider = $getProvider(alert.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Delete,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto
    );

    await alertDAL.transaction((tx) => $deleteAlertsByFilter({ id: alert.id }, tx));

    return {
      id: alert.id,
      name: alert.name,
      resourceType: alert.resourceType,
      eventType: alert.eventType,
      orgId: alert.orgId,
      projectId: alert.projectId ?? null
    };
  };

  const $reapAlerts = async (
    filter: { orgId?: string; projectId?: string; resourceType: string; resourceId: string },
    tx?: Knex
  ): Promise<number> => {
    const run = (trx: Knex) => $deleteAlertsByFilter(filter, trx);

    return tx ? run(tx) : alertDAL.transaction(run);
  };

  const deleteAlertsForResource = async (
    {
      orgId,
      projectId,
      resourceType,
      resourceId
    }: { orgId: string; projectId?: string; resourceType: string; resourceId: string },
    tx?: Knex
  ): Promise<number> => $reapAlerts({ orgId, resourceType, resourceId, ...(projectId ? { projectId } : {}) }, tx);

  const deleteAlertsForDeletedResource = async (
    { resourceType, resourceId }: { resourceType: string; resourceId: string },
    tx?: Knex
  ): Promise<number> => $reapAlerts({ resourceType, resourceId }, tx);

  const findAlertChannelSummariesForResources = (input: { resourceType: string; resourceIds: string[] }, tx?: Knex) =>
    alertDAL.findChannelSummariesForResources(input, tx);

  const deleteAlertsForDeletedResources = async (
    { resourceType, resourceIds }: { resourceType: string; resourceIds: string[] },
    tx?: Knex
  ): Promise<number> => {
    if (resourceIds.length === 0) return 0;
    const run = (trx: Knex) => $deleteAlertsByFilter({ resourceType, $in: { resourceId: resourceIds } }, trx);
    return tx ? run(tx) : alertDAL.transaction(run);
  };

  // For a resource that is recreated under a new id (eg a secret moved between folders), so its alerts
  // and their history follow it instead of being rebuilt.
  const repointAlertsForResource = async (
    {
      resourceType,
      fromResourceId,
      toResourceId
    }: { resourceType: string; fromResourceId: string; toResourceId: string },
    tx: Knex
  ): Promise<void> => {
    await alertDAL.update({ resourceType, resourceId: fromResourceId }, { resourceId: toResourceId }, tx);
  };

  const findRecipientsForResources = (
    input: { resourceType: string; resourceIds: string[]; channelType: string; principalType: string },
    tx?: Knex
  ) => alertDAL.findRecipientsForResources(input, tx);

  const filterRecipientsInScope = (
    scope: { orgId: string; projectId?: string | null },
    recipients: TChannelRecipientInput[],
    tx?: Knex
  ) => alertChannelService.filterRecipientsInScope(scope, recipients, tx);

  return {
    createAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    deleteAlertsForResource,
    deleteAlertsForDeletedResource,
    findAlertChannelSummariesForResources,
    deleteAlertsForDeletedResources,
    repointAlertsForResource,
    findRecipientsForResources,
    filterRecipientsInScope
  };
};
