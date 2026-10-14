import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import {
  getPortainerErrorMessage,
  isPortainerGitStack,
  portainerRequest,
  PortainerStackStatus,
  PortainerStackType,
  TPortainerEnvVar,
  TPortainerGatewayDeps,
  TPortainerStackResponse
} from "@app/services/app-connection/portainer";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { TSecretMap } from "../secret-sync-types";
import { TPortainerStackFileResponse, TPortainerSyncWithCredentials } from "./portainer-sync-types";

const PORTAINER_DEPLOYMENT_POLL_INTERVAL_MS = 5_000;
// The sync job holds a five-minute lock per sync, so the wait has to give up inside that window
const PORTAINER_DEPLOYMENT_TIMEOUT_MS = 4 * 60_000;
// Portainer releases before the background deployer run the redeploy inside the update request itself
const PORTAINER_STACK_UPDATE_TIMEOUT_MS = PORTAINER_DEPLOYMENT_TIMEOUT_MS;

const DOTENV_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", n: "\n", r: "\r" };

// Unquoted dotenv values lose surrounding whitespace, end at " #", and must not start with a quote
const needsDotenvQuoting = (value: string) => /[\r\n]|^\s|\s$|\s#|^["']/.test(value);

/**
 * Portainer writes a Compose stack's variables to a `stack.env` file one `NAME=VALUE` line at a time,
 * so a value that the dotenv parser would cut or trim has to use the double-quoted form or it reaches
 * the container changed (or, with line breaks, stops the file from parsing at all). Swarm stacks
 * receive their variables through the process environment, where every value is fine as-is.
 */
export const encodePortainerEnvValue = (value: string, stackType: PortainerStackType) => {
  if (stackType !== PortainerStackType.Compose || !needsDotenvQuoting(value)) return value;

  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

  return `"${escaped}"`;
};

export const decodePortainerEnvValue = (value: string, stackType: PortainerStackType) => {
  if (stackType !== PortainerStackType.Compose) return value;
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;

  const decoded = value.slice(1, -1).replace(/\\(["\\nr])/g, (_, escape: string) => DOTENV_ESCAPES[escape]);

  // Only unwrap what the encoder above produces; a value a user quoted by hand is left alone
  return encodePortainerEnvValue(decoded, stackType) === value ? decoded : value;
};

const toSortedPairs = (env: TPortainerEnvVar[]) =>
  env
    .map(({ name, value }) => [name, value ?? ""] as const)
    .sort(([nameA, valueA], [nameB, valueB]) => nameA.localeCompare(nameB) || valueA.localeCompare(valueB));

export const areEnvVarsEqual = (current: TPortainerEnvVar[], next: TPortainerEnvVar[]) => {
  if (current.length !== next.length) return false;

  const currentPairs = toSortedPairs(current);
  const nextPairs = toSortedPairs(next);

  return currentPairs.every(([name, value], index) => name === nextPairs[index][0] && value === nextPairs[index][1]);
};

/**
 * The Git update endpoint replaces every setting it carries, so the stack's current settings are echoed
 * back alongside the new variables. On Portainer 2.45+ the repository URL and credentials live on a
 * Source and only its ID is needed; older releases wipe the stored credentials unless the
 * authentication flags are sent again.
 */
export const buildPortainerGitUpdatePayload = (
  stack: TPortainerStackResponse & { GitConfig: NonNullable<TPortainerStackResponse["GitConfig"]> },
  env: TPortainerEnvVar[]
) => {
  const { GitConfig: gitConfig, AutoUpdate: autoUpdate } = stack;
  const hasAutoUpdate = Boolean(autoUpdate?.Webhook || autoUpdate?.Interval);

  return {
    env,
    prune: stack.Option?.Prune ?? false,
    repositoryReferenceName: gitConfig.ReferenceName ?? "",
    autoUpdate: hasAutoUpdate ? autoUpdate : null,
    ...(stack.GitSourceId
      ? { sourceID: stack.GitSourceId }
      : {
          repositoryAuthentication: Boolean(gitConfig.Authentication),
          repositoryUsername: gitConfig.Authentication?.Username ?? "",
          tlsSkipVerify: gitConfig.TLSSkipVerify ?? false
        })
  };
};

const getGatewayDeps = (
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): TPortainerGatewayDeps => ({ gatewayV2Service, gatewayPoolService });

const toSyncError = (error: unknown, message: string) => {
  // A gateway that cannot be reached is a configuration problem a retry will not fix
  if (error instanceof BadRequestError) return new SecretSyncError({ message: error.message, shouldRetry: false });

  return new SecretSyncError({ error, message: `${message}: ${getPortainerErrorMessage(error, "unknown error")}` });
};

const fetchPortainerStack = async (secretSync: TPortainerSyncWithCredentials, deps: TPortainerGatewayDeps) => {
  const { connection, destinationConfig } = secretSync;

  try {
    return await portainerRequest<TPortainerStackResponse>(
      connection,
      { method: "GET", path: `/stacks/${destinationConfig.stackId}` },
      deps
    );
  } catch (error) {
    throw toSyncError(error, `Failed to read Portainer stack with ID '${destinationConfig.stackId}'`);
  }
};

const getPortainerStack = async (secretSync: TPortainerSyncWithCredentials, deps: TPortainerGatewayDeps) => {
  const { environmentId, stackId } = secretSync.destinationConfig;
  const stack = await fetchPortainerStack(secretSync, deps);

  if (stack.EndpointId !== environmentId) {
    throw new SecretSyncError({
      message: `Stack with ID '${stackId}' belongs to Portainer environment '${stack.EndpointId}', not the configured environment '${environmentId}'`,
      shouldRetry: false
    });
  }

  if (stack.Type === PortainerStackType.Kubernetes) {
    throw new SecretSyncError({
      message: `Stack '${stack.Name}' is a Kubernetes stack. Portainer does not apply environment variables to Kubernetes stacks, so Infisical cannot sync to it. Choose a Compose or Swarm stack instead.`,
      shouldRetry: false
    });
  }

  return stack;
};

const waitForPortainerDeployment = async (
  secretSync: TPortainerSyncWithCredentials,
  stack: TPortainerStackResponse,
  deps: TPortainerGatewayDeps
) => {
  const deadline = Date.now() + PORTAINER_DEPLOYMENT_TIMEOUT_MS;
  let current = stack;

  while (current.Status === PortainerStackStatus.Deploying) {
    if (Date.now() >= deadline) {
      throw new SecretSyncError({
        message: `Portainer is still deploying stack '${stack.Name}' after ${PORTAINER_DEPLOYMENT_TIMEOUT_MS / 60_000} minutes. Check the stack in Portainer, then sync again.`,
        shouldRetry: false
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(PORTAINER_DEPLOYMENT_POLL_INTERVAL_MS);
    // eslint-disable-next-line no-await-in-loop
    current = await fetchPortainerStack(secretSync, deps);
  }

  return current;
};

// Portainer answers a stack update with 409 while a deployment is in flight, so wait for it to settle first
const getSettledPortainerStack = async (secretSync: TPortainerSyncWithCredentials, deps: TPortainerGatewayDeps) => {
  const stack = await getPortainerStack(secretSync, deps);

  return waitForPortainerDeployment(secretSync, stack, deps);
};

const writeGitStackEnv = async (
  secretSync: TPortainerSyncWithCredentials,
  stack: TPortainerStackResponse,
  env: TPortainerEnvVar[],
  deps: TPortainerGatewayDeps
) => {
  const { connection, destinationConfig } = secretSync;

  if (!stack.GitConfig) {
    throw new SecretSyncError({
      message: `Infisical could not read the Git settings of stack '${stack.Name}'. Make sure the API token's user can access the stack's Git source in Portainer.`,
      shouldRetry: false
    });
  }

  try {
    await portainerRequest(
      connection,
      {
        method: "POST",
        path: `/stacks/${destinationConfig.stackId}/git`,
        params: { endpointId: String(destinationConfig.environmentId) },
        data: buildPortainerGitUpdatePayload({ ...stack, GitConfig: stack.GitConfig }, env)
      },
      deps
    );
  } catch (error) {
    throw toSyncError(error, `Failed to update the variables of Portainer stack '${stack.Name}'`);
  }
};

const writeFileStackEnv = async (
  secretSync: TPortainerSyncWithCredentials,
  stack: TPortainerStackResponse,
  env: TPortainerEnvVar[],
  deps: TPortainerGatewayDeps
) => {
  const { connection, destinationConfig } = secretSync;

  let stackFileContent: string;
  try {
    ({ StackFileContent: stackFileContent } = await portainerRequest<TPortainerStackFileResponse>(
      connection,
      { method: "GET", path: `/stacks/${destinationConfig.stackId}/file` },
      deps
    ));
  } catch (error) {
    throw toSyncError(error, `Failed to read the compose file of Portainer stack '${stack.Name}'`);
  }

  try {
    await portainerRequest(
      connection,
      {
        method: "PUT",
        path: `/stacks/${destinationConfig.stackId}`,
        params: { endpointId: String(destinationConfig.environmentId) },
        data: { env, stackFileContent, prune: stack.Option?.Prune ?? false },
        timeoutMs: PORTAINER_STACK_UPDATE_TIMEOUT_MS
      },
      deps
    );
  } catch (error) {
    throw toSyncError(error, `Failed to update the variables of Portainer stack '${stack.Name}'`);
  }

  // Recent Portainer releases redeploy in the background after answering, so a 200 only means the
  // update was accepted; the stack status tells whether the containers actually came up
  const deployed = await waitForPortainerDeployment(secretSync, await fetchPortainerStack(secretSync, deps), deps);

  if (deployed.Status === PortainerStackStatus.Error) {
    const reason = [...(deployed.DeploymentStatus ?? [])].reverse().find((entry) => entry.Message)?.Message;

    throw new SecretSyncError({
      message: `Portainer failed to redeploy stack '${stack.Name}' with the updated variables${reason ? `: ${reason}` : ""}. The variables are saved on the stack; check the stack in Portainer and redeploy it.`,
      shouldRetry: false
    });
  }
};

/**
 * A stack stores its variables as a single list, so every write replaces the whole list. Git-backed
 * stacks store it without redeploying; file-based stacks need the compose file on every update and
 * redeploy as a result, so the write is skipped when it would not change anything.
 */
const writeStackEnvIfChanged = async (
  secretSync: TPortainerSyncWithCredentials,
  stack: TPortainerStackResponse,
  env: TPortainerEnvVar[],
  deps: TPortainerGatewayDeps
) => {
  const isGitStack = isPortainerGitStack(stack);
  const isUnchanged = areEnvVarsEqual(stack.Env ?? [], env);

  // A file-based stack whose last deployment failed is redeployed anyway, so the sync reports the real state
  if (isUnchanged && (isGitStack || stack.Status !== PortainerStackStatus.Error)) return;

  if (isGitStack) {
    await writeGitStackEnv(secretSync, stack, env, deps);
    return;
  }

  await writeFileStackEnv(secretSync, stack, env, deps);
};

const toEnvVars = (secretMap: TSecretMap, stackType: PortainerStackType): TPortainerEnvVar[] =>
  Object.entries(secretMap).map(([name, secret]) => ({
    name,
    value: encodePortainerEnvValue(secret.value ?? "", stackType)
  }));

export const PortainerSyncFns = {
  async getSecrets(
    secretSync: TPortainerSyncWithCredentials,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
  ): Promise<TSecretMap> {
    const stack = await getPortainerStack(secretSync, getGatewayDeps(gatewayV2Service, gatewayPoolService));

    return Object.fromEntries(
      (stack.Env ?? []).map(({ name, value }) => [name, { value: decodePortainerEnvValue(value ?? "", stack.Type) }])
    );
  },

  async syncSecrets(
    secretSync: TPortainerSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
  ) {
    const secretMap = payload.flatten();
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const deps = getGatewayDeps(gatewayV2Service, gatewayPoolService);

    const stack = await getSettledPortainerStack(secretSync, deps);

    const retainedEnv = (stack.Env ?? []).filter(({ name }) => {
      if (name in secretMap) return false;

      // Only remove keys managed by this sync (respecting the configured key schema)
      if (!disableSecretDeletion && matchesSchema(name, environment?.slug || "", keySchema)) return false;

      return true;
    });

    await writeStackEnvIfChanged(secretSync, stack, [...retainedEnv, ...toEnvVars(secretMap, stack.Type)], deps);
  },

  async removeSecrets(
    secretSync: TPortainerSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
  ) {
    const secretMap = payload.flatten();
    const deps = getGatewayDeps(gatewayV2Service, gatewayPoolService);

    const stack = await getSettledPortainerStack(secretSync, deps);

    const remainingEnv = (stack.Env ?? []).filter(({ name }) => !(name in secretMap));

    await writeStackEnvIfChanged(secretSync, stack, remainingEnv, deps);
  }
};
