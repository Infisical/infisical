import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { z } from "zod";

import { TAlertChannels, TAlerts } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelServiceFactory, TChannelDetailsOptions } from "./alert-channel-service";
import { TAlertChannelEmbedded, TAlertChannelInput } from "./alert-channel-service-types";
import { TAlertDALFactory } from "./alert-dal";
import { TAlertHistoryDALFactory } from "./alert-history-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import {
  TAlertLastRun,
  TAlertResponse,
  TCreateAlertDTO,
  TDeleteAlertDTO,
  TGetAlertDTO,
  TListAlertsDTO,
  TUpdateAlertDTO
} from "./alert-service-types";
import {
  AlertPermissionAction,
  AlertTelemetryAction,
  IResourceAlertProvider,
  TAlertEventDefinition,
  toAlertActor
} from "./alert-types";

export type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId" | "findByAlertIds" | "delete">;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "insertMany">;
  alertChannelService: Pick<
    TAlertChannelServiceFactory,
    "createChannelInTx" | "updateChannelInTx" | "deleteChannelInTx" | "getDetailsForChannels"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertHistoryDAL: Pick<TAlertHistoryDALFactory, "findLatestByAlertIds">;
};

export type TAlertServiceFactory = ReturnType<typeof alertServiceFactory>;

export const alertServiceFactory = ({
  alertDAL,
  alertChannelDAL,
  alertChannelMembershipDAL,
  alertChannelService,
  kmsService,
  alertProviderRegistry,
  alertHistoryDAL
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

  const $isAllowed = async (
    provider: IResourceAlertProvider,
    action: AlertPermissionAction,
    scope: { orgId: string; projectId?: string | null; resourceId?: string | null },
    dto: TGenericPermission
  ) => {
    try {
      await $assertAlertPermission(provider, action, scope, dto);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof ForbiddenRequestError) return false;
      throw error;
    }
  };

  const $canRevealSecrets = async (
    provider: IResourceAlertProvider,
    scope: { orgId: string; projectId?: string | null; resourceId?: string | null },
    dto: TGenericPermission,
    options: TChannelDetailsOptions
  ) => {
    if (!options.revealSecrets) return false;
    return $isAllowed(provider, AlertPermissionAction.Edit, scope, dto);
  };

  const $filterReadableAlerts = async (provider: IResourceAlertProvider, alerts: TAlerts[], dto: TListAlertsDTO) => {
    const resourceIds = [...new Set(alerts.map((alert) => alert.resourceId).filter((id): id is string => Boolean(id)))];
    const readable = await Promise.all(
      resourceIds.map((resourceId) =>
        $isAllowed(
          provider,
          AlertPermissionAction.Read,
          { orgId: dto.actorOrgId, projectId: dto.projectId, resourceId },
          dto
        )
      )
    );
    const readableResourceIds = new Set(resourceIds.filter((_, index) => readable[index]));
    return alerts.filter((alert) => !alert.resourceId || readableResourceIds.has(alert.resourceId));
  };

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

  const $getResourceNames = async (
    provider: IResourceAlertProvider,
    orgId: string,
    resourceIds: (string | null | undefined)[]
  ): Promise<Map<string, string>> => {
    const ids = [...new Set(resourceIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length || !provider.getResourceNames) return new Map();
    return provider.getResourceNames({ orgId, resourceIds: ids });
  };

  const $getResourceName = async (provider: IResourceAlertProvider, alert: Pick<TAlerts, "orgId" | "resourceId">) =>
    (await $getResourceNames(provider, alert.orgId, [alert.resourceId])).get(alert.resourceId ?? "") ?? null;

  const $getLastRuns = async (alertIds: string[]): Promise<Map<string, TAlertLastRun>> => {
    const runs = await alertHistoryDAL.findLatestByAlertIds(alertIds);
    return new Map(
      runs
        .filter((run) => run.triggeredAt)
        .map((run) => [
          run.alertId,
          { timestamp: run.triggeredAt as Date, status: run.status, error: run.error ?? null }
        ])
    );
  };

  const $assembleResponse = (
    alert: TAlerts,
    channels: TAlertChannelEmbedded[],
    extras: { resourceName: string | null; lastRun: TAlertLastRun | null }
  ): TAlertResponse => ({
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
    resourceName: extras.resourceName,
    channels,
    lastRun: extras.lastRun,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  });

  const createAlert = async (input: TCreateAlertDTO, options: TChannelDetailsOptions = {}): Promise<TAlertResponse> => {
    if (!input.resourceId) {
      throw new BadRequestError({
        message:
          "Alerts must be bound to a specific resource. Organization wide and project wide alerts are not supported yet."
      });
    }

    const provider = $getProvider(input.resourceType);
    const dto =
      input.projectId || !provider.resolveProjectId
        ? input
        : {
            ...input,
            projectId: await provider.resolveProjectId({ orgId: input.actorOrgId, resourceId: input.resourceId })
          };

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

    if (!provider.allowsMultipleAlertsPerEvent) {
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
    }

    if (!dto.channels || dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }

    await provider.assertChannelTypesAllowed?.({
      orgId: dto.actorOrgId,
      channelTypes: dto.channels.map((channel) => channel.channelType)
    });

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
          triggerType: event.triggerType,
          condition: dto.condition != null ? JSON.stringify(dto.condition) : null,
          enabled: dto.enabled ?? true,
          orgId: dto.actorOrgId,
          projectId: dto.projectId,
          createdByActorId: dto.actorId,
          createdByActorType: dto.actor
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
            createdByActorId: dto.actorId,
            createdByActorType: dto.actor
          },
          cipher.encryptor,
          tx
        );
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: createdAlert.id, channelId: channel.id }], tx);
      }

      const attachedChannels = await alertChannelDAL.findByAlertId(createdAlert.id, {}, tx);
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx, options);
      return { created: createdAlert, channels: details };
    });

    return $assembleResponse(created, channels, {
      resourceName: await $getResourceName(provider, created),
      lastRun: null
    });
  };

  const getAlertById = async (dto: TGetAlertDTO, options: TChannelDetailsOptions = {}): Promise<TAlertResponse> => {
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
    const revealSecrets = await $canRevealSecrets(
      provider,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto,
      options
    );
    const details = await alertChannelService.getDetailsForChannels(channels, cipher, undefined, { revealSecrets });
    const lastRuns = await $getLastRuns([alert.id]);
    return $assembleResponse(alert, details, {
      resourceName: await $getResourceName(provider, alert),
      lastRun: lastRuns.get(alert.id) ?? null
    });
  };

  const listAlerts = async (dto: TListAlertsDTO, options: TChannelDetailsOptions = {}): Promise<TAlertResponse[]> => {
    const provider = $getProvider(dto.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Read,
      { orgId: dto.actorOrgId, projectId: dto.projectId, resourceId: dto.resourceId },
      dto
    );

    const scopedAlerts = await alertDAL.findActiveByScope({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
      projectId: dto.projectId ?? null,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
    const alerts =
      dto.resourceId !== undefined ? scopedAlerts : await $filterReadableAlerts(provider, scopedAlerts, dto);
    if (alerts.length === 0) return [];

    const channels = await alertChannelDAL.findByAlertIds(alerts.map((alert) => alert.id));
    const cipher = await getAlertChannelCipher(kmsService, { orgId: dto.actorOrgId, projectId: dto.projectId ?? null });
    const resourceIds = [...new Set(alerts.map((alert) => alert.resourceId ?? null))];
    const canReveal = await Promise.all(
      resourceIds.map((resourceId) =>
        $canRevealSecrets(provider, { orgId: dto.actorOrgId, projectId: dto.projectId, resourceId }, dto, options)
      )
    );
    const revealableResourceIds = new Set(resourceIds.filter((_, index) => canReveal[index]));
    const revealableAlertIds = new Set(
      alerts.filter((alert) => revealableResourceIds.has(alert.resourceId ?? null)).map((alert) => alert.id)
    );
    const details = [
      ...(await alertChannelService.getDetailsForChannels(
        channels.filter((channel) => revealableAlertIds.has(channel.alertId)),
        cipher,
        undefined,
        { revealSecrets: true }
      )),
      ...(await alertChannelService.getDetailsForChannels(
        channels.filter((channel) => !revealableAlertIds.has(channel.alertId)),
        cipher
      ))
    ];

    const lastRuns = await $getLastRuns(alerts.map((alert) => alert.id));
    const resourceNames = await $getResourceNames(
      provider,
      dto.actorOrgId,
      alerts.map((alert) => alert.resourceId)
    );

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
          .filter((detail): detail is TAlertChannelEmbedded => Boolean(detail)),
        {
          resourceName: (alert.resourceId && resourceNames.get(alert.resourceId)) || null,
          lastRun: lastRuns.get(alert.id) ?? null
        }
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
            createdByActorId: alert.createdByActorId,
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

  const updateAlert = async (dto: TUpdateAlertDTO, options: TChannelDetailsOptions = {}): Promise<TAlertResponse> => {
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

    if (dto.channels && provider.assertChannelTypesAllowed) {
      const existingTypeById = new Map(
        (await alertChannelDAL.findByAlertId(alert.id)).map((channel) => [channel.id, channel.channelType])
      );
      await provider.assertChannelTypesAllowed({
        orgId: alert.orgId,
        channelTypes: dto.channels
          .filter((channel) => !channel.id || existingTypeById.get(channel.id) !== channel.channelType)
          .map((channel) => channel.channelType)
      });
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
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx, options);
      return { updated: updatedAlert, channels: details };
    });

    const lastRuns = await $getLastRuns([alert.id]);
    return $assembleResponse(updated, channels, {
      resourceName: await $getResourceName(provider, alert),
      lastRun: lastRuns.get(alert.id) ?? null
    });
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
    resourceId: string | null;
    resourceName: string | null;
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

    const resourceName = await $getResourceName(provider, alert);
    await alertDAL.transaction((tx) => $deleteAlertsByFilter({ id: alert.id }, tx));

    return {
      id: alert.id,
      name: alert.name,
      resourceType: alert.resourceType,
      resourceId: alert.resourceId ?? null,
      resourceName,
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

  const getTelemetryEvent = (
    action: AlertTelemetryAction,
    alert: {
      resourceType: string;
      orgId: string;
      projectId: string | null;
      resourceId: string | null;
      eventType: string;
    }
  ) =>
    alertProviderRegistry.get(alert.resourceType)?.getTelemetryEvent?.({
      action,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      eventType: alert.eventType
    });

  return {
    getTelemetryEvent,
    createAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    deleteAlertsForResource,
    deleteAlertsForDeletedResource
  };
};
