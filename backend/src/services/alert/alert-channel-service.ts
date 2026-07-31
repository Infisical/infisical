import { Knex } from "knex";

import { TAlertChannels } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  assertChannelConfigValid,
  getChannelDefinition,
  mergeChannelConfigWithStored
} from "./alert-channel-config-fns";
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
import { resolvePrincipalsInScope } from "./alert-principal-scope-fns";
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

// Everything the transaction-aware primitives need to write a channel inline. Channels are only ever
// created through their owning alert, so authorization is the alert's (the caller has already run the
// provider's assertPermission) and channel names are not required to be unique.
export type TCreateChannelInTxInput = {
  name: string;
  channelType: AlertChannelType | string;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
  orgId: string;
  projectId?: string | null;
  createdByActorId: string;
  createdByActorType: string;
};

export type TUpdateChannelInTxInput = {
  channelId: string;
  channelType?: AlertChannelType | string;
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

    const inScope = await resolvePrincipalsInScope(
      { orgDAL, projectDAL, groupDAL },
      { orgId, projectId, userIds, groupIds }
    );
    const scopeLabel = projectId ? "project" : "organization";

    const missingUsers = userIds.filter((id) => !inScope.userIds.has(id));
    if (missingUsers.length) {
      throw new BadRequestError({
        message: `Some users are not members of the ${scopeLabel}: ${missingUsers.join(", ")}`
      });
    }

    const missingGroups = groupIds.filter((id) => !inScope.groupIds.has(id));
    if (missingGroups.length) {
      throw new BadRequestError({
        message: `Some groups are not members of the ${scopeLabel}: ${missingGroups.join(", ")}`
      });
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

  const createChannelInTx = async (
    input: TCreateChannelInTxInput,
    encryptor: TAlertEncryptor,
    tx: Knex
  ): Promise<TAlertChannels> => {
    const definition = getChannelDefinition(input.channelType);
    const recipients = input.recipients ?? [];
    $assertRecipientRules(definition, input.channelType, recipients);
    assertChannelConfigValid(definition, input.channelType, input.config);
    await $validateRecipients(input.orgId, input.projectId, recipients);

    const created = await alertChannelDAL.create(
      {
        name: input.name,
        channelType: input.channelType,
        encryptedConfig: encryptChannelConfig(input.config, encryptor),
        enabled: input.enabled ?? true,
        orgId: input.orgId,
        projectId: input.projectId ?? null,
        createdByActorId: input.createdByActorId,
        createdByActorType: input.createdByActorType
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
  ): Promise<void> => {
    if (input.channelType !== undefined && input.channelType !== channel.channelType) {
      throw new BadRequestError({
        message: `Channel '${channel.id}' is a ${channel.channelType} channel and its type cannot be changed to ${input.channelType}`
      });
    }

    const definition = getChannelDefinition(channel.channelType);
    const existingConfig = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, cipher.decryptor);

    let finalConfig = existingConfig;
    if (input.config !== undefined) {
      const merged = mergeChannelConfigWithStored(channel.channelType, input.config, existingConfig);
      assertChannelConfigValid(definition, channel.channelType, merged);
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
      const config = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, cipher.decryptor);
      return {
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType,
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
