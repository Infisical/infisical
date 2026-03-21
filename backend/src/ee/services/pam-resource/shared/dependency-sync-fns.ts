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

const SINGLE_QUOTE_RE = new RE2("'", "g");
const NEWLINE_RE = new RE2("[\\r\\n]", "g");

// Allow alphanumerics, spaces, single backslash, hyphen, underscore, dot, but NOT ".." sequences
const SAFE_WINDOWS_NAME_RE = new RE2("^[a-zA-Z0-9 _\\-.]+$");
const SAFE_WINDOWS_PATH_RE = new RE2("^[a-zA-Z0-9 _\\-.\\\\/]+$");
const PATH_TRAVERSAL_RE = new RE2("\\.\\.");

// Sanitize a string for safe use inside PowerShell single-quoted strings:
// - doubles single quotes (PowerShell escape)
// - strips newlines/carriage returns
export const escapePowershellSingleQuote = (value: string) =>
  NEWLINE_RE.replace(SINGLE_QUOTE_RE.replace(value, "''"), "");

const validateWindowsName = (value: string, label: string) => {
  if (!SAFE_WINDOWS_NAME_RE.test(value)) {
    throw new Error(`${label} contains invalid characters: ${value}`);
  }
};

const validateWindowsPath = (value: string, label: string) => {
  if (!SAFE_WINDOWS_PATH_RE.test(value) || PATH_TRAVERSAL_RE.test(value)) {
    throw new Error(`${label} contains invalid characters or path traversal: ${value}`);
  }
};

export const buildDependencySyncScript = (
  dep: TPamAccountDependencies,
  accountUsername: string,
  newPassword: string
): string => {
  validateWindowsName(dep.name, "Dependency name");

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
      validateWindowsPath(taskPath, "Task path");
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
  winrmCaCert?: string;
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
  winrmCaCert,
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

  const failAllDeps = async (deps: typeof enabledDeps, msg: string) => {
    let encryptedMsg: Buffer | null = null;
    try {
      const enc = await getEncryptor();
      encryptedMsg = enc({ plainText: Buffer.from(msg) }).cipherTextBlob;
    } catch (err) {
      logger.error(err, `[DependencySync] Failed to encrypt error message`);
    }
    await Promise.all(
      deps.map((dep) =>
        ctx.pamAccountDependenciesDAL.updateById(dep.id, {
          syncStatus: PamDependencySyncStatus.Failed,
          encryptedLastSyncMessage: encryptedMsg
        })
      )
    );
  };

  await Promise.all(
    Object.entries(grouped).map(async ([resourceId, deps]) => {
      const resource = resourceMap.get(resourceId);
      if (!resource) {
        const msg = `Resource ${resourceId} not found`;
        logger.warn(`[DependencySync] ${msg}, skipping`);
        await failAllDeps(deps, msg);
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
        await failAllDeps(deps, `Failed to decrypt resource connection details`);
        return;
      }

      if (!hostname) {
        const msg = `No hostname found for resource ${resourceId}`;
        logger.warn(`[DependencySync] ${msg}, skipping`);
        await failAllDeps(deps, msg);
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
            const msg = "Unable to establish gateway connection for dependency sync";
            logger.warn(`[DependencySync] ${msg} [dep=${dep.name}]`);

            let encryptedLastSyncMessage: Buffer | null = null;
            try {
              // eslint-disable-next-line no-await-in-loop
              const enc = await getEncryptor();
              const { cipherTextBlob } = enc({ plainText: Buffer.from(msg) });
              encryptedLastSyncMessage = cipherTextBlob;
            } catch (err) {
              logger.error(err, `[DependencySync] Failed to encrypt error message for [depId=${dep.id}]`);
            }

            // eslint-disable-next-line no-await-in-loop
            await ctx.pamAccountDependenciesDAL.updateById(dep.id, {
              syncStatus: PamDependencySyncStatus.Failed,
              encryptedLastSyncMessage
            });

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
                false,
                winrmCaCert
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

          let encryptedLastSyncMessage: Buffer | null = null;
          try {
            // eslint-disable-next-line no-await-in-loop
            const enc = await getEncryptor();
            const { cipherTextBlob } = enc({
              plainText: Buffer.from(errorMessage)
            });
            encryptedLastSyncMessage = cipherTextBlob;
          } catch (err) {
            logger.error(err, `[DependencySync] Failed to encrypt error message for [depId=${dep.id}]`);
          }

          // eslint-disable-next-line no-await-in-loop
          await ctx.pamAccountDependenciesDAL.updateById(dep.id, {
            syncStatus: PamDependencySyncStatus.Failed,
            encryptedLastSyncMessage
          });
        }
      }
    })
  );
};
