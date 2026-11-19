import { isAxiosError } from "axios";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash, sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";

import {
  DynamicSecretNeonSchema,
  NeonLeaseType,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";
import { generateUsername } from "./templateUtils";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;
const OPERATION_TIMEOUT_MS = 60_000;
const MAX_LOCKED_RETRIES = 5;
const BRANCH_PAGE_SIZE = 100;
const BRANCH_MAX_PAGES = 100;

// https://api-docs.neon.tech/reference/getprojectoperation: "failed" operations are retried by
// Neon (see failures_count / retry_at), so only "error" and "cancelled" are terminal failures.
const NEON_OPERATION_DONE_STATUSES = new Set(["finished", "skipped"]);
const NEON_OPERATION_FAILED_STATUSES = new Set(["error", "cancelled"]);

type TNeonProviderInputs = z.infer<typeof DynamicSecretNeonSchema>;
type TNeonBranchInputs = Extract<TNeonProviderInputs, { leaseType: NeonLeaseType.Branch }>;
type TNeonOperation = { id: string; status: string; action?: string; error?: string };
type TNeonBranch = { id: string; name: string; default?: boolean; expires_at?: string | null };
type TNeonOperationsResponse = { operations?: TNeonOperation[] };
type TNeonRoleResponse = TNeonOperationsResponse & { role: { name: string; password?: string } };

// Neon accepts RFC 3339 timestamps with precision up to seconds
const toNeonTimestamp = (epochMs: number) => new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, "Z");

const apiBaseUrl = (baseUrl?: string | null) => (baseUrl ? removeTrailingSlash(baseUrl) : NEON_API_BASE_URL);

export const NeonProvider = (): TDynamicProviderFns => {
  const $parseInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretNeonSchema.parseAsync(inputs);
    if (providerInputs.baseUrl) {
      // the API key is sent as a bearer token, so only allow plain http for local development
      const { protocol, search, hash } = new URL(providerInputs.baseUrl);
      if (protocol !== "https:" && !(protocol === "http:" && getConfig().isDevelopmentMode)) {
        throw new BadRequestError({ message: "Neon API base URL must use https" });
      }
      if (search || hash) {
        throw new BadRequestError({ message: "Neon API base URL can't include a query string or fragment" });
      }
    }
    return providerInputs;
  };

  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, hasActiveLeases }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await $parseInputs(inputs);
    if (!hasActiveLeases || !previousInputs) return providerInputs;

    // revocation deletes each lease's role or branch through this API, project, lease type and branch
    const previous = previousInputs as {
      baseUrl?: string | null;
      projectId?: string;
      leaseType?: string;
      branchId?: string;
    };
    const lockedFields: [string, boolean][] = [
      ["API base URL", apiBaseUrl(previous.baseUrl) !== apiBaseUrl(providerInputs.baseUrl)],
      ["project ID", previous.projectId !== providerInputs.projectId],
      ["lease type", previous.leaseType !== providerInputs.leaseType],
      ["branch ID", providerInputs.leaseType === NeonLeaseType.Role && previous.branchId !== providerInputs.branchId]
    ];
    const changed = lockedFields.find(([, isChanged]) => isChanged);
    if (changed) {
      throw new BadRequestError({
        message: `The ${changed[0]} can't be changed while this dynamic secret has active leases, because revoking them needs the current value. Revoke the active leases first, then make the change.`
      });
    }
    return providerInputs;
  };

  const $requestConfig = (apiKey: string) => ({
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    timeout: REQUEST_TIMEOUT_MS,
    allowPrivateIps: getConfig().DYNAMIC_SECRET_ALLOW_INTERNAL_IP
  });

  // a retried create can make a second role or branch whose response we never see, so no lease tracks it
  const $createRequestConfig = (apiKey: string) => ({ ...$requestConfig(apiKey), "axios-retry": { retries: 0 } });

  const $projectUrl = ({ baseUrl, projectId }: TNeonProviderInputs) =>
    `${apiBaseUrl(baseUrl)}/projects/${encodeURIComponent(projectId)}`;

  const $branchUrl = (providerInputs: TNeonProviderInputs, branchId: string) =>
    `${$projectUrl(providerInputs)}/branches/${encodeURIComponent(branchId)}`;

  // where the role or branch of a lease lives, for deleting it
  const $leaseUrl = (providerInputs: TNeonProviderInputs, entityId: string) =>
    providerInputs.leaseType === NeonLeaseType.Branch
      ? $branchUrl(providerInputs, entityId)
      : `${$branchUrl(providerInputs, providerInputs.branchId)}/roles/${encodeURIComponent(entityId)}`;

  const $toBadRequest = (err: unknown, prefix: string, tokens: string[]) => {
    if (err instanceof BadRequestError) return err;
    const message =
      (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) ||
      (err as Error)?.message ||
      "Unknown error";
    return new BadRequestError({ message: `${prefix}: ${sanitizeString({ unsanitizedString: message, tokens })}` });
  };

  // Neon answers 423 Locked while another operation holds the project; the docs say it is safe to retry.
  const $withLockedRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn();
      } catch (err) {
        if (!isAxiosError(err) || err.response?.status !== 423 || attempt >= MAX_LOCKED_RETRIES) throw err;
        // jittered, so leases revoked together don't keep colliding on the project lock
        // eslint-disable-next-line no-await-in-loop
        await delay(POLL_INTERVAL_MS * 2 ** attempt * (0.5 + Math.random()));
      }
    }
  };

  // Role and branch changes are applied asynchronously. Wait for them so the credentials returned
  // to the caller work immediately, and so the next request on the branch isn't rejected as locked.
  const $waitForOperations = async (providerInputs: TNeonProviderInputs, operations: TNeonOperation[] = []) => {
    let pending = operations.filter((op) => !NEON_OPERATION_DONE_STATUSES.has(op.status));
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    while (pending.length) {
      const failed = pending.find((op) => NEON_OPERATION_FAILED_STATUSES.has(op.status));
      if (failed) {
        throw new BadRequestError({
          message: `Neon operation ${failed.action ?? failed.id} ${failed.status}${failed.error ? `: ${failed.error}` : ""}`
        });
      }
      if (Date.now() >= deadline) {
        throw new BadRequestError({
          message: `Timed out waiting for Neon operations to finish: ${pending.map((op) => op.action ?? op.id).join(", ")}`
        });
      }

      // eslint-disable-next-line no-await-in-loop
      await delay(POLL_INTERVAL_MS);
      // eslint-disable-next-line no-await-in-loop
      pending = await Promise.all(
        pending.map(async (op) => {
          const { data } = await safeRequest.get<{ operation: TNeonOperation }>(
            `${$projectUrl(providerInputs)}/operations/${encodeURIComponent(op.id)}`,
            $requestConfig(providerInputs.apiKey)
          );
          return { ...op, ...data.operation };
        })
      ).then((ops) => ops.filter((op) => !NEON_OPERATION_DONE_STATUSES.has(op.status)));
    }
  };

  const $leaseData = async (providerInputs: TNeonProviderInputs, branchId: string, roleName: string) => {
    const { data } = await safeRequest.get<{ uri: string }>(`${$projectUrl(providerInputs)}/connection_uri`, {
      ...$requestConfig(providerInputs.apiKey),
      params: {
        branch_id: branchId,
        database_name: providerInputs.databaseName,
        role_name: roleName,
        pooled: providerInputs.pooled
      }
    });
    const uri = new URL(data.uri);
    return {
      DATABASE_URL: data.uri,
      DB_HOST: uri.hostname,
      DB_NAME: decodeURIComponent(uri.pathname.replace(/^\//, "")),
      DB_USERNAME: decodeURIComponent(uri.username),
      DB_PASSWORD: decodeURIComponent(uri.password),
      BRANCH_ID: branchId
    };
  };

  // Branch leases fork from the configured parent branch, or from the project's default branch
  const $resolveParentBranchId = async (providerInputs: TNeonBranchInputs) => {
    if (providerInputs.parentBranchId) return providerInputs.parentBranchId;

    let cursor: string | undefined;
    for (let page = 1; page <= BRANCH_MAX_PAGES; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await safeRequest.get<{ branches: TNeonBranch[]; pagination?: { next?: string } }>(
        `${$projectUrl(providerInputs)}/branches`,
        { ...$requestConfig(providerInputs.apiKey), params: { limit: BRANCH_PAGE_SIZE, cursor } }
      );
      const defaultBranch = data.branches.find((branch) => branch.default);
      if (defaultBranch) return defaultBranch.id;

      cursor = data.branches.length ? data.pagination?.next : undefined;
      if (!cursor) {
        throw new BadRequestError({
          message: `Neon project '${providerInputs.projectId}' has no default branch. Set a parent branch ID.`
        });
      }
    }

    logger.warn(
      `Neon dynamic secret: stopped looking for the default branch after ${BRANCH_MAX_PAGES} pages [projectId=${providerInputs.projectId}]`
    );
    throw new BadRequestError({
      message: `Infisical couldn't find the default branch of Neon project '${providerInputs.projectId}' in its first ${BRANCH_MAX_PAGES * BRANCH_PAGE_SIZE} branches. Set a parent branch ID.`
    });
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await $parseInputs(inputs);
    const config = $requestConfig(providerInputs.apiKey);

    try {
      // Neon checks every segment of the path, so these also confirm the API key can see the project and the
      // branch exists, and misconfiguration fails on save rather than on lease
      const branchUrl = $branchUrl(
        providerInputs,
        providerInputs.leaseType === NeonLeaseType.Branch
          ? await $resolveParentBranchId(providerInputs)
          : providerInputs.branchId
      );
      await Promise.all([
        safeRequest.get(`${branchUrl}/databases/${encodeURIComponent(providerInputs.databaseName)}`, config),
        providerInputs.leaseType === NeonLeaseType.Branch &&
          safeRequest.get(`${branchUrl}/roles/${encodeURIComponent(providerInputs.roleName)}`, config)
      ]);
      return true;
    } catch (err) {
      throw $toBadRequest(err, "Failed to connect with Neon", [providerInputs.apiKey]);
    }
  };

  const create = async ({
    inputs,
    expireAt,
    usernameTemplate,
    identity,
    dynamicSecret
  }: Parameters<TDynamicProviderFns["create"]>[0]) => {
    const providerInputs = await $parseInputs(inputs);
    const { apiKey } = providerInputs;
    // lowercase, so the connection string never needs quoted identifiers
    const name = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      usernameLowercase: true
    });

    let entityId: string | undefined;
    let password = "";
    try {
      if (providerInputs.leaseType === NeonLeaseType.Role) {
        const { data } = await $withLockedRetry(() =>
          safeRequest.post<TNeonRoleResponse>(
            `${$branchUrl(providerInputs, providerInputs.branchId)}/roles`,
            { role: { name } },
            $createRequestConfig(apiKey)
          )
        );
        entityId = data.role.name;
        password = data.role.password ?? "";
        await $waitForOperations(providerInputs, data.operations);
        return { entityId, data: await $leaseData(providerInputs, providerInputs.branchId, entityId) };
      }

      const { data } = await $withLockedRetry(() =>
        safeRequest.post<TNeonOperationsResponse & { branch: TNeonBranch }>(
          `${$projectUrl(providerInputs)}/branches`,
          {
            branch: {
              name,
              ...(providerInputs.parentBranchId && { parent_id: providerInputs.parentBranchId }),
              ...(providerInputs.setBranchExpiration && { expires_at: toNeonTimestamp(expireAt) })
            },
            endpoints: [{ type: "read_write" }]
          },
          $createRequestConfig(apiKey)
        )
      );
      entityId = data.branch.id;
      await $waitForOperations(providerInputs, data.operations);

      if (providerInputs.resetRolePassword) {
        // A branch inherits its parent's roles and passwords. Rotating the password on the new
        // branch keeps the lease from handing out credentials that also work on the parent.
        const { data: reset } = await $withLockedRetry(() =>
          safeRequest.post<TNeonRoleResponse>(
            `${$branchUrl(providerInputs, data.branch.id)}/roles/${encodeURIComponent(providerInputs.roleName)}/reset_password`,
            {},
            $requestConfig(apiKey)
          )
        );
        password = reset.role.password ?? "";
        await $waitForOperations(providerInputs, reset.operations);
      }

      return {
        entityId,
        data: {
          ...(await $leaseData(providerInputs, data.branch.id, providerInputs.roleName)),
          BRANCH_NAME: data.branch.name
        }
      };
    } catch (err) {
      if (entityId) {
        // no lease will be saved to revoke what was already created
        const leftoverUrl = $leaseUrl(providerInputs, entityId);
        await $withLockedRetry(() => safeRequest.delete(leftoverUrl, $requestConfig(apiKey))).catch((cleanupErr) =>
          logger.error(
            cleanupErr,
            `Failed to clean up Neon ${providerInputs.leaseType} [projectId=${providerInputs.projectId}] [entityId=${entityId}]`
          )
        );
      }
      throw $toBadRequest(err, `Failed to create Neon ${providerInputs.leaseType}`, [apiKey, password]);
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await $parseInputs(inputs);
    const errorPrefix = `Failed to revoke Neon ${providerInputs.leaseType}`;

    let operations: TNeonOperation[] | undefined;
    try {
      ({
        data: { operations }
      } = await $withLockedRetry(() =>
        safeRequest.delete<TNeonOperationsResponse>(
          $leaseUrl(providerInputs, entityId),
          $requestConfig(providerInputs.apiKey)
        )
      ));
    } catch (err) {
      // already gone, e.g. deleted in the Neon console or removed by the branch's expiration time
      if (isAxiosError(err) && err.response?.status === 404) return { entityId };
      throw $toBadRequest(err, errorPrefix, [providerInputs.apiKey]);
    }

    try {
      // Neon deletes asynchronously; the lease only closes once the role or branch is actually gone
      await $waitForOperations(providerInputs, operations);
    } catch (err) {
      throw $toBadRequest(err, errorPrefix, [providerInputs.apiKey]);
    }
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await $parseInputs(inputs);
    // Role credentials don't expire in Neon; Infisical revokes the role when the lease expires.
    if (providerInputs.leaseType !== NeonLeaseType.Branch) return { entityId };

    const branchUrl = $branchUrl(providerInputs, entityId);
    const config = $requestConfig(providerInputs.apiKey);
    try {
      if (!providerInputs.setBranchExpiration) {
        // the setting can be turned off after a branch was created with an expiration time, and Neon
        // would still delete that branch at its old time
        const { data } = await safeRequest.get<{ branch: TNeonBranch }>(branchUrl, config);
        if (!data.branch.expires_at) return { entityId };
      }

      await $withLockedRetry(() =>
        safeRequest.patch(branchUrl, { branch: { expires_at: toNeonTimestamp(expireAt) } }, config)
      );
      return { entityId };
    } catch (err) {
      throw $toBadRequest(err, "Failed to renew Neon branch", [providerInputs.apiKey]);
    }
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
