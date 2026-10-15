import { isAxiosError } from "axios";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import {
  getPortainerErrorMessage,
  isPortainerGitStack,
  portainerRequest,
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

// Older releases redeploy a file-based stack inside the update request, so it can run for minutes; the sync
// job holds a five-minute lock per sync, so the request has to give up inside that window
const PORTAINER_STACK_UPDATE_TIMEOUT_MS = 4 * 60_000;

const DOTENV_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", n: "\n", r: "\r" };

// Unquoted dotenv values lose surrounding whitespace, end at " #", and must not start with a quote
const needsDotenvQuoting = (value: string) => /[\r\n]|^\s|\s$|\s#|^["']/.test(value);

/**
 * Portainer writes a Compose stack's variables to a `stack.env` file one `NAME=VALUE` line at a time and
 * hands it to Compose, whose dotenv parser expands `$VAR` and `${VAR}` inside every value (only `$$`
 * reaches the container as a dollar sign) and cuts or trims unquoted values. So every `$` is doubled, and
 * a value the parser would otherwise alter uses the double-quoted form. Swarm stacks receive their
 * variables through the process environment, where every value is fine as-is.
 */
export const encodePortainerEnvValue = (value: string, stackType: PortainerStackType) => {
  if (stackType !== PortainerStackType.Compose) return value;

  const dollarSafe = value.replace(/\$/g, () => "$$");
  if (!needsDotenvQuoting(value)) return dollarSafe;

  const escaped = dollarSafe.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

  return `"${escaped}"`;
};

const unescapeDotenv = (value: string) => value.replace(/\\(["\\nr])/g, (_, escape: string) => DOTENV_ESCAPES[escape]);

export const decodePortainerEnvValue = (value: string, stackType: PortainerStackType) => {
  if (stackType !== PortainerStackType.Compose) return value;

  const isQuoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"');
  const decoded = (isQuoted ? unescapeDotenv(value.slice(1, -1)) : value).replace(/\$\$/g, () => "$");

  // Only undo what the encoder above produces; a value a user wrote by hand is left alone
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
 * authentication settings are sent again.
 */
export const buildPortainerGitUpdatePayload = (
  stack: TPortainerStackResponse & { GitConfig: NonNullable<TPortainerStackResponse["GitConfig"]> },
  env: TPortainerEnvVar[]
) => {
  const { GitConfig: gitConfig, AutoUpdate: autoUpdate, Registries: registries } = stack;
  const hasAutoUpdate = Boolean(autoUpdate?.Webhook || autoUpdate?.Interval);
  const auth = gitConfig.Authentication;

  return {
    env,
    prune: stack.Option?.Prune ?? false,
    repositoryReferenceName: gitConfig.ReferenceName ?? "",
    autoUpdate: hasAutoUpdate ? autoUpdate : null,
    ...(registries ? { registries } : {}),
    ...(stack.GitSourceId
      ? { sourceID: stack.GitSourceId }
      : {
          repositoryAuthentication: Boolean(auth),
          repositoryUsername: auth?.Username ?? "",
          // A saved credential is referenced by ID and the stack stores no password for it, so without the
          // ID Portainer clones with no credentials at all
          ...(auth?.GitCredentialID ? { repositoryGitCredentialID: auth.GitCredentialID } : {}),
          ...(auth?.AuthorizationType ? { repositoryAuthorizationType: auth.AuthorizationType } : {}),
          ...(auth?.Provider ? { repositoryProvider: auth.Provider } : {}),
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

// Portainer refuses to update a stack it is still deploying; the sync's own retries cover a short deployment
const toStackUpdateError = (error: unknown, stack: TPortainerStackResponse) => {
  if (isAxiosError(error) && error.response?.status === 409) {
    return new SecretSyncError({
      error,
      message: `Portainer rejected the update of stack '${stack.Name}': ${getPortainerErrorMessage(error, "conflict")}. If the stack is still being deployed, sync again once the deployment has finished.`
    });
  }

  return toSyncError(error, `Failed to update the variables of Portainer stack '${stack.Name}'`);
};

const getPortainerStack = async (secretSync: TPortainerSyncWithCredentials, deps: TPortainerGatewayDeps) => {
  const { connection, destinationConfig } = secretSync;
  const { environmentId, stackId } = destinationConfig;

  let stack: TPortainerStackResponse;
  try {
    stack = await portainerRequest<TPortainerStackResponse>(
      connection,
      { method: "GET", path: `/stacks/${stackId}` },
      deps
    );
  } catch (error) {
    throw toSyncError(error, `Failed to read Portainer stack with ID '${stackId}'`);
  }

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
    throw toStackUpdateError(error, stack);
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
        data: {
          env,
          stackFileContent,
          prune: stack.Option?.Prune ?? false,
          // Business Edition clears the stack's registries and webhook when an update leaves them out
          ...(stack.Registries ? { registries: stack.Registries } : {}),
          ...(stack.Webhook ? { webhook: stack.Webhook } : {})
        },
        timeoutMs: PORTAINER_STACK_UPDATE_TIMEOUT_MS
      },
      deps
    );
  } catch (error) {
    throw toStackUpdateError(error, stack);
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
  if (areEnvVarsEqual(stack.Env ?? [], env)) return;

  if (isPortainerGitStack(stack)) {
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

    const stack = await getPortainerStack(secretSync, deps);

    // A plain `in` check would also match inherited names such as "constructor"
    const retainedEnv = (stack.Env ?? []).filter(({ name }) => {
      if (Object.hasOwn(secretMap, name)) return false;

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

    const stack = await getPortainerStack(secretSync, deps);

    const remainingEnv = (stack.Env ?? []).filter(({ name }) => !Object.hasOwn(secretMap, name));

    await writeStackEnvIfChanged(secretSync, stack, remainingEnv, deps);
  }
};
