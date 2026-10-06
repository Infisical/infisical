import { Knex } from "knex";
import { z } from "zod";

import { TAlertChannels } from "@app/db/schemas";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
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
import { findVerifiedEmailDomains, isOnVerifiedDomain, resolvePrincipalsInScope } from "./alert-principal-scope-fns";
import { AlertPrincipalType, TAlertRecipientScope } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

export type TAlertChannelServiceFactoryDep = {
  alertChannelDAL: TAlertChannelDALFactory;
  alertChannelRecipientDAL: TAlertChannelRecipientDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "find">;
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
  recipientScope: TAlertRecipientScope;
  createdByActorId: string | null;
  createdByActorType: string;
};

export type TUpdateChannelInTxInput = {
  channelId: string;
  channelType?: AlertChannelType | string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
  recipientScope: TAlertRecipientScope;
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const alertChannelServiceFactory = ({
  alertChannelDAL,
  alertChannelRecipientDAL,
  orgDAL,
  projectDAL,
  groupDAL,
  emailDomainDAL
}: TAlertChannelServiceFactoryDep) => {
  const $recipientIdsByType = (recipients: TChannelRecipientInput[]) => ({
    userIds: [
      ...new Set(recipients.filter((r) => r.principalType === AlertPrincipalType.USER).map((r) => r.principalId))
    ],
    groupIds: [
      ...new Set(recipients.filter((r) => r.principalType === AlertPrincipalType.GROUP).map((r) => r.principalId))
    ]
  });

  const $assertProjectMembersRecipients = (
    projectId: string | null | undefined,
    recipients: TChannelRecipientInput[]
  ) => {
    const projectMembers = recipients.filter((r) => r.principalType === AlertPrincipalType.PROJECT_MEMBERS);
    if (projectMembers.length === 0) return;
    if (!projectId) {
      throw new BadRequestError({ message: "All project members can only be notified by a project alert" });
    }
    if (projectMembers.some((r) => r.principalId !== projectId)) {
      throw new BadRequestError({ message: "All project members must refer to the alert's own project" });
    }
  };

  const $assertNoDuplicateRecipients = (recipients: TChannelRecipientInput[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    recipients.forEach((recipient) => {
      const principalId =
        recipient.principalType === AlertPrincipalType.EMAIL
          ? recipient.principalId.toLowerCase()
          : recipient.principalId;
      const key = `${recipient.principalType}:${principalId}`;
      if (seen.has(key)) duplicates.add(recipient.principalId);
      seen.add(key);
    });
    if (duplicates.size) {
      throw new BadRequestError({ message: `Duplicate recipients: ${[...duplicates].join(", ")}` });
    }
  };

  const $validateEmailRecipients = async (orgId: string, emails: string[], tx?: Knex) => {
    if (!emails.length) return;

    const malformed = emails.filter((email) => !z.string().email().safeParse(email).success);
    if (malformed.length) {
      throw new BadRequestError({ message: `Invalid email recipients: ${malformed.join(", ")}` });
    }

    const verifiedDomains = await findVerifiedEmailDomains(emailDomainDAL, orgId, tx);
    const unverified = emails.filter((email) => !isOnVerifiedDomain(email, verifiedDomains));
    if (unverified.length) {
      throw new BadRequestError({
        message: `Email recipients must use one of your organization's verified domains (Organization Settings > SSO > Email Domains). Not on a verified domain: ${unverified.join(", ")}`
      });
    }
  };

  const assertRecipientTypesAllowed = (scope: TAlertRecipientScope, recipients: TChannelRecipientInput[]) => {
    if (!scope.allowEmailAddresses && recipients.some((r) => r.principalType === AlertPrincipalType.EMAIL)) {
      throw new BadRequestError({ message: "This alert type doesn't accept email address recipients" });
    }
  };

  // Confirms every recipient principal (user/group) actually belongs to the channel's scope so an
  // alert can't be made to notify a foreign principal.
  const validateRecipients = async (
    orgId: string,
    scope: TAlertRecipientScope,
    recipients: TChannelRecipientInput[],
    tx?: Knex
  ) => {
    const { projectId } = scope;
    assertRecipientTypesAllowed(scope, recipients);
    $assertNoDuplicateRecipients(recipients);
    $assertProjectMembersRecipients(projectId, recipients);

    const idsOfType = (principalType: AlertPrincipalType) =>
      recipients.filter((r) => r.principalType === principalType).map((r) => r.principalId);
    const userIds = idsOfType(AlertPrincipalType.USER);
    const groupIds = idsOfType(AlertPrincipalType.GROUP);

    await $validateEmailRecipients(orgId, idsOfType(AlertPrincipalType.EMAIL), tx);
    if (userIds.length === 0 && groupIds.length === 0) return;

    const inScope = await resolvePrincipalsInScope(
      { orgDAL, projectDAL, groupDAL },
      { orgId, projectId, userIds, groupIds },
      tx
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
    await validateRecipients(input.orgId, input.recipientScope, recipients, tx);

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

    const { recipients } = input;
    if (recipients !== undefined) {
      $assertRecipientRules(definition, channel.channelType, recipients);
      await validateRecipients(channel.orgId, input.recipientScope, recipients, tx);
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

    if (recipients !== undefined) {
      await alertChannelRecipientDAL.deleteByChannelId(channel.id, tx);
      if (recipients.length) {
        await alertChannelRecipientDAL.insertMany(
          recipients.map((r) => ({
            channelId: channel.id,
            principalType: r.principalType,
            principalId: r.principalId
          })),
          tx
        );
      }
    }
  };

  // For callers that carry recipient lists from outside the alert module (eg reminder recipients that
  // were never pruned when someone left the project), where an out-of-scope id should be dropped
  // rather than fail the whole write.
  const filterRecipientsInScope = async (
    scope: { orgId: string; projectId?: string | null },
    recipients: TChannelRecipientInput[],
    tx?: Knex
  ): Promise<TChannelRecipientInput[]> => {
    const { userIds, groupIds } = $recipientIdsByType(recipients);
    const inScope =
      userIds.length || groupIds.length
        ? await resolvePrincipalsInScope(
            { orgDAL, projectDAL, groupDAL },
            { orgId: scope.orgId, projectId: scope.projectId, userIds, groupIds },
            tx
          )
        : { userIds: new Set<string>(), groupIds: new Set<string>() };

    return recipients.filter((r) => {
      if (r.principalType === AlertPrincipalType.USER) return inScope.userIds.has(r.principalId);
      if (r.principalType === AlertPrincipalType.GROUP) return inScope.groupIds.has(r.principalId);
      if (r.principalType === AlertPrincipalType.PROJECT_MEMBERS) {
        return Boolean(scope.projectId) && r.principalId === scope.projectId;
      }
      return false;
    });
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
        recipients: recipientsByChannel.get(channel.id) ?? [],
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt
      };
    });
  };

  return {
    createChannelInTx,
    updateChannelInTx,
    deleteChannelInTx,
    getDetailsForChannels,
    validateRecipients,
    assertRecipientTypesAllowed,
    filterRecipientsInScope
  };
};
