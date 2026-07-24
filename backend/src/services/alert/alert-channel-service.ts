import { Knex } from "knex";
import { z } from "zod";

import { TAlertChannels } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  decryptChannelConfig,
  encryptChannelConfig,
  TAlertDecryptor,
  TAlertEncryptor
} from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { TAlertChannelEmbedded, TChannelRecipientInput } from "./alert-channel-service-types";
import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

export type TAlertChannelServiceFactoryDep = {
  alertChannelDAL: TAlertChannelDALFactory;
  alertChannelRecipientDAL: TAlertChannelRecipientDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export type TAlertChannelServiceFactory = ReturnType<typeof alertChannelServiceFactory>;

// Everything the transaction-aware primitives need to write a channel inline, without the standalone
// endpoint's org/project Settings permission check or reusable-name-uniqueness check.
export type TCreateChannelInTxInput = {
  name: string;
  channelType: AlertChannelType | string;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
  orgId: string;
  projectId?: string | null;
  createdByUserId?: string | null;
};

export type TUpdateChannelInTxInput = {
  channelId: string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const alertChannelServiceFactory = ({
  alertChannelDAL,
  alertChannelRecipientDAL,
  orgDAL,
  projectDAL,
  groupDAL
}: TAlertChannelServiceFactoryDep) => {
  const $getDefinition = (channelType: string) => {
    const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
    if (!definition) throw new BadRequestError({ message: `Unknown channel type '${channelType}'` });
    return definition;
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

  const $assertRecipientRules = (
    definition: { directed: boolean },
    channelType: string,
    recipients: TChannelRecipientInput[]
  ) => {
    if (!definition.directed && recipients.length > 0) {
      throw new BadRequestError({ message: `${channelType} channels do not take recipients` });
    }
    if (definition.directed && recipients.length === 0) {
      throw new BadRequestError({ message: `${channelType} channels require at least one recipient` });
    }
  };

  const $assertConfigValid = (
    definition: { configSchema: { parse: (value: unknown) => unknown } },
    channelType: string,
    config: Record<string, unknown>
  ) => {
    try {
      definition.configSchema.parse(config);
    } catch (err) {
      const detail = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : null;
      throw new BadRequestError({
        message: detail ? `Invalid ${channelType} channel config: ${detail}` : `Invalid ${channelType} channel config`
      });
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

  const createChannelInTx = async (
    input: TCreateChannelInTxInput,
    encryptor: TAlertEncryptor,
    tx: Knex
  ): Promise<TAlertChannels> => {
    const definition = $getDefinition(input.channelType);
    const recipients = input.recipients ?? [];
    $assertRecipientRules(definition, input.channelType, recipients);
    $assertConfigValid(definition, input.channelType, input.config);
    await $validateRecipients(input.orgId, input.projectId, recipients);

    const created = await alertChannelDAL.create(
      {
        name: input.name,
        channelType: input.channelType,
        encryptedConfig: encryptChannelConfig(input.config, encryptor),
        enabled: input.enabled ?? true,
        orgId: input.orgId,
        projectId: input.projectId ?? null,
        createdByUserId: input.createdByUserId ?? null
      },
      tx
    );

    if (recipients.length) {
      await alertChannelRecipientDAL.insertMany(
        recipients.map((r) => ({ channelId: created.id, principalType: r.principalType, principalId: r.principalId })),
        tx
      );
    }
    return created;
  };

  const updateChannelInTx = async (
    input: TUpdateChannelInTxInput,
    channel: TAlertChannels,
    cipher: { encryptor: TAlertEncryptor; decryptor: TAlertDecryptor },
    tx: Knex
  ): Promise<Record<string, unknown>> => {
    const definition = $getDefinition(channel.channelType);
    const existingConfig = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, cipher.decryptor);

    let finalConfig = existingConfig;
    if (input.config !== undefined) {
      const merged = $mergeConfigForUpdate(channel.channelType, input.config, existingConfig);
      $assertConfigValid(definition, channel.channelType, merged);
      finalConfig = merged;
    }

    if (input.recipients !== undefined) {
      $assertRecipientRules(definition, channel.channelType, input.recipients);
      await $validateRecipients(channel.orgId, channel.projectId, input.recipients);
    }

    await alertChannelDAL.updateById(
      channel.id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.config !== undefined ? { encryptedConfig: encryptChannelConfig(finalConfig, cipher.encryptor) } : {})
      },
      tx
    );

    if (input.recipients !== undefined) {
      await alertChannelRecipientDAL.deleteByChannelId(channel.id, tx);
      if (input.recipients.length) {
        await alertChannelRecipientDAL.insertMany(
          input.recipients.map((r) => ({
            channelId: channel.id,
            principalType: r.principalType,
            principalId: r.principalId
          })),
          tx
        );
      }
    }

    return finalConfig;
  };

  const deleteChannelInTx = async (channelId: string, tx: Knex): Promise<void> => {
    await alertChannelDAL.deleteById(channelId, tx);
  };

  const getDetailsForChannels = async (
    channels: TAlertChannels[],
    cipher: { decryptor: TAlertDecryptor },
    tx?: Knex
  ): Promise<TAlertChannelEmbedded[]> => {
    if (channels.length === 0) return [];

    const recipients = await alertChannelRecipientDAL.findByChannelIds(
      channels.map((c) => c.id),
      tx
    );
    const recipientsByChannel = new Map<string, { principalType: string; principalId: string }[]>();
    recipients.forEach((r) => {
      const list = recipientsByChannel.get(r.channelId) ?? [];
      list.push({ principalType: r.principalType, principalId: r.principalId });
      recipientsByChannel.set(r.channelId, list);
    });

    return channels.map((channel) => {
      const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
      const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, cipher.decryptor);
      return {
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType,
        directed: Boolean(definition?.directed),
        enabled: channel.enabled,
        config: $redactConfig(channel.channelType, config),
        recipients: recipientsByChannel.get(channel.id) ?? []
      };
    });
  };

  return {
    createChannelInTx,
    updateChannelInTx,
    deleteChannelInTx,
    getDetailsForChannels
  };
};
