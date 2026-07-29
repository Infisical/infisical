import crypto from "node:crypto";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError, RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import {
  assertChannelConfigValid,
  getChannelDefinition,
  mergeChannelConfigWithStored
} from "./alert-channel-config-fns";
import { decryptChannelConfig, getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelDeps, TAlertPayload, TAlertRecipient } from "./alert-channel-types";
import { TAlertDALFactory } from "./alert-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { TAlertRecipientResolver } from "./alert-recipient-resolver";
import { TTestAlertChannelDTO, TTestAlertChannelResponse } from "./alert-service-types";
import { AlertPermissionAction, IResourceAlertProvider, TAlertContext, toAlertActor } from "./alert-types";

export type TAlertChannelTestServiceFactoryDep = {
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findById">;
  alertDAL: Pick<TAlertDALFactory, "findByChannelId">;
  alertRecipientResolver: Pick<TAlertRecipientResolver, "resolveMany">;
  alertProviderRegistry: TAlertProviderRegistry;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  smtpService: Pick<TSmtpService, "sendMail">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX" | "ttl">;
};

export type TAlertChannelTestServiceFactory = ReturnType<typeof alertChannelTestServiceFactory>;

const TEST_CHANNEL_ID = "test";
const MAX_TEST_RECIPIENTS = 10;
const MAX_ERROR_LENGTH = 300;

export const alertChannelTestServiceFactory = ({
  alertChannelDAL,
  alertDAL,
  alertRecipientResolver,
  alertProviderRegistry,
  kmsService,
  smtpService,
  keyStore
}: TAlertChannelTestServiceFactoryDep) => {
  const $assertCooldown = async (orgId: string, actorId: string, channelType: string) => {
    const key = KeyStorePrefixes.AlertChannelTestCooldown(orgId, actorId, channelType);
    const acquired = await keyStore.setItemWithExpiryNX(key, KeyStoreTtls.AlertChannelTestCooldownInSeconds, "1");
    if (acquired) return;

    const remaining = await keyStore.ttl(key);
    const seconds = remaining > 0 ? remaining : KeyStoreTtls.AlertChannelTestCooldownInSeconds;
    throw new RateLimitError({
      message: `You already sent a ${channelType} test in the last minute. Try again in ${seconds}s.`
    });
  };

  const $assertChannelOwnersPermit = async (channelId: string, dto: TTestAlertChannelDTO) => {
    const owners = await alertDAL.findByChannelId(channelId);
    if (owners.length === 0) {
      throw new NotFoundError({ message: `Channel with ID '${channelId}' was not found in this scope` });
    }

    for (const owner of owners) {
      if (owner.orgId !== dto.actorOrgId) {
        throw new NotFoundError({ message: `Channel with ID '${channelId}' was not found in this scope` });
      }

      const ownerProvider = alertProviderRegistry.get(owner.resourceType);
      if (!ownerProvider) {
        throw new BadRequestError({
          message: `No alert provider is registered for resource type '${owner.resourceType}'`
        });
      }

      // eslint-disable-next-line no-await-in-loop
      await ownerProvider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: owner.orgId,
        projectId: owner.projectId,
        resourceId: owner.resourceId,
        actor: toAlertActor(dto)
      });
    }
  };

  const $resolveConfig = async (dto: TTestAlertChannelDTO, projectId: string | null) => {
    const definition = getChannelDefinition(dto.channelType);
    const incoming = dto.config ?? {};

    if (!dto.channelId) {
      assertChannelConfigValid(definition, dto.channelType, incoming);
      return incoming;
    }

    const channel = await alertChannelDAL.findById(dto.channelId);
    if (!channel || channel.orgId !== dto.actorOrgId || (channel.projectId ?? null) !== projectId) {
      throw new NotFoundError({ message: `Channel with ID '${dto.channelId}' was not found in this scope` });
    }
    if (channel.channelType !== dto.channelType) {
      throw new BadRequestError({
        message: `Channel '${dto.channelId}' is a ${channel.channelType} channel, not ${dto.channelType}`
      });
    }

    await $assertChannelOwnersPermit(channel.id, dto);

    const { decryptor } = await getAlertChannelCipher(kmsService, {
      orgId: channel.orgId,
      projectId: channel.projectId
    });
    const stored = decryptChannelConfig<Record<string, unknown>>(channel.encryptedConfig, decryptor);

    const merged = mergeChannelConfigWithStored(dto.channelType, incoming, stored);
    assertChannelConfigValid(definition, dto.channelType, merged);
    return merged;
  };

  const $resolveRecipients = async (
    dto: TTestAlertChannelDTO,
    projectId: string | null
  ): Promise<TAlertRecipient[]> => {
    const rows = dto.recipients ?? [];
    if (rows.length === 0) return [];

    const resolved = await alertRecipientResolver.resolveMany(new Map([[TEST_CHANNEL_ID, rows]]), {
      orgId: dto.actorOrgId,
      projectId
    });
    return (resolved.get(TEST_CHANNEL_ID) ?? []).slice(0, MAX_TEST_RECIPIENTS);
  };

  const $buildTestPayload = async (
    provider: IResourceAlertProvider,
    dto: TTestAlertChannelDTO,
    projectId: string | null
  ): Promise<TAlertPayload> => {
    const alertContext: TAlertContext = {
      id: crypto.randomUUID(),
      name: "Test alert",
      orgId: dto.actorOrgId,
      projectId,
      resourceType: provider.resourceType,
      resourceId: dto.resourceId ?? null,
      eventType: provider.eventTypes[0],
      condition: null
    };

    const viewUrl = await provider.buildViewUrl(alertContext);
    const payload = provider.buildPayload(alertContext, provider.buildTestTargets(), viewUrl);

    return {
      ...payload,
      severity: "info",
      summary: `Test alert from Infisical. A real ${payload.resourceKind} ${payload.eventLabel.toLowerCase()} alert would look like this. No action is needed.`
    };
  };

  const $toError = (err: unknown): string => {
    const message = err instanceof Error ? err.message : String(err);
    return message.slice(0, MAX_ERROR_LENGTH);
  };

  const testChannel = async (dto: TTestAlertChannelDTO): Promise<TTestAlertChannelResponse> => {
    const definition = getChannelDefinition(dto.channelType);

    const provider = alertProviderRegistry.get(dto.resourceType);
    if (!provider) {
      throw new BadRequestError({
        message: `No alert provider is registered for resource type '${dto.resourceType}'`
      });
    }

    const projectId = dto.projectId ?? null;

    await provider.assertPermission({
      action: AlertPermissionAction.Create,
      orgId: dto.actorOrgId,
      projectId,
      resourceId: dto.resourceId,
      actor: toAlertActor(dto)
    });
    await provider.assertResourceInScope({ orgId: dto.actorOrgId, projectId, resourceId: dto.resourceId });

    const config = await $resolveConfig(dto, projectId);
    const recipients = definition.directed ? await $resolveRecipients(dto, projectId) : [];
    if (definition.directed && recipients.length === 0) {
      return { success: false, error: `No ${dto.channelType} recipients could be resolved in this scope` };
    }

    // Last, so a rejected config or an unresolvable recipient doesn't spend the window.
    await $assertCooldown(dto.actorOrgId, dto.actorId, dto.channelType);

    const deps: TAlertChannelDeps = { smtpService };
    const payload = await $buildTestPayload(provider, dto, projectId);

    try {
      if (!definition.directed) {
        const result = await definition.send({ channelId: TEST_CHANNEL_ID, config, payload, deps });
        if (!result.success) return { success: false, error: result.error ?? "Delivery failed" };
        return { success: true, deliveredTo: 1 };
      }

      const results = await Promise.all(
        recipients.map((recipient) => definition.send({ channelId: TEST_CHANNEL_ID, config, payload, recipient, deps }))
      );
      const delivered = results.filter((result) => result.success);
      if (delivered.length === 0) {
        return { success: false, error: results.find((result) => result.error)?.error ?? "Delivery failed" };
      }
      return { success: true, deliveredTo: delivered.length };
    } catch (err) {
      const error = $toError(err);
      logger.info(
        { channelType: dto.channelType, error },
        `Alert channel test delivery failed [channelType=${dto.channelType}] [orgId=${dto.actorOrgId}]`
      );
      return { success: false, error };
    }
  };

  return { testChannel };
};
