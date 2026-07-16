import { z } from "zod";

import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { decryptChannelConfig, encryptChannelConfig, getAlarmChannelCipher } from "./alarm-channel-crypto-fns";
import { TAlarmChannelDALFactory } from "./alarm-channel-dal";
import { AlarmChannelType } from "./alarm-channel-types";
import { TAlarmDALFactory } from "./alarm-dal";
import { TAlarmProviderRegistry } from "./alarm-provider-registry";
import { TAlarmRecipientDALFactory } from "./alarm-recipient-dal";
import {
  TAlarmChannelInput,
  TAlarmChannelResponse,
  TAlarmResponse,
  TCreateAlarmDTO,
  TDeleteAlarmDTO,
  TGetAlarmDTO,
  TListAlarmsDTO,
  TUpdateAlarmDTO
} from "./alarm-service-types";
import { AlarmPermissionAction, AlarmPrincipalType, IResourceAlarmProvider } from "./alarm-types";
import { ALARM_CHANNEL_REGISTRY } from "./channels/alarm-channel-registry";
import { validateSlackWebhookUrl } from "./channels/alarm-channel-slack-fns";

export type TAlarmServiceFactoryDep = {
  alarmDAL: TAlarmDALFactory;
  alarmChannelDAL: Pick<TAlarmChannelDALFactory, "insertMany" | "findByAlarmId" | "deleteByAlarmId">;
  alarmRecipientDAL: Pick<TAlarmRecipientDALFactory, "insertMany" | "findByAlarmId" | "deleteByAlarmId">;
  alarmProviderRegistry: TAlarmProviderRegistry;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export type TAlarmServiceFactory = ReturnType<typeof alarmServiceFactory>;

const isValidPrincipalType = (value: string): value is AlarmPrincipalType =>
  Object.values(AlarmPrincipalType).includes(value as AlarmPrincipalType);

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const $redactChannelConfig = (channelType: string, config: Record<string, unknown>): Record<string, unknown> => {
  const definition = ALARM_CHANNEL_REGISTRY[channelType as AlarmChannelType];
  if (!definition) return {};

  const redacted: Record<string, unknown> = {};
  Object.entries(config).forEach(([key, value]) => {
    if (!definition.secretFields.includes(key)) redacted[key] = value;
  });
  definition.secretFields.forEach((field) => {
    redacted[`has${capitalize(field)}`] = Boolean(config[field]);
  });
  return redacted;
};

const $preserveChannelSecrets = (
  channelType: string,
  incomingConfig: Record<string, unknown>,
  existingConfig: Record<string, unknown>
): Record<string, unknown> => {
  const definition = ALARM_CHANNEL_REGISTRY[channelType as AlarmChannelType];
  if (!definition) return incomingConfig;

  const merged = { ...incomingConfig };
  definition.secretFields.forEach((field) => {
    const incoming = merged[field];
    if ((incoming === undefined || incoming === null || incoming === "") && existingConfig[field] != null) {
      merged[field] = existingConfig[field];
    }
  });
  return merged;
};

export const alarmServiceFactory = ({
  alarmDAL,
  alarmChannelDAL,
  alarmRecipientDAL,
  alarmProviderRegistry,
  kmsService,
  orgDAL,
  projectDAL,
  groupDAL
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
    input: {
      eventType?: string;
      condition?: unknown;
      channels?: TAlarmChannelInput[];
      recipients?: { principalType: string }[];
    }
  ) => {
    if (input.eventType && !provider.eventTypes.includes(input.eventType)) {
      throw new BadRequestError({
        message: `Event type '${input.eventType}' is not supported by resource type '${provider.resourceType}'`
      });
    }

    if (input.condition !== undefined) {
      try {
        provider.conditionSchema.parse(input.condition);
      } catch (err) {
        const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid condition";
        throw new BadRequestError({ message: `Invalid alarm condition: ${message}` });
      }
    }

    (input.recipients ?? []).forEach((recipient) => {
      if (!isValidPrincipalType(recipient.principalType)) {
        throw new BadRequestError({ message: `Invalid recipient principal type '${recipient.principalType}'` });
      }
    });

    if (input.channels) {
      if (input.channels.length === 0) {
        throw new BadRequestError({ message: "At least one channel is required" });
      }

      const hasDirected = input.channels.some((channel) => ALARM_CHANNEL_REGISTRY[channel.channelType]?.directed);
      if (hasDirected && (input.recipients ?? []).length === 0) {
        throw new BadRequestError({ message: "At least one recipient is required for email channels" });
      }

      for (const channel of input.channels) {
        const definition = ALARM_CHANNEL_REGISTRY[channel.channelType];
        if (!definition) throw new BadRequestError({ message: `Unknown channel type '${channel.channelType}'` });

        try {
          definition.configSchema.parse(channel.config);
        } catch (err) {
          const message =
            err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid channel config";
          throw new BadRequestError({ message: `Invalid ${channel.channelType} channel config: ${message}` });
        }

        if (channel.channelType === AlarmChannelType.SLACK) {
          validateSlackWebhookUrl((channel.config as { webhookUrl: string }).webhookUrl);
        }
      }
    }
  };

  const $validateRecipients = async (
    orgId: string,
    projectId: string | null | undefined,
    recipients: { principalType: string; principalId: string }[]
  ) => {
    const userIds = [
      ...new Set(
        recipients
          .filter((recipient) => recipient.principalType === AlarmPrincipalType.USER)
          .map((recipient) => recipient.principalId)
      )
    ];
    const groupIds = [
      ...new Set(
        recipients
          .filter((recipient) => recipient.principalType === AlarmPrincipalType.GROUP)
          .map((recipient) => recipient.principalId)
      )
    ];

    if (userIds.length === 0 && groupIds.length === 0) return;

    if (projectId) {
      const { effectiveUserIds, effectiveGroupIds } = await projectDAL.findEffectiveProjectSubjectsMembership({
        orgId,
        projectId,
        userIds,
        groupIds
      });
      const projectUserIds = new Set(effectiveUserIds);
      const missingUsers = userIds.filter((id) => !projectUserIds.has(id));
      if (missingUsers.length) {
        throw new BadRequestError({
          message: `Some users are not members of the project: ${missingUsers.join(", ")}`
        });
      }
      const projectGroupIds = new Set(effectiveGroupIds);
      const missingGroups = groupIds.filter((id) => !projectGroupIds.has(id));
      if (missingGroups.length) {
        throw new BadRequestError({
          message: `Some groups are not members of the project: ${missingGroups.join(", ")}`
        });
      }
      return;
    }

    if (userIds.length) {
      const memberships = await orgDAL.findMembership({ $in: { actorUserId: userIds }, scopeOrgId: orgId });
      const orgUserIds = new Set(memberships.map((membership) => membership.actorUserId));
      const missingUsers = userIds.filter((id) => !orgUserIds.has(id));
      if (missingUsers.length) {
        throw new BadRequestError({
          message: `Some users are not members of the organization: ${missingUsers.join(", ")}`
        });
      }
    }

    if (groupIds.length) {
      const orgGroups = await groupDAL.find({ $in: { id: groupIds }, orgId });
      const orgGroupIds = new Set(orgGroups.map((group) => group.id));
      const missingGroups = groupIds.filter((id) => !orgGroupIds.has(id));
      if (missingGroups.length) {
        throw new BadRequestError({
          message: `Some groups are not part of the organization: ${missingGroups.join(", ")}`
        });
      }
    }
  };

  const $formatResponse = async (alarmId: string): Promise<TAlarmResponse> => {
    const alarm = await alarmDAL.findById(alarmId);
    if (!alarm) throw new NotFoundError({ message: `Alarm with ID '${alarmId}' not found` });

    const [channels, recipients] = await Promise.all([
      alarmChannelDAL.findByAlarmId(alarmId),
      alarmRecipientDAL.findByAlarmId(alarmId)
    ]);

    const { decryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: alarm.orgId,
      projectId: alarm.projectId
    });

    const channelResponses: TAlarmChannelResponse[] = channels.map((channel) => {
      const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);

      return {
        id: channel.id,
        channelType: channel.channelType,
        config: $redactChannelConfig(channel.channelType, config),
        enabled: channel.enabled,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt
      };
    });

    return {
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
      recipients: recipients.map((recipient) => ({
        principalType: recipient.principalType,
        principalId: recipient.principalId
      })),
      channels: channelResponses,
      createdAt: alarm.createdAt,
      updatedAt: alarm.updatedAt
    };
  };

  const createAlarm = async (dto: TCreateAlarmDTO): Promise<TAlarmResponse> => {
    const provider = $getProvider(dto.resourceType);
    $validate(provider, dto);

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

    await $validateRecipients(dto.actorOrgId, dto.projectId, dto.recipients);

    const { encryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId
    });

    const alarm = await alarmDAL.transaction(async (tx) => {
      const created = await alarmDAL.create(
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

      await alarmChannelDAL.insertMany(
        dto.channels.map((channel) => ({
          alarmId: created.id,
          channelType: channel.channelType,
          encryptedConfig: encryptChannelConfig(channel.config, encryptor),
          enabled: channel.enabled ?? true
        })),
        tx
      );

      await alarmRecipientDAL.insertMany(
        dto.recipients.map((recipient) => ({
          alarmId: created.id,
          principalType: recipient.principalType,
          principalId: recipient.principalId
        })),
        tx
      );

      return created;
    });

    return $formatResponse(alarm.id);
  };

  const getAlarmById = async (dto: TGetAlarmDTO): Promise<TAlarmResponse> => {
    const alarm = await alarmDAL.findById(dto.alarmId);
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

    return $formatResponse(alarm.id);
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

    const alarms = await alarmDAL.find({
      orgId: dto.actorOrgId,
      resourceType: dto.resourceType,
      ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
      projectId: dto.projectId ?? null,
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });

    return Promise.all(alarms.map((alarm) => $formatResponse(alarm.id)));
  };

  const updateAlarm = async (dto: TUpdateAlarmDTO): Promise<TAlarmResponse> => {
    const alarm = await alarmDAL.findById(dto.alarmId);
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

    const { encryptor, decryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: alarm.orgId,
      projectId: alarm.projectId
    });

    let resolvedChannels: TAlarmChannelInput[] | undefined;
    if (dto.channels) {
      const existingById = new Map(
        (await alarmChannelDAL.findByAlarmId(alarm.id)).map((channel) => [channel.id, channel])
      );
      resolvedChannels = dto.channels.map((channel) => {
        const existing = channel.id ? existingById.get(channel.id) : undefined;
        if (!existing || existing.channelType !== channel.channelType) return channel;
        const existingConfig = decryptChannelConfig<Record<string, unknown>>(existing.encryptedConfig, decryptor);
        return {
          ...channel,
          config: $preserveChannelSecrets(
            channel.channelType,
            channel.config as Record<string, unknown>,
            existingConfig
          )
        };
      });
    }

    $validate(provider, {
      condition: dto.condition,
      channels: resolvedChannels,
      recipients: dto.recipients ?? (resolvedChannels ? [] : undefined)
    });

    if (dto.recipients) await $validateRecipients(alarm.orgId, alarm.projectId, dto.recipients);

    await alarmDAL.transaction(async (tx) => {
      await alarmDAL.updateById(
        alarm.id,
        {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.condition !== undefined
            ? { condition: dto.condition != null ? JSON.stringify(dto.condition) : null }
            : {}),
          ...(dto.filters !== undefined ? { filters: dto.filters != null ? JSON.stringify(dto.filters) : null } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
        },
        tx
      );

      if (resolvedChannels) {
        await alarmChannelDAL.deleteByAlarmId(alarm.id, tx);
        await alarmChannelDAL.insertMany(
          resolvedChannels.map((channel) => ({
            alarmId: alarm.id,
            channelType: channel.channelType,
            encryptedConfig: encryptChannelConfig(channel.config, encryptor),
            enabled: channel.enabled ?? true
          })),
          tx
        );
      }

      if (dto.recipients) {
        await alarmRecipientDAL.deleteByAlarmId(alarm.id, tx);
        await alarmRecipientDAL.insertMany(
          dto.recipients.map((recipient) => ({
            alarmId: alarm.id,
            principalType: recipient.principalType,
            principalId: recipient.principalId
          })),
          tx
        );
      }
    });

    return $formatResponse(alarm.id);
  };

  const deleteAlarm = async (dto: TDeleteAlarmDTO): Promise<{ id: string }> => {
    const alarm = await alarmDAL.findById(dto.alarmId);
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

  return {
    createAlarm,
    getAlarmById,
    listAlarms,
    updateAlarm,
    deleteAlarm
  };
};
