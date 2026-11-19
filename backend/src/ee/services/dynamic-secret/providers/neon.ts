import { isAxiosError } from "axios";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
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
const BRANCH_PAGE_SIZE = 100;
const BRANCH_MAX_PAGES = 100;

// Neon role and branch names generated from {{randomUsername}} stay lowercase so the connection
// string never needs quoted identifiers.
const NEON_NAME_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

// https://api-docs.neon.tech/reference/getprojectoperation: "failed" operations are retried by
// Neon (see failures_count / retry_at), so only "error" and "cancelled" are terminal failures.
const NEON_OPERATION_DONE_STATUSES = new Set(["finished", "skipped"]);
const NEON_OPERATION_FAILED_STATUSES = new Set(["error", "cancelled"]);

const NeonLeaseDataSchema = z.object({
  BRANCH_ID: z.string().min(1)
});

type TNeonProviderInputs = z.infer<typeof DynamicSecretNeonSchema>;
type TNeonRoleInputs = Extract<TNeonProviderInputs, { leaseType: NeonLeaseType.Role }>;
type TNeonBranchInputs = Extract<TNeonProviderInputs, { leaseType: NeonLeaseType.Branch }>;

type TNeonOperation = { id: string; status: string; action?: string; error?: string };

type TNeonBranch = { id: string; name: string; default?: boolean; expires_at?: string | null };

type TNeonOperationsResponse = { operations?: TNeonOperation[] };

type TNeonCreateRoleResponse = TNeonOperationsResponse & { role: { name: string; password?: string } };

type TNeonCreateBranchResponse = TNeonOperationsResponse & { branch: TNeonBranch };

type TNeonOptions = {
  // how often to poll an unfinished Neon operation, and how long to wait for it overall
  pollIntervalMs?: number;
  operationTimeoutMs?: number;
  // how many times to retry a request Neon rejects with 423 Locked (another operation in progress)
  lockedRetries?: number;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Neon accepts RFC 3339 timestamps with precision up to seconds
const toNeonTimestamp = (epochMs: number) => new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, "Z");

const apiBaseUrl = (baseUrl?: string | null) => (baseUrl ? removeTrailingSlash(baseUrl) : NEON_API_BASE_URL);

export const NeonProvider = ({
  pollIntervalMs = 1000,
  operationTimeoutMs = 60_000,
  lockedRetries = 5
}: TNeonOptions = {}): TDynamicProviderFns => {
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
    { previousInputs, hasActiveLeases, omittedSecretFields }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await $parseInputs(inputs);
    if (!previousInputs) return providerInputs;

    const previous = previousInputs as { baseUrl?: unknown; projectId?: unknown; leaseType?: unknown };
    const isBaseUrlChanged =
      apiBaseUrl(typeof previous.baseUrl === "string" ? previous.baseUrl : null) !== apiBaseUrl(providerInputs.baseUrl);

    if (hasActiveLeases) {
      // revocation deletes each lease's role or branch through this API, project and lease type
      const lockedFields: [string, boolean][] = [
        ["API base URL", isBaseUrlChanged],
        ["project ID", typeof previous.projectId === "string" && previous.projectId !== providerInputs.projectId],
        ["lease type", typeof previous.leaseType === "string" && previous.leaseType !== providerInputs.leaseType]
      ];
      const changed = lockedFields.find(([, isChanged]) => isChanged);
      if (changed) {
        throw new BadRequestError({
          message: `The ${changed[0]} can't be changed while this dynamic secret has active leases, because revoking them needs the current value. Revoke the active leases first, then make the change.`
        });
      }
    }

    // anyone allowed to edit could otherwise point the API base URL at their own server and receive the saved key
    if (isBaseUrlChanged && omittedSecretFields?.includes("apiKey")) {
      throw new BadRequestError({
        message:
          "Enter the API key again to change the API base URL. Infisical only sends the saved API key to the URL it was saved with."
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

  const $projectUrl = ({ baseUrl, projectId }: Pick<TNeonProviderInputs, "baseUrl" | "projectId">) =>
    `${apiBaseUrl(baseUrl)}/projects/${encodeURIComponent(projectId)}`;

  const $branchUrl = (providerInputs: TNeonProviderInputs, branchId: string) =>
    `${$projectUrl(providerInputs)}/branches/${encodeURIComponent(branchId)}`;

  const $status = (err: unknown) => (isAxiosError(err) ? err.response?.status : undefined);

  // Surfaces Neon's own error message ({ code, message }) instead of Axios' generic status text
  const $getErrorMessage = (err: unknown, tokens: string[]): string => {
    let message = (err as Error)?.message || "Unknown error";
    if (isAxiosError<{ message?: string } | string>(err) && err.response) {
      const { data } = err.response;
      if (typeof data === "string" && data) message = data;
      else if (data && typeof data === "object" && data.message) message = data.message;
      else if (data) message = JSON.stringify(data);
    }
    return sanitizeString({ unsanitizedString: message, tokens: tokens.filter(Boolean) });
  };

  const $toBadRequest = (err: unknown, prefix: string, tokens: string[]) => {
    if (err instanceof BadRequestError) return err;
    return new BadRequestError({ message: `${prefix}: ${$getErrorMessage(err, tokens)}` });
  };

  // Neon answers 423 Locked while another operation holds the branch; the docs say it is safe to retry.
  const $withLockedRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn();
      } catch (err) {
        if ($status(err) !== 423 || attempt >= lockedRetries) throw err;
        // eslint-disable-next-line no-await-in-loop
        await sleep(pollIntervalMs * 2 ** attempt);
      }
    }
  };

  // Role and branch changes are applied asynchronously. Wait for them so the credentials returned
  // to the caller work immediately, and so the next request on the branch isn't rejected as locked.
  const $waitForOperations = async (providerInputs: TNeonProviderInputs, operations: TNeonOperation[] = []) => {
    let pending = operations.filter((op) => !NEON_OPERATION_DONE_STATUSES.has(op.status));
    const deadline = Date.now() + operationTimeoutMs;

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
      await sleep(pollIntervalMs);
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

  const $getConnectionUri = async (providerInputs: TNeonProviderInputs, branchId: string, roleName: string) => {
    const { data } = await safeRequest.get<{ uri: string }>(`${$projectUrl(providerInputs)}/connection_uri`, {
      ...$requestConfig(providerInputs.apiKey),
      params: {
        branch_id: branchId,
        database_name: providerInputs.databaseName,
        role_name: roleName,
        pooled: providerInputs.pooled
      }
    });
    return data.uri;
  };

  const $leaseData = (uri: string, branch: Record<string, string>) => {
    const parsed = new URL(uri);
    return {
      DATABASE_URL: uri,
      DB_HOST: parsed.hostname,
      DB_NAME: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      DB_USERNAME: decodeURIComponent(parsed.username),
      DB_PASSWORD: decodeURIComponent(parsed.password),
      ...branch
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
      // Confirms the API key can see the project, the branch exists, and the database (and for
      // branch leases the role) exists on it, so misconfiguration fails on save rather than on lease.
      await safeRequest.get($projectUrl(providerInputs), config);
      const branchId =
        providerInputs.leaseType === NeonLeaseType.Branch
          ? await $resolveParentBranchId(providerInputs)
          : providerInputs.branchId;
      const branchUrl = $branchUrl(providerInputs, branchId);
      await safeRequest.get(branchUrl, config);
      await safeRequest.get(`${branchUrl}/databases/${encodeURIComponent(providerInputs.databaseName)}`, config);
      if (providerInputs.leaseType === NeonLeaseType.Branch) {
        await safeRequest.get(`${branchUrl}/roles/${encodeURIComponent(providerInputs.roleName)}`, config);
      }
      return true;
    } catch (err) {
      throw $toBadRequest(err, "Failed to connect with Neon", [providerInputs.apiKey]);
    }
  };

  // Runs only after a lease failed to be created, so nothing else would ever delete what it leaves behind
  const $deleteAfterFailedCreate = async (providerInputs: TNeonProviderInputs, url: string, resource: string) => {
    try {
      await $withLockedRetry(() => safeRequest.delete(url, $requestConfig(providerInputs.apiKey)));
    } catch (err) {
      logger.error(
        `Neon dynamic secret: failed to delete ${resource} after lease creation failed, delete it in Neon [projectId=${providerInputs.projectId}]: ${$getErrorMessage(err, [providerInputs.apiKey])}`
      );
    }
  };

  const $createRoleLease = async (
    providerInputs: TNeonRoleInputs,
    { usernameTemplate, inputs, dynamicSecret, identity }: Parameters<TDynamicProviderFns["create"]>[0]
  ) => {
    const { apiKey, branchId } = providerInputs;
    const rolesUrl = `${$branchUrl(providerInputs, branchId)}/roles`;
    const roleName = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      usernameCharset: NEON_NAME_CHARSET
    });

    let created: TNeonCreateRoleResponse | undefined;
    try {
      created = (
        await $withLockedRetry(() =>
          safeRequest.post<TNeonCreateRoleResponse>(
            rolesUrl,
            { role: { name: roleName } },
            $createRequestConfig(apiKey)
          )
        )
      ).data;
      await $waitForOperations(providerInputs, created.operations);
      const uri = await $getConnectionUri(providerInputs, branchId, created.role.name);
      return { entityId: created.role.name, data: $leaseData(uri, { BRANCH_ID: branchId }) };
    } catch (err) {
      if (created) {
        await $deleteAfterFailedCreate(
          providerInputs,
          `${rolesUrl}/${encodeURIComponent(created.role.name)}`,
          `role '${created.role.name}' on branch '${branchId}'`
        );
      }
      throw $toBadRequest(err, "Failed to create Neon role", [apiKey, created?.role.password ?? ""]);
    }
  };

  const $createBranchLease = async (
    providerInputs: TNeonBranchInputs,
    { usernameTemplate, inputs, dynamicSecret, identity, expireAt }: Parameters<TDynamicProviderFns["create"]>[0]
  ) => {
    const { apiKey, roleName } = providerInputs;
    const branchName = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      usernameCharset: NEON_NAME_CHARSET
    });

    let branch: TNeonBranch | undefined;
    let resetPassword = "";
    try {
      const { data } = await $withLockedRetry(() =>
        safeRequest.post<TNeonCreateBranchResponse>(
          `${$projectUrl(providerInputs)}/branches`,
          {
            branch: {
              name: branchName,
              ...(providerInputs.parentBranchId ? { parent_id: providerInputs.parentBranchId } : {}),
              ...(providerInputs.setBranchExpiration ? { expires_at: toNeonTimestamp(expireAt) } : {})
            },
            endpoints: [{ type: "read_write" }]
          },
          $createRequestConfig(apiKey)
        )
      );
      branch = data.branch;
      await $waitForOperations(providerInputs, data.operations);

      if (providerInputs.resetRolePassword) {
        // A branch inherits its parent's roles and passwords. Rotating the password on the new
        // branch keeps the lease from handing out credentials that also work on the parent.
        const { data: reset } = await $withLockedRetry(() =>
          safeRequest.post<TNeonCreateRoleResponse>(
            `${$branchUrl(providerInputs, data.branch.id)}/roles/${encodeURIComponent(roleName)}/reset_password`,
            {},
            $requestConfig(apiKey)
          )
        );
        resetPassword = reset.role.password ?? "";
        await $waitForOperations(providerInputs, reset.operations);
      }

      const uri = await $getConnectionUri(providerInputs, branch.id, roleName);
      return {
        entityId: branch.id,
        data: $leaseData(uri, { BRANCH_ID: branch.id, BRANCH_NAME: branch.name })
      };
    } catch (err) {
      if (branch) {
        await $deleteAfterFailedCreate(providerInputs, $branchUrl(providerInputs, branch.id), `branch '${branch.id}'`);
      }
      throw $toBadRequest(err, "Failed to create Neon branch", [apiKey, resetPassword]);
    }
  };

  const create = async (data: Parameters<TDynamicProviderFns["create"]>[0]) => {
    const providerInputs = await $parseInputs(data.inputs);
    return providerInputs.leaseType === NeonLeaseType.Branch
      ? $createBranchLease(providerInputs, data)
      : $createRoleLease(providerInputs, data);
  };

  const revoke = async (inputs: unknown, entityId: string, { leaseData }: { leaseData?: Record<string, string> }) => {
    const providerInputs = await $parseInputs(inputs);
    const resource = providerInputs.leaseType === NeonLeaseType.Branch ? "branch" : "role";

    let url = $branchUrl(providerInputs, entityId);
    if (providerInputs.leaseType === NeonLeaseType.Role) {
      // the role is on the branch it was created on, which the dynamic secret may no longer point at
      const lease = NeonLeaseDataSchema.safeParse(leaseData);
      if (!lease.success) {
        throw new BadRequestError({
          message:
            "This lease has no stored Neon branch, so Infisical can't revoke its role. Force delete the lease to remove it, then delete the role in the Neon Console."
        });
      }
      url = `${$branchUrl(providerInputs, lease.data.BRANCH_ID)}/roles/${encodeURIComponent(entityId)}`;
    }

    let operations: TNeonOperation[] | undefined;
    try {
      ({
        data: { operations }
      } = await $withLockedRetry(() =>
        safeRequest.delete<TNeonOperationsResponse>(url, $requestConfig(providerInputs.apiKey))
      ));
    } catch (err) {
      // already gone, e.g. deleted in the Neon console or removed by the branch's expiration time
      if ($status(err) === 404) return { entityId };
      throw $toBadRequest(err, `Failed to revoke Neon ${resource}`, [providerInputs.apiKey]);
    }

    try {
      // Neon deletes asynchronously; the lease only closes once the role or branch is actually gone
      await $waitForOperations(providerInputs, operations);
    } catch (err) {
      throw $toBadRequest(err, `Failed to revoke Neon ${resource}`, [providerInputs.apiKey]);
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
    persistedLeaseFields: ["BRANCH_ID"],
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
