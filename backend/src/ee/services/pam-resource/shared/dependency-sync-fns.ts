import RE2 from "re2";
import { runPowershell } from "winrm-client";

import { TPamAccountDependencies } from "@app/db/schemas";
import { groupBy } from "@app/lib/fn";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamAccountDependencyType, PamDependencySyncStatus } from "../../pam-discovery/pam-discovery-enums";
import { decryptResource } from "../pam-resource-fns";
import { TPostRotateContext } from "../pam-resource-types";

export const WINRM_DEFAULT_HTTP_PORT = 5985;
export const WINRM_DEFAULT_HTTPS_PORT = 5986;

// Sanitize a string for safe use inside PowerShell single-quoted strings:
// - doubles single quotes (PowerShell escape)
// - strips newlines/carriage returns
export const escapePowershellSingleQuote = (value: string) =>
  new RE2("'", "g").replace(value, "''").replace(/[\r\n]/g, "");

export const buildDependencySyncScript = (
  dep: TPamAccountDependencies,
  accountUsername: string,
  newPassword: string
): string => {
  const escapedPassword = escapePowershellSingleQuote(newPassword);
  const escapedName = escapePowershellSingleQuote(dep.name);
  const escapedUsername = escapePowershellSingleQuote(accountUsername);

  switch (dep.dependencyType) {
    case PamAccountDependencyType.WindowsService:
      return [
        `sc.exe config '${escapedName}' obj= '${escapedUsername}' password= '${escapedPassword}'`,
        `Restart-Service -Name '${escapedName}' -Force -ErrorAction SilentlyContinue`
      ].join("; ");

    case PamAccountDependencyType.ScheduledTask: {
      const taskData = dep.data as { TaskPath?: string } | null;
      const taskPath = taskData?.TaskPath ?? "\\";
      const escapedPath = escapePowershellSingleQuote(taskPath);
      return `schtasks.exe /Change /TN '${escapedPath}${escapedName}' /RU '${escapedUsername}' /RP '${escapedPassword}'`;
    }

    case PamAccountDependencyType.IisAppPool:
      return [
        `Import-Module WebAdministration`,
        `Set-ItemProperty 'IIS:\\AppPools\\${escapedName}' processModel.userName '${escapedUsername}'`,
        `Set-ItemProperty 'IIS:\\AppPools\\${escapedName}' processModel.password '${escapedPassword}'`,
        `Restart-WebAppPool '${escapedName}'`
      ].join("; ");

    default:
      throw new Error(`Unknown dependency type: ${dep.dependencyType}`);
  }
};

type TSyncDependenciesParams = {
  accountId: string;
  newCredentials: { username: string; password: string };
  projectId: string;
  ctx: TPostRotateContext;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  rotationCredentials: { username: string; password: string };
  gatewayId: string;
  winrmPort?: number;
  useWinrmHttps?: boolean;
  resolveHostname?: (hostname: string) => Promise<string>;
  formatWinrmUsername?: (rotationUsername: string, hostname: string, resourceType: string) => string;
};

export const syncDependenciesAfterRotation = async ({
  accountId,
  newCredentials,
  projectId,
  ctx,
  gatewayV2Service,
  rotationCredentials,
  gatewayId,
  winrmPort,
  useWinrmHttps = false,
  resolveHostname,
  formatWinrmUsername
}: TSyncDependenciesParams) => {
  const effectiveWinrmPort = winrmPort ?? (useWinrmHttps ? WINRM_DEFAULT_HTTPS_PORT : WINRM_DEFAULT_HTTP_PORT);
  const allDeps = await ctx.pamAccountDependenciesDAL.findByAccountId(accountId);
  const enabledDeps = allDeps.filter((d) => d.isRotationSyncEnabled);
  if (!enabledDeps.length) return;

  const grouped = groupBy(enabledDeps, (d) => d.resourceId);

  // Batch-fetch all target resources to get their hostnames
  const resourceIds = Object.keys(grouped);
  const resources = await ctx.pamResourceDAL.find({ $in: { id: resourceIds } });
  const resourceMap = new Map(resources.map((r) => [r.id, r]));

  // Create encryptor lazily (only on first error)
  let encryptor: ((params: { plainText: Buffer }) => { cipherTextBlob: Buffer }) | null = null;
  const getEncryptor = async () => {
    if (!encryptor) {
      const cipherPair = await ctx.kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      encryptor = cipherPair.encryptor;
    }
    return encryptor;
  };

  await Promise.all(
    Object.entries(grouped).map(async ([resourceId, deps]) => {
      const resource = resourceMap.get(resourceId);
      if (!resource) {
        logger.warn(`[DependencySync] Resource ${resourceId} not found, skipping`);
        return;
      }

      // Get hostname from the target resource's connection details
      let hostname: string | null = null;
      try {
        const decrypted = await decryptResource(resource, projectId, ctx.kmsService);
        const connDetails = decrypted.connectionDetails as { hostname?: string; domain?: string };
        hostname = connDetails.hostname ?? connDetails.domain ?? null;
      } catch (err) {
        logger.error(err, `[DependencySync] Failed to decrypt resource ${resourceId}`);
        return;
      }

      if (!hostname) {
        logger.warn(`[DependencySync] No hostname found for resource ${resourceId}, skipping`);
        return;
      }

      const winrmUsername = formatWinrmUsername
        ? formatWinrmUsername(rotationCredentials.username, hostname, resource.resourceType)
        : rotationCredentials.username;

      // Resolve hostname — use custom resolver (e.g. DC DNS) if provided, otherwise use as-is
      let resolvedHost = hostname;
      if (resolveHostname) {
        try {
          resolvedHost = await resolveHostname(hostname);
        } catch (err) {
          logger.warn(err, `[DependencySync] Failed to resolve hostname ${hostname}, using original`);
        }
      }

      const [targetHost] = await verifyHostInputValidity({
        host: resolvedHost,
        isGateway: true,
        isDynamicSecret: false
      });

      // eslint-disable-next-line no-restricted-syntax
      for (const dep of deps) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await ctx.pamAccountDependenciesDAL.updateById(dep.id, { syncStatus: PamDependencySyncStatus.Pending });

          const script = buildDependencySyncScript(dep, newCredentials.username, newCredentials.password);

          // eslint-disable-next-line no-await-in-loop
          const depConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
            gatewayId,
            targetHost,
            targetPort: effectiveWinrmPort
          });

          if (!depConnectionDetails) {
            logger.warn(`[DependencySync] Unable to get gateway connection for dep ${dep.name}, skipping`);
            // eslint-disable-next-line no-continue
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          await withGatewayV2Proxy(
            async (proxyPort) => {
              await runPowershell(
                script,
                "localhost",
                winrmUsername,
                rotationCredentials.password,
                proxyPort,
                useWinrmHttps,
                false
              );
            },
            {
              protocol: GatewayProxyProtocol.Tcp,
              relayHost: depConnectionDetails.relayHost,
              gateway: depConnectionDetails.gateway,
              relay: depConnectionDetails.relay
            }
          );

          // eslint-disable-next-line no-await-in-loop
          await ctx.pamAccountDependenciesDAL.updateById(dep.id, {
            syncStatus: PamDependencySyncStatus.Success,
            lastSyncedAt: new Date(),
            encryptedLastSyncMessage: null
          });

          logger.info(`[DependencySync] Synced ${dep.dependencyType} '${dep.name}' on resource ${resourceId}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(
            error,
            `[DependencySync] Failed to sync ${dep.dependencyType} '${dep.name}' on resource ${resourceId}`
          );

          try {
            // eslint-disable-next-line no-await-in-loop
            const enc = await getEncryptor();
            const { cipherTextBlob: encryptedMessage } = enc({
              plainText: Buffer.from(errorMessage)
            });

            // eslint-disable-next-line no-await-in-loop
            await ctx.pamAccountDependenciesDAL.updateById(dep.id, {
              syncStatus: PamDependencySyncStatus.Failed,
              lastSyncedAt: new Date(),
              encryptedLastSyncMessage: encryptedMessage
            });
          } catch (encryptErr) {
            logger.error(encryptErr, `[DependencySync] Failed to encrypt error message for dep ${dep.id}`);
            // eslint-disable-next-line no-await-in-loop
            await ctx.pamAccountDependenciesDAL.updateById(dep.id, {
              syncStatus: PamDependencySyncStatus.Failed,
              lastSyncedAt: new Date()
            });
          }
        }
      }
    })
  );
};
