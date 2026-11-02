import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenConfigDALFactory } from "../honey-token-config/honey-token-config-dal";
import { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenType } from "./honey-token-enums";
import { getHoneyTokenServiceHooksByType, HONEY_TOKEN_PROVIDER_MAP } from "./honey-token-provider-fns";
import { THoneyTokenProviderHooksDep } from "./honey-token-service-types";

type THoneyTokenCleanupServiceFactoryDep = {
  honeyTokenDAL: Pick<
    THoneyTokenDALFactory,
    "findUnrevokedByProjectIdForCleanup" | "findUnrevokedByOrgTreeForCleanup" | "delete"
  >;
  honeyTokenConfigDAL: Pick<THoneyTokenConfigDALFactory, "findOne">;
} & THoneyTokenProviderHooksDep;

export type THoneyTokenCleanupRow = Awaited<ReturnType<THoneyTokenDALFactory["findFolderlessForCleanup"]>>[number];

export const honeyTokenCleanupLogContext = (honeyToken: THoneyTokenCleanupRow) =>
  `[honeyTokenId=${honeyToken.id}] [projectId=${honeyToken.projectId}] [orgId=${honeyToken.orgId}]`;

export type THoneyTokenCleanupServiceFactory = ReturnType<typeof honeyTokenCleanupServiceFactory>;

export const honeyTokenCleanupServiceFactory = ({
  honeyTokenDAL,
  honeyTokenConfigDAL,
  kmsService,
  appConnectionDAL
}: THoneyTokenCleanupServiceFactoryDep) => {
  const providerHooksByType = getHoneyTokenServiceHooksByType({ kmsService, appConnectionDAL });

  const $fetchConnection = async (orgId: string, type: HoneyTokenType) => {
    const config = await honeyTokenConfigDAL.findOne({ orgId, type });
    const rawConnection = config?.connectionId ? await appConnectionDAL.findById(config.connectionId) : null;
    return rawConnection ? decryptAppConnection(rawConnection, kmsService) : null;
  };

  // Resolves each org's honey token connection once, however many of its tokens are revoked. The credentials
  // are encrypted with the project's KMS key, so every caller must run while the project is still live.
  const $createRevoker = () => {
    const connectionByOrgAndType = new Map<string, Promise<TAppConnection | null>>();

    const findConnection = (orgId: string, type: HoneyTokenType) => {
      const key = `${orgId}:${type}`;
      let connection = connectionByOrgAndType.get(key);
      if (!connection) {
        connection = $fetchConnection(orgId, type);
        connectionByOrgAndType.set(key, connection);
      }
      return connection;
    };

    return async (honeyToken: THoneyTokenCleanupRow) => {
      if (!Object.hasOwn(HONEY_TOKEN_PROVIDER_MAP, honeyToken.type)) {
        throw new NotFoundError({ message: `Unsupported honey token type '${honeyToken.type}'` });
      }
      const type = honeyToken.type as HoneyTokenType;

      if (!honeyToken.projectId || !honeyToken.orgId) {
        throw new NotFoundError({ message: "Honey token's project was deleted before it was revoked" });
      }

      const appConnection = await findConnection(honeyToken.orgId, type);
      if (!appConnection) {
        throw new NotFoundError({ message: "Organization has no honey token connection" });
      }

      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: honeyToken.projectId
      });
      const credentials = JSON.parse(
        decryptor({ cipherTextBlob: honeyToken.encryptedCredentials }).toString()
      ) as Record<string, string>;

      await providerHooksByType[type].revokeCredentials({ appConnection, credentials });
    };
  };

  // Best effort: a provider failure is logged and the row is deleted regardless, so it never blocks the delete.
  const $revokeAndDelete = async (honeyTokens: THoneyTokenCleanupRow[], reason: string) => {
    if (!honeyTokens.length) return;

    const revoke = $createRevoker();
    await Promise.all(
      honeyTokens.map((honeyToken) =>
        revoke(honeyToken).catch((err) =>
          logger.error(
            { err: err as unknown },
            `honey-token-cleanup: could not clean up honey token on ${reason} ${honeyTokenCleanupLogContext(honeyToken)}`
          )
        )
      )
    );

    await honeyTokenDAL.delete({ $in: { id: honeyTokens.map((honeyToken) => honeyToken.id) } });
  };

  // Runs before the project is soft-deleted: after that its KMS key no longer resolves and the credentials
  // cannot be decrypted.
  const revokeProjectHoneyTokens = async (projectId: string) =>
    $revokeAndDelete(await honeyTokenDAL.findUnrevokedByProjectIdForCleanup(projectId), "project deletion");

  // Runs before the org row is deleted: the cascade drops the honey token configuration and the app
  // connection needed to reach the provider.
  const revokeOrgHoneyTokens = async (orgId: string) =>
    $revokeAndDelete(await honeyTokenDAL.findUnrevokedByOrgTreeForCleanup(orgId), "org deletion");

  const revokeHoneyToken = async (honeyToken: THoneyTokenCleanupRow) => $createRevoker()(honeyToken);

  return {
    revokeProjectHoneyTokens,
    revokeOrgHoneyTokens,
    revokeHoneyToken
  };
};
