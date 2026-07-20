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

import { decryptChannelConfig, encryptChannelConfig, getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelMembershipDALFactory } from "./alert-channel-membership-dal";
import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import {
  TAlertChannelDetail,
  TChannelRecipientInput,
  TCreateAlertChannelDTO,
  TDeleteAlertChannelDTO,
  TGetAlertChannelDTO,
  TListAlertChannelsDTO,
  TUpdateAlertChannelDTO
} from "./alert-channel-service-types";
import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

export type TAlertChannelServiceFactoryDep = {
  alertChannelDAL: TAlertChannelDALFactory;
  alertChannelRecipientDAL: TAlertChannelRecipientDALFactory;
  alertChannelMembershipDAL: Pick<TAlertChannelMembershipDALFactory, "countByChannelId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export type TAlertChannelServiceFactory = ReturnType<typeof alertChannelServiceFactory>;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const alertChannelServiceFactory = ({
  alertChannelDAL,
  alertChannelRecipientDAL,
  alertChannelMembershipDAL,
  kmsService,
  permissionService,
  orgDAL,
  projectDAL,
  groupDAL
}: TAlertChannelServiceFactoryDep) => {
  const $getDefinition = (channelType: string) => {
    const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
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
  // alert can't be made to notify a foreign principal.
  const $validateRecipients = async (
    orgId: string,
    projectId: string | null | undefined,
    recipients: TChannelRecipientInput[]
  ) => {
    const userIds = [
      ...new Set(recipients.filter((r) => r.principalType === AlertPrincipalType.USER).map((r) => r.principalId))
    ];
    const groupIds = [
      ...new Set(recipients.filter((r) => r.principalType === AlertPrincipalType.GROUP).map((r) => r.principalId))
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
    const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
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
    const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
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

  const $countUsage = (channelId: string): Promise<number> => alertChannelMembershipDAL.countByChannelId(channelId);

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
  ): TAlertChannelDetail => {
    const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
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
    const existing = await alertChannelDAL.findByNameInScope(name, scope);
    if (existing && existing.id !== excludeId) {
      throw new BadRequestError({ message: `A channel named '${name}' already exists in this scope` });
    }
  };

  const createChannel = async (dto: TCreateAlertChannelDTO): Promise<TAlertChannelDetail> => {
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

    const { encryptor } = await getAlertChannelCipher(kmsService, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId ?? null
    });

    const channel = await alertChannelDAL.transaction(async (tx) => {
      const created = await alertChannelDAL.create(
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
        await alertChannelRecipientDAL.insertMany(
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

  const updateChannel = async (dto: TUpdateAlertChannelDTO): Promise<TAlertChannelDetail> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };

    const channel = await alertChannelDAL.findActiveById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Edit, channel.orgId, channel.projectId, actor);

    const definition = $getDefinition(channel.channelType);
    const scope = { orgId: channel.orgId, projectId: channel.projectId };

    const { encryptor, decryptor } = await getAlertChannelCipher(kmsService, scope);
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

    await alertChannelDAL.transaction(async (tx) => {
      await alertChannelDAL.updateById(
        channel.id,
        {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.config !== undefined ? { encryptedConfig: encryptChannelConfig(finalConfig, encryptor) } : {})
        },
        tx
      );

      if (dto.recipients !== undefined) {
        await alertChannelRecipientDAL.deleteByChannelId(channel.id, tx);
        if (dto.recipients.length) {
          await alertChannelRecipientDAL.insertMany(
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
      alertChannelDAL.findById(channel.id),
      alertChannelRecipientDAL.findByChannelId(channel.id),
      $countUsage(channel.id)
    ]);
    return $buildDetail(
      updated,
      finalConfig,
      recipients.map((r) => ({ principalType: r.principalType, principalId: r.principalId })),
      usageCount
    );
  };

  const deleteChannel = async (dto: TDeleteAlertChannelDTO): Promise<{ id: string }> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    const channel = await alertChannelDAL.findActiveById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Delete, channel.orgId, channel.projectId, actor);

    // Membership rows CASCADE-delete, detaching the channel from every alert that referenced it.
    await alertChannelDAL.deleteById(channel.id);
    return { id: channel.id };
  };

  const getChannelById = async (dto: TGetAlertChannelDTO): Promise<TAlertChannelDetail> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    const channel = await alertChannelDAL.findActiveById(dto.channelId);
    if (!channel) throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' not found` });

    await $assertPermission(OrgPermissionActions.Read, channel.orgId, channel.projectId, actor);

    const { decryptor } = await getAlertChannelCipher(kmsService, {
      orgId: channel.orgId,
      projectId: channel.projectId
    });
    const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);
    const [recipients, usageCount] = await Promise.all([
      alertChannelRecipientDAL.findByChannelId(channel.id),
      $countUsage(channel.id)
    ]);
    return $buildDetail(
      channel,
      config,
      recipients.map((r) => ({ principalType: r.principalType, principalId: r.principalId })),
      usageCount
    );
  };

  const listChannels = async (dto: TListAlertChannelsDTO): Promise<TAlertChannelDetail[]> => {
    const actor: TGenericPermission = {
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    };
    await $assertPermission(OrgPermissionActions.Read, dto.actorOrgId, dto.projectId, actor);

    const scope = { orgId: dto.actorOrgId, projectId: dto.projectId ?? null };
    const channels = await alertChannelDAL.findWithUsageByScope(scope);
    if (channels.length === 0) return [];

    const [recipients, { decryptor }] = await Promise.all([
      alertChannelRecipientDAL.findByChannelIds(channels.map((c) => c.id)),
      getAlertChannelCipher(kmsService, scope)
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
