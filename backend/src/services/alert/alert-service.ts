import { Knex } from "knex";
import { z } from "zod";

import { TableName, TAlertChannels, TAlerts, TAlertsInsert } from "@app/db/schemas";
import { Event as TAuditEvent, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { TAlertChannelServiceFactory } from "./alert-channel-service";
import {
  TAlertChannelEmbedded,
  TAlertChannelInput,
  TChannelRecipientInput,
  TPreparedChannelCreate,
  TPreparedChannelUpdate
} from "./alert-channel-service-types";
import { AlertChannelType } from "./alert-channel-types";
import { TAlertDALFactory, TAlertWithChannels } from "./alert-dal";
import { TAlertHistoryDALFactory } from "./alert-history-dal";
import { getRecipientScope } from "./alert-principal-scope-fns";
import {
  getAlertEvent,
  getAlertResourceName,
  resolveAlertProjectId,
  TAlertProviderRegistry
} from "./alert-provider-registry";
import {
  TAlertLastRun,
  TAlertResponse,
  TCreateAlertDTO,
  TDeleteAlertDTO,
  TGetAlertDTO,
  TListAlertsDTO,
  TPrepareAlertForResourceDTO,
  TUpdateAlertDTO
} from "./alert-service-types";
import {
  AlertAuditAction,
  AlertPermissionAction,
  AlertPrincipalType,
  AlertRunStatus,
  AlertTelemetryAction,
  IResourceAlertProvider,
  MAX_CHANNELS_PER_ALERT,
  MAX_RECIPIENTS_PER_CHANNEL,
  TAlertAuditInput,
  TAlertEventDefinition,
  TAlertFilters,
  toAlertActor
} from "./alert-types";

export type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId" | "findByAlertIds" | "delete" | "create">;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "insertMany">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "findByChannelIds" | "insertMany">;
  alertChannelService: Pick<
    TAlertChannelServiceFactory,
    | "prepareChannelCreate"
    | "applyChannelCreate"
    | "prepareChannelUpdate"
    | "applyChannelUpdate"
    | "deleteChannel"
    | "getDetailsForChannels"
    | "filterRecipientsInScope"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertHistoryDAL: Pick<TAlertHistoryDALFactory, "findLatestByAlertIds">;
};

export type TAlertServiceFactory = ReturnType<typeof alertServiceFactory>;

// An alert write that has passed every check and is ready to be written.
type TAlertWritePlan =
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

// What prepareAlertForResource returns. Its contents belong to this module: a caller only hands it back
// to applyPreparedAlert, inside the caller's own transaction.
const PREPARED_ALERT = Symbol("prepared alert");
export type TPreparedAlert = { readonly [PREPARED_ALERT]: TAlertWritePlan };

const getAuditEvent = (input: TAlertAuditInput): TAuditEvent => {
  if (input.action === AlertAuditAction.TestChannel) {
    const { test } = input;
    return {
      type: EventType.TEST_ALERT_CHANNEL,
      metadata: {
        channelId: test.channelId,
        channelType: test.channelType,
        resourceType: test.resourceType,
        resourceId: test.resourceId,
        resourceName: test.resourceName,
        success: test.success,
        deliveredTo: test.deliveredTo,
        error: test.error
      }
    };
  }
  const { alert } = input;
  const metadata = {
    alertId: alert.id,
    name: alert.name,
    resourceType: alert.resourceType,
    resourceId: alert.resourceId,
    resourceName: alert.resourceName ?? null,
    eventType: alert.eventType
  };
  if (input.action === AlertAuditAction.Create) return { type: EventType.CREATE_ALERT, metadata };
  if (input.action === AlertAuditAction.Update) return { type: EventType.UPDATE_ALERT, metadata };
  return { type: EventType.DELETE_ALERT, metadata };
};

export const alertServiceFactory = ({
  alertDAL,
  alertChannelDAL,
  alertChannelMembershipDAL,
  alertChannelRecipientDAL,
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

  const $parseCondition = (event: TAlertEventDefinition, condition: unknown): unknown => {
    try {
      return event.conditionSchema.parse(condition);
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid condition";
      throw new BadRequestError({ message: `Invalid alert condition: ${message}` });
    }
  };

  const $assertChannelCount = (count: number) => {
    if (count > MAX_CHANNELS_PER_ALERT) {
      throw new BadRequestError({
        message: `An alert can have at most ${MAX_CHANNELS_PER_ALERT} channels, and this would leave it with ${count}`
      });
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

  const $getResourceName = (provider: IResourceAlertProvider, alert: Pick<TAlerts, "orgId" | "resourceId">) =>
    getAlertResourceName(provider, alert.orgId, alert.resourceId);

  const $getLastRuns = async (
    provider: IResourceAlertProvider,
    alertIds: string[]
  ): Promise<Map<string, TAlertLastRun>> => {
    if (!provider.includeLastRun) return new Map();
    const runs = await alertHistoryDAL.findLatestByAlertIds(alertIds);
    return new Map(
      runs
        .filter((run) => run.triggeredAt)
        .map((run) => [run.alertId, { timestamp: run.triggeredAt as Date, status: run.status as AlertRunStatus }])
    );
  };

  const $getFilters = async (
    provider: IResourceAlertProvider,
    scope: { orgId: string; projectId: string | null },
    alerts: Pick<TAlerts, "id" | "condition">[]
  ): Promise<Map<string, TAlertFilters>> => {
    if (!provider.getFilters || alerts.length === 0) return new Map();
    return provider.getFilters({
      ...scope,
      alerts: alerts.map((alert) => ({ id: alert.id, condition: alert.condition }))
    });
  };

  const $assembleResponse = (
    provider: IResourceAlertProvider,
    alert: TAlerts,
    channels: TAlertChannelEmbedded[],
    extras: { resourceName: string | null; lastRun?: TAlertLastRun; filters?: TAlertFilters }
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
    ...(provider.getResourceNames ? { resourceName: extras.resourceName } : {}),
    ...(provider.getFilters ? { filters: extras.filters ?? {} } : {}),
    channels,
    ...(provider.includeLastRun ? { lastRun: extras.lastRun ?? null } : {}),
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt
  });

  const $prepareCreate = async (dto: TCreateAlertDTO) => {
    const provider = $getProvider(dto.resourceType);
    if (!dto.resourceId && !provider.supportsScopeWideAlerts) {
      throw new BadRequestError({
        message: `Alerts for resource type '${dto.resourceType}' must be bound to a specific resource. Pass resourceId.`
      });
    }

    const projectId = await resolveAlertProjectId(provider, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId
    });

    const event = getAlertEvent(provider, dto.eventType);
    const condition = $parseCondition(event, dto.condition);

    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Create,
      { orgId: dto.actorOrgId, projectId, resourceId: dto.resourceId },
      dto
    );

    await provider.assertResourceInScope({
      orgId: dto.actorOrgId,
      projectId,
      resourceId: dto.resourceId
    });

    await provider.assertConditionInScope?.({ projectId, resourceId: dto.resourceId, condition });

    if (dto.resourceId) {
      const duplicate = await alertDAL.findScopedDuplicate({
        orgId: dto.actorOrgId,
        projectId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        eventType: dto.eventType
      });
      if (duplicate) {
        throw new BadRequestError({ message: "An alert for this resource and event already exists" });
      }
    }

    if (!dto.channels || dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }
    $assertChannelCount(dto.channels.length);

    await provider.assertChannelTypesAllowed?.({
      orgId: dto.actorOrgId,
      channelTypes: dto.channels.map((channel) => channel.channelType)
    });

    const scope = { orgId: dto.actorOrgId, projectId: projectId ?? null };
    const cipher = await getAlertChannelCipher(kmsService, scope);
    const recipientScope = getRecipientScope(provider, projectId);

    const channels: TPreparedChannelCreate[] = [];
    for (const channelInput of dto.channels) {
      // eslint-disable-next-line no-await-in-loop -- each channel's recipients are checked in turn
      const prepared = await alertChannelService.prepareChannelCreate(
        {
          name: channelInput.name,
          channelType: channelInput.channelType,
          config: channelInput.config ?? {},
          enabled: channelInput.enabled,
          recipients: channelInput.recipients,
          orgId: dto.actorOrgId,
          projectId: projectId ?? null,
          recipientScope,
          createdByActorId: dto.actorId,
          createdByActorType: dto.actor
        },
        cipher.encryptor
      );
      channels.push(prepared);
    }

    const plan: TAlertWritePlan = {
      kind: "create",
      alert: {
        name: dto.name,
        description: dto.description,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        eventType: dto.eventType,
        triggerType: event.triggerType,
        condition: condition != null ? JSON.stringify(condition) : null,
        enabled: dto.enabled ?? true,
        orgId: dto.actorOrgId,
        projectId,
        createdByActorId: dto.actorId,
        createdByActorType: dto.actor
      },
      channels
    };
    return { plan, provider, cipher };
  };

  const $prepareUpdate = async (alert: TAlerts, dto: TUpdateAlertDTO) => {
    const provider = $getProvider(alert.resourceType);
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Edit,
      { orgId: alert.orgId, projectId: alert.projectId, resourceId: alert.resourceId },
      dto
    );

    let condition: unknown;
    if (dto.condition !== undefined) {
      condition = $parseCondition(getAlertEvent(provider, alert.eventType), dto.condition);
      await provider.assertConditionInScope?.({
        projectId: alert.projectId,
        resourceId: alert.resourceId,
        condition,
        previousCondition: alert.condition
      });
    }
    if (dto.channels !== undefined && dto.channels.length === 0) {
      throw new BadRequestError({ message: "At least one channel is required" });
    }
    if (dto.channels !== undefined) $assertChannelCount(dto.channels.length);

    // Read from the primary: the plan below decides which channels to keep, update or delete, and is
    // applied later in the caller's transaction.
    const existing = await alertChannelDAL.findByAlertId(alert.id, { readFromPrimary: true });
    const existingById = new Map<string, TAlertChannels>(existing.map((channel) => [channel.id, channel]));

    if (dto.channels && provider.assertChannelTypesAllowed) {
      await provider.assertChannelTypesAllowed({
        orgId: alert.orgId,
        channelTypes: dto.channels
          .filter((channel) => {
            const existingChannel = channel.id ? existingById.get(channel.id) : undefined;
            return (
              !existingChannel ||
              existingChannel.channelType !== channel.channelType ||
              (!existingChannel.enabled && channel.enabled === true)
            );
          })
          .map((channel) => channel.channelType)
      });
    }

    const scope = { orgId: alert.orgId, projectId: alert.projectId };
    const cipher = await getAlertChannelCipher(kmsService, scope);

    const deleteChannelIds: string[] = [];
    const channelUpdates: TPreparedChannelUpdate[] = [];
    const channelCreates: TPreparedChannelCreate[] = [];
    if (dto.channels !== undefined) {
      const recipientScope = getRecipientScope(provider, alert.projectId);
      const incomingIds = new Set(dto.channels.filter((channel) => channel.id).map((channel) => channel.id as string));
      for (const id of incomingIds) {
        if (!existingById.has(id)) {
          throw new BadRequestError({ message: `Channel '${id}' does not belong to this alert` });
        }
      }
      existing
        .filter((channel) => !incomingIds.has(channel.id))
        .forEach((channel) => deleteChannelIds.push(channel.id));

      for (const channelInput of dto.channels) {
        if (channelInput.id) {
          // eslint-disable-next-line no-await-in-loop -- each channel's recipients are checked in turn
          const prepared = await alertChannelService.prepareChannelUpdate(
            {
              channelId: channelInput.id,
              channelType: channelInput.channelType,
              name: channelInput.name,
              config: channelInput.config,
              enabled: channelInput.enabled,
              recipients: channelInput.recipients,
              recipientScope
            },
            existingById.get(channelInput.id) as TAlertChannels,
            cipher
          );
          channelUpdates.push(prepared);
        } else {
          // eslint-disable-next-line no-await-in-loop -- each channel's recipients are checked in turn
          const prepared = await alertChannelService.prepareChannelCreate(
            {
              name: channelInput.name,
              channelType: channelInput.channelType,
              config: channelInput.config ?? {},
              enabled: channelInput.enabled,
              recipients: channelInput.recipients,
              orgId: alert.orgId,
              projectId: alert.projectId,
              recipientScope,
              createdByActorId: alert.createdByActorId ?? null,
              createdByActorType: alert.createdByActorType
            },
            cipher.encryptor
          );
          channelCreates.push(prepared);
        }
      }
    }

    const plan: TAlertWritePlan = {
      kind: "update",
      alert,
      patch: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.condition !== undefined ? { condition: condition != null ? JSON.stringify(condition) : null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
      },
      deleteChannelIds,
      channelUpdates,
      channelCreates
    };
    return { plan, provider, cipher };
  };

  // Everything that can be refused was checked while preparing, so this only writes.
  const $applyPlan = async (plan: TAlertWritePlan, tx: Knex): Promise<TAlerts> => {
    if (plan.kind === "create") {
      let createdAlert: TAlerts;
      try {
        createdAlert = await alertDAL.create(plan.alert, tx);
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
      for (const prepared of plan.channels) {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        const channel = await alertChannelService.applyChannelCreate(prepared, tx);
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: createdAlert.id, channelId: channel.id }], tx);
      }
      return createdAlert;
    }

    // The plan was built from a read taken before this transaction, so two overlapping saves could each
    // delete or overwrite the other's channels. The table's update trigger bumps updatedAt on every write,
    // so it works as a version: refuse if it moved, and write the row so a save still in flight sees this one.
    const current = await alertDAL.findByIdForUpdate(plan.alert.id, tx);
    if (!current) throw new NotFoundError({ message: `Alert with ID '${plan.alert.id}' not found` });
    if (current.updatedAt.getTime() !== plan.alert.updatedAt.getTime()) {
      throw new ConflictError({ message: "This alert was changed while you were saving it. Reload and try again." });
    }
    const updatedAlert =
      Object.keys(plan.patch).length > 0
        ? await alertDAL.updateById(plan.alert.id, plan.patch, tx)
        : await alertDAL.touchById(plan.alert.id, tx);
    for (const channelId of plan.deleteChannelIds) {
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      await alertChannelService.deleteChannel(channelId, tx);
    }
    for (const prepared of plan.channelUpdates) {
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      await alertChannelService.applyChannelUpdate(prepared, tx);
    }
    for (const prepared of plan.channelCreates) {
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      const channel = await alertChannelService.applyChannelCreate(prepared, tx);
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      await alertChannelMembershipDAL.insertMany([{ alertId: plan.alert.id, channelId: channel.id }], tx);
    }
    return updatedAlert;
  };

  // Spreads recipients over as many channels of one type as they need, reusing that type's existing channels
  // in order so their ids, names and settings survive, and keeps every other channel as it is.
  const $channelsWithRecipients = (
    existing: TAlertWithChannels | undefined,
    { channelType, recipients }: { channelType: AlertChannelType; recipients: TChannelRecipientInput[] }
  ): TAlertChannelInput[] => {
    const sameType = existing?.channels.filter((channel) => channel.channelType === channelType) ?? [];
    const label = channelType.charAt(0).toUpperCase() + channelType.slice(1);

    const replaced: TAlertChannelInput[] = [];
    for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_CHANNEL) {
      const index = replaced.length;
      replaced.push({
        ...(sameType[index] ? { id: sameType[index].id } : {}),
        name: sameType[index]?.name ?? (index === 0 ? label : `${label} ${index + 1}`),
        channelType,
        recipients: recipients.slice(i, i + MAX_RECIPIENTS_PER_CHANNEL)
      });
    }

    const others: TAlertChannelInput[] = (existing?.channels ?? [])
      .filter((channel) => channel.channelType !== channelType)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType as AlertChannelType,
        enabled: channel.enabled
      }));

    return [...replaced, ...others];
  };

  // For a service that keeps one alert on each of its own resources (eg a secret's reminder): creates it or
  // updates it, with every check the alert API runs, and returns it ready for applyPreparedAlert inside the
  // caller's transaction. Nothing is written here.
  const prepareAlertForResource = async (dto: TPrepareAlertForResourceDTO): Promise<TPreparedAlert> => {
    const { resourceType, resourceId, projectId, eventType, name, channels, ...actor } = dto;
    const [existing] = await alertDAL.findWithChannelsForResources({ resourceType, resourceIds: [resourceId] });
    const alertChannels =
      "replaceAll" in channels ? channels.replaceAll : $channelsWithRecipients(existing, channels.replaceRecipients);

    const { plan } = existing
      ? await $prepareUpdate(existing, { alertId: existing.id, name, channels: alertChannels, ...actor })
      : await $prepareCreate({
          name,
          resourceType,
          resourceId,
          eventType,
          condition: null,
          projectId,
          channels: alertChannels,
          ...actor
        });
    return { [PREPARED_ALERT]: plan };
  };

  const applyPreparedAlert = async (prepared: TPreparedAlert, tx: Knex): Promise<void> => {
    await $applyPlan(prepared[PREPARED_ALERT], tx);
  };

  const createAlert = async (dto: TCreateAlertDTO): Promise<TAlertResponse> => {
    const { plan, provider, cipher } = await $prepareCreate(dto);

    const { created, channels } = await alertDAL.transaction(async (tx) => {
      const createdAlert = await $applyPlan(plan, tx);
      const attachedChannels = await alertChannelDAL.findByAlertId(createdAlert.id, {}, tx);
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
      return { created: createdAlert, channels: details };
    });

    const filters = await $getFilters(provider, { orgId: created.orgId, projectId: created.projectId ?? null }, [
      created
    ]);
    return $assembleResponse(provider, created, channels, {
      resourceName: await $getResourceName(provider, created),
      filters: filters.get(created.id)
    });
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
    const lastRuns = await $getLastRuns(provider, [alert.id]);
    const filters = await $getFilters(provider, { orgId: alert.orgId, projectId: alert.projectId ?? null }, [alert]);
    return $assembleResponse(provider, alert, details, {
      resourceName: await $getResourceName(provider, alert),
      lastRun: lastRuns.get(alert.id),
      filters: filters.get(alert.id)
    });
  };

  const listAlerts = async (dto: TListAlertsDTO): Promise<TAlertResponse[]> => {
    const provider = $getProvider(dto.resourceType);
    const projectId = await resolveAlertProjectId(provider, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId
    });
    await $assertAlertPermission(
      provider,
      AlertPermissionAction.Read,
      { orgId: dto.actorOrgId, projectId, resourceId: dto.resourceId },
      dto
    );

    const alerts = await alertDAL.findActiveByScope({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId ?? (provider.supportsScopeWideAlerts ? null : undefined),
      projectId,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
    if (alerts.length === 0) return [];

    const channels = await alertChannelDAL.findByAlertIds(alerts.map((alert) => alert.id));
    const cipher = await getAlertChannelCipher(kmsService, { orgId: dto.actorOrgId, projectId });
    const details = await alertChannelService.getDetailsForChannels(channels, cipher);

    const lastRuns = await $getLastRuns(
      provider,
      alerts.map((alert) => alert.id)
    );
    const filters = await $getFilters(provider, { orgId: dto.actorOrgId, projectId }, alerts);
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
        provider,
        alert,
        (channelIdsByAlert.get(alert.id) ?? [])
          .map((id) => detailById.get(id))
          .filter((detail): detail is TAlertChannelEmbedded => Boolean(detail)),
        {
          resourceName: (alert.resourceId && resourceNames.get(alert.resourceId)) || null,
          lastRun: lastRuns.get(alert.id),
          filters: filters.get(alert.id)
        }
      )
    );
  };

  const updateAlert = async (dto: TUpdateAlertDTO): Promise<TAlertResponse> => {
    // Read from the primary: the update plan is built from this row and its channels.
    const alert = await alertDAL.findActiveById(dto.alertId, { readFromPrimary: true });
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${dto.alertId}' not found` });
    const { plan, provider, cipher } = await $prepareUpdate(alert, dto);

    const { updated, channels } = await alertDAL.transaction(async (tx) => {
      const updatedAlert = await $applyPlan(plan, tx);
      const attachedChannels = await alertChannelDAL.findByAlertId(updatedAlert.id, {}, tx);
      const details = await alertChannelService.getDetailsForChannels(attachedChannels, cipher, tx);
      return { updated: updatedAlert, channels: details };
    });

    const lastRuns = await $getLastRuns(provider, [updated.id]);
    const filters = await $getFilters(provider, { orgId: updated.orgId, projectId: updated.projectId ?? null }, [
      updated
    ]);
    return $assembleResponse(provider, updated, channels, {
      resourceName: await $getResourceName(provider, updated),
      lastRun: lastRuns.get(updated.id),
      filters: filters.get(updated.id)
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
    condition: unknown;
    filters?: TAlertFilters;
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
    const filters = await $getFilters(provider, { orgId: alert.orgId, projectId: alert.projectId ?? null }, [alert]);
    await alertDAL.transaction((tx) => $deleteAlertsByFilter({ id: alert.id }, tx));

    return {
      id: alert.id,
      name: alert.name,
      resourceType: alert.resourceType,
      resourceId: alert.resourceId ?? null,
      resourceName,
      eventType: alert.eventType,
      condition: alert.condition ?? null,
      ...(provider.getFilters ? { filters: filters.get(alert.id) ?? {} } : {}),
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
  const moveAlertsToResource = async (
    {
      resourceType,
      fromResourceId,
      toResourceId
    }: { resourceType: string; fromResourceId: string; toResourceId: string },
    tx: Knex
  ): Promise<void> => {
    await alertDAL.update({ resourceType, resourceId: fromResourceId }, { resourceId: toResourceId }, tx);
  };

  // For a resource recreated under a new id in the same project while the original stays (eg a secret moved
  // out of a folder whose approval policy holds the source until the request merges), so both keep working
  // alerts. Channel configs are copied still encrypted, which is only valid because both ids share the
  // project's cipher, so only that project's alerts are copied. No KMS call, so it is safe in the caller's
  // transaction.
  const copyAlertsToResource = async (
    {
      resourceType,
      projectId,
      fromResourceId,
      toResourceId
    }: { resourceType: string; projectId: string; fromResourceId: string; toResourceId: string },
    tx: Knex
  ): Promise<void> => {
    const alerts = await alertDAL.find({ resourceType, resourceId: fromResourceId, projectId }, { tx });
    if (alerts.length === 0) return;

    const channels = await alertChannelDAL.findByAlertIds(
      alerts.map((alert) => alert.id),
      tx
    );
    const recipients = await alertChannelRecipientDAL.findByChannelIds(
      channels.map((channel) => channel.id),
      tx
    );

    for (const alert of alerts) {
      const { id: alertId, createdAt, updatedAt, condition, ...alertFields } = alert;
      // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
      const copiedAlert = await alertDAL.create(
        {
          ...alertFields,
          resourceId: toResourceId,
          condition: condition != null ? JSON.stringify(condition) : null
        },
        tx
      );
      for (const channel of channels.filter((row) => row.alertId === alertId)) {
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        const copiedChannel = await alertChannelDAL.create(
          {
            name: channel.name,
            channelType: channel.channelType,
            encryptedConfig: channel.encryptedConfig,
            enabled: channel.enabled,
            orgId: channel.orgId,
            projectId: channel.projectId,
            createdByActorId: channel.createdByActorId,
            createdByActorType: channel.createdByActorType
          },
          tx
        );
        // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
        await alertChannelMembershipDAL.insertMany([{ alertId: copiedAlert.id, channelId: copiedChannel.id }], tx);
        const channelRecipients = recipients.filter((recipient) => recipient.channelId === channel.id);
        if (channelRecipients.length > 0) {
          // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes must be serial
          await alertChannelRecipientDAL.insertMany(
            channelRecipients.map(({ principalType, principalId }) => ({
              channelId: copiedChannel.id,
              principalType,
              principalId
            })),
            tx
          );
        }
      }
    }
  };

  const findOrphanedResourceIds = (
    input: { resourceType: string; resourceTable: TableName; limit: number },
    tx?: Knex
  ) => alertDAL.findOrphanedResourceIds(input, tx);

  const findRecipientsForResources = (
    input: {
      resourceType: string;
      resourceIds: string[];
      channelType: AlertChannelType;
      principalType: AlertPrincipalType;
    },
    tx?: Knex
  ) => alertDAL.findRecipientsForResources(input, tx);

  const filterRecipientsInScope = (
    scope: { orgId: string; projectId?: string | null },
    recipients: TChannelRecipientInput[],
    tx?: Knex
  ) => alertChannelService.filterRecipientsInScope(scope, recipients, tx);

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
    getAuditEvent,
    createAlert,
    prepareAlertForResource,
    applyPreparedAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    deleteAlertsForResource,
    deleteAlertsForDeletedResource,
    deleteAlertsForDeletedResources,
    moveAlertsToResource,
    copyAlertsToResource,
    findRecipientsForResources,
    findOrphanedResourceIds,
    filterRecipientsInScope
  };
};
