import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { decryptChannelConfig, encryptChannelConfig, getAlarmChannelCipher } from "./alarm-channel-crypto-fns";
import { TAlarmChannelDALFactory } from "./alarm-channel-dal";
import { TAlarmChannelMembershipDALFactory } from "./alarm-channel-membership-dal";
import { TAlarmChannelRecipientDALFactory } from "./alarm-channel-recipient-dal";
import {
  TAlarmChannelDetail,
  TChannelRecipientInput,
  TCreateAlarmChannelDTO,
  TDeleteAlarmChannelDTO,
  TGetAlarmChannelDTO,
  TListAlarmChannelsDTO,
  TUpdateAlarmChannelDTO
} from "./alarm-channel-service-types";
import { AlarmChannelType } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";
import { ALARM_CHANNEL_REGISTRY } from "./channels/alarm-channel-registry";

export type TAlarmChannelServiceFactoryDep = {
  alarmChannelDAL: TAlarmChannelDALFactory;
  alarmChannelRecipientDAL: TAlarmChannelRecipientDALFactory;
  alarmChannelMembershipDAL: Pick<TAlarmChannelMembershipDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export type TAlarmChannelServiceFactory = ReturnType<typeof alarmChannelServiceFactory>;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const alarmChannelServiceFactory = ({
  alarmChannelDAL,
  alarmChannelRecipientDAL,
  alarmChannelMembershipDAL,
  kmsService,
  permissionService,
  orgDAL,
  projectDAL,
  groupDAL
}: TAlarmChannelServiceFactoryDep) => {
  const $getDefinition = (channelType: string) => {
    const definition = ALARM_CHANNEL_REGISTRY[channelType as AlarmChannelType];
    if (!definition) throw new BadRequestError({ message: `Unknown channel type '${channelType}'` });
    return definition;
  };

  const $assertPermission = async (
    action: OrgPermissionActions,
    orgId: string,
    projectId: string | null | undefined,
    actor: TGenericPermission
  ) => {
    if (projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.actor,
        actorId: actor.actorId,
        projectId,
        actorAuthMethod: actor.actorAuthMethod,
        actorOrgId: actor.actorOrgId,
        actionProjectType: ActionProjectType.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(
        action as unknown as ProjectPermissionActions,
        ProjectPermissionSub.Settings
      );
      return;
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.actor,
      actorId: actor.actorId,
      orgId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Settings);
  };

  // Confirms every recipient principal (user/group) actually belongs to the channel's scope so an
  // alarm can't be made to notify a foreign principal.
  const $validateRecipients = async (
    orgId: string,
    projectId: string | null | undefined,
    recipients: TChannelRecipientInput[]
  ) => {
    const userIds = [
      ...new Set(recipients.filter((r) => r.principalType === AlarmPrincipalType.USER).map((r) => r.principalId))
    ];
    const groupIds = [
      ...new Set(recipients.filter((r) => r.principalType === AlarmPrincipalType.GROUP).map((r) => r.principalId))
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
        throw new BadRequestError({ message: `Some users are not members of the project: ${missingUsers.join(", ")}` });
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
      const orgUserIds = new Set(memberships.map((m) => m.actorUserId));
      const missingUsers = userIds.filter((id) => !orgUserIds.has(id));
      if (missingUsers.length) {
        throw new BadRequestError({
          message: `Some users are not members of the organization: ${missingUsers.join(", ")}`
        });
      }
    }

    if (groupIds.length) {
      const orgGroups = await groupDAL.find({ $in: { id: groupIds }, orgId });
      const orgGroupIds = new Set(orgGroups.map((g) => g.id));
      const missingGroups = groupIds.filter((id) => !orgGroupIds.has(id));
      if (missingGroups.length) {
        throw new BadRequestError({
          message: `Some groups are not part of the organization: ${missingGroups.join(", ")}`
        });
      }
    }
  };

  const $redactConfig = (channelType: string, config: Record<string, unknown>): Record<string, unknown> => {
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

  // Three-state merge of secret fields on update:
  //   - field omitted        -> keep the existing secret
  //   - field empty / null   -> clear it (valid only for optional secrets; the config schema rejects
  //                             clearing a required secret)
  //   - field with a value   -> set the new secret
  const $mergeConfigForUpdate = (
    channelType: string,
    incomingConfig: Record<string, unknown>,
    existingConfig: Record<string, unknown>
  ): Record<string, unknown> => {
    const definition = ALARM_CHANNEL_REGISTRY[channelType as AlarmChannelType];
    if (!definition) return incomingConfig;

    const merged: Record<string, unknown> = { ...incomingConfig };
    definition.secretFields.forEach((field) => {
      if (!(field in incomingConfig)) {
        if (existingConfig[field] != null) merged[field] = existingConfig[field];
        return;
      }
      const value = incomingConfig[field];
      if (value === "" || value === null || value === undefined) delete merged[field];
    });
    return merged;
  };

  const $countUsage = async (channelId: string): Promise<number> => {
    const memberships = await alarmChannelMembershipDAL.find({ channelId });
    return memberships.length;
  };

  const $buildDetail = (
    channel: {
      id: string;
      name: string;
      channelType: string;
      enabled: boolean;
      orgId: string;
      projectId?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    config: Record<string, unknown>,
    recipients: { principalType: string; principalId: string }[],
    usageCount: number
  ): TAlarmChannelDetail => {
    const definition = ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType];
    return {
      id: channel.id,
      name: channel.name,
      channelType: channel.channelType,
      directed: Boolean(definition?.directed),
      config: $redactConfig(channel.channelType, config),
      enabled: channel.enabled,
      recipients,
      usageCount,
      orgId: channel.orgId,
      projectId: channel.projectId ?? null,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt
    };
  };

  const $assertNameAvailable = async (
    name: string,
    scope: { orgId: string; projectId?: string | null },
    excludeId?: string
  ) => {
    const existing = await alarmChannelDAL.findByNameInScope(name, scope);
    if (existing && existing.id !== excludeId) {
      throw new BadRequestError({ message: `A channel named '${name}' already exists in this scope` });
    }
  };

  const createChannel = async (dto: TCreateAlarmChannelDTO): Promise<TAlarmChannelDetail> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    await $assertPermission(OrgPermissionActions.Create, dto.actorOrgId, dto.projectId, actor);

    const definition = $getDefinition(dto.channelType);
    const recipients = dto.recipients ?? [];
    if (!definition.directed && recipients.length > 0) {
      throw new BadRequestError({ message: `${dto.channelType} channels do not take recipients` });
    }
    if (definition.directed && recipients.length === 0) {
      throw new BadRequestError({ message: `${dto.channelType} channels require at least one recipient` });
    }

    try {
      definition.configSchema.parse(dto.config);
    } catch (err) {
      throw new BadRequestError({ message: `Invalid ${dto.channelType} channel config` });
    }

    await $assertNameAvailable(dto.name, { orgId: dto.actorOrgId, projectId: dto.projectId });
    await $validateRecipients(dto.actorOrgId, dto.projectId, recipients);

    const { encryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId ?? null
    });

    const channel = await alarmChannelDAL.transaction(async (tx) => {
      const created = await alarmChannelDAL.create(
        {
          name: dto.name,
          channelType: dto.channelType,
          encryptedConfig: encryptChannelConfig(dto.config, encryptor),
          enabled: dto.enabled ?? true,
          orgId: dto.actorOrgId,
          projectId: dto.projectId ?? null,
          createdByUserId: dto.actorId
        },
        tx
      );

      if (recipients.length) {
        await alarmChannelRecipientDAL.insertMany(
          recipients.map((r) => ({
            channelId: created.id,
            principalType: r.principalType,
            principalId: r.principalId
          })),
          tx
        );
      }
      return created;
    });

    return $buildDetail(channel, dto.config, recipients, 0);
  };

  const updateChannel = async (dto: TUpdateAlarmChannelDTO): Promise<TAlarmChannelDetail> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };

    const channel = await alarmChannelDAL.findById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Edit, channel.orgId, channel.projectId, actor);

    const definition = $getDefinition(channel.channelType);
    const scope = { orgId: channel.orgId, projectId: channel.projectId };

    const { encryptor, decryptor } = await getAlarmChannelCipher(kmsService, scope);
    const existingConfig = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);

    let finalConfig = existingConfig;
    if (dto.config !== undefined) {
      const merged = $mergeConfigForUpdate(channel.channelType, dto.config, existingConfig);
      try {
        definition.configSchema.parse(merged);
      } catch (err) {
        throw new BadRequestError({ message: `Invalid ${channel.channelType} channel config` });
      }
      finalConfig = merged;
    }

    if (dto.recipients !== undefined) {
      if (!definition.directed && dto.recipients.length > 0) {
        throw new BadRequestError({ message: `${channel.channelType} channels do not take recipients` });
      }
      if (definition.directed && dto.recipients.length === 0) {
        throw new BadRequestError({ message: `${channel.channelType} channels require at least one recipient` });
      }
      await $validateRecipients(channel.orgId, channel.projectId, dto.recipients);
    }

    if (dto.name !== undefined && dto.name !== channel.name) {
      await $assertNameAvailable(dto.name, scope, channel.id);
    }

    await alarmChannelDAL.transaction(async (tx) => {
      await alarmChannelDAL.updateById(
        channel.id,
        {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.config !== undefined ? { encryptedConfig: encryptChannelConfig(finalConfig, encryptor) } : {})
        },
        tx
      );

      if (dto.recipients !== undefined) {
        await alarmChannelRecipientDAL.deleteByChannelId(channel.id, tx);
        if (dto.recipients.length) {
          await alarmChannelRecipientDAL.insertMany(
            dto.recipients.map((r) => ({
              channelId: channel.id,
              principalType: r.principalType,
              principalId: r.principalId
            })),
            tx
          );
        }
      }
    });

    const [updated, recipients, usageCount] = await Promise.all([
      alarmChannelDAL.findById(channel.id),
      alarmChannelRecipientDAL.findByChannelId(channel.id),
      $countUsage(channel.id)
    ]);
    return $buildDetail(
      updated,
      finalConfig,
      recipients.map((r) => ({ principalType: r.principalType, principalId: r.principalId })),
      usageCount
    );
  };

  const deleteChannel = async (dto: TDeleteAlarmChannelDTO): Promise<{ id: string }> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    const channel = await alarmChannelDAL.findById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Delete, channel.orgId, channel.projectId, actor);

    // Membership rows CASCADE-delete, detaching the channel from every alarm that referenced it.
    await alarmChannelDAL.deleteById(channel.id);
    return { id: channel.id };
  };

  const getChannelById = async (dto: TGetAlarmChannelDTO): Promise<TAlarmChannelDetail> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    const channel = await alarmChannelDAL.findById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Read, channel.orgId, channel.projectId, actor);

    const { decryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: channel.orgId,
      projectId: channel.projectId
    });
    const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);
    const [recipients, usageCount] = await Promise.all([
      alarmChannelRecipientDAL.findByChannelId(channel.id),
      $countUsage(channel.id)
    ]);
    return $buildDetail(
      channel,
      config,
      recipients.map((r) => ({ principalType: r.principalType, principalId: r.principalId })),
      usageCount
    );
  };

  const listChannels = async (dto: TListAlarmChannelsDTO): Promise<TAlarmChannelDetail[]> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    await $assertPermission(OrgPermissionActions.Read, dto.actorOrgId, dto.projectId, actor);

    const scope = { orgId: dto.actorOrgId, projectId: dto.projectId ?? null };
    const channels = await alarmChannelDAL.findWithUsageByScope(scope);
    if (channels.length === 0) return [];

    const [recipients, { decryptor }] = await Promise.all([
      alarmChannelRecipientDAL.findByChannelIds(channels.map((c) => c.id)),
      getAlarmChannelCipher(kmsService, scope)
    ]);

    const recipientsByChannel = new Map<string, { principalType: string; principalId: string }[]>();
    recipients.forEach((r) => {
      const list = recipientsByChannel.get(r.channelId) ?? [];
      list.push({ principalType: r.principalType, principalId: r.principalId });
      recipientsByChannel.set(r.channelId, list);
    });

    return channels.map((channel) => {
      const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);
      return $buildDetail(channel, config, recipientsByChannel.get(channel.id) ?? [], channel.usageCount);
    });
  };

  return { createChannel, updateChannel, deleteChannel, getChannelById, listChannels };
};
