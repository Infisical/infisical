import { isAxiosError } from "axios";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import {
  DynamicSecretNeonSchema,
  NeonLeaseType,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";
import { generateUsername } from "./templateUtils";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";

// Neon role and branch names generated from {{randomUsername}} stay lowercase so the connection
// string never needs quoted identifiers.
const NEON_NAME_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

// https://api-docs.neon.tech/reference/getprojectoperation: "failed" operations are retried by
// Neon (see failures_count / retry_at), so only "error" and "cancelled" are terminal failures.
const NEON_OPERATION_DONE_STATUSES = new Set(["finished", "skipped"]);
const NEON_OPERATION_FAILED_STATUSES = new Set(["error", "cancelled"]);

type TNeonProviderInputs = z.infer<typeof DynamicSecretNeonSchema>;

type TNeonOperation = { id: string; status: string; action?: string; error?: string };

type TNeonBranch = { id: string; name: string; default?: boolean };

type TNeonCreateRoleResponse = { role: { name: string; password?: string }; operations?: TNeonOperation[] };

type TNeonCreateBranchResponse = { branch: TNeonBranch; operations?: TNeonOperation[] };

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

export const NeonProvider = ({
  pollIntervalMs = 1000,
  operationTimeoutMs = 60_000,
  lockedRetries = 5
}: TNeonOptions = {}): TDynamicProviderFns => {
  const $parseInputs = async (inputs: unknown) => DynamicSecretNeonSchema.parseAsync(inputs);

  const validateProviderInputs = async (inputs: object, metadata?: TDynamicProviderValidateMetadata) => {
    const providerInputs = await $parseInputs(inputs);
    if (!metadata?.hasActiveLeases || !metadata.previousInputs) return providerInputs;

    // Revocation reads the project, lease type and (for role leases) branch from the current
    // config, so changing them would orphan the roles or branches of existing leases.
    const previous = metadata.previousInputs as Partial<TNeonProviderInputs>;
    const previousLeaseType = previous.leaseType ?? NeonLeaseType.Role;
    const lockedFields: [string, boolean][] = [
      ["project ID", previous.projectId !== undefined && previous.projectId !== providerInputs.projectId],
      ["lease type", previousLeaseType !== providerInputs.leaseType],
      [
        "branch",
        providerInputs.leaseType === NeonLeaseType.Role &&
          previous.branchId !== undefined &&
          previous.branchId !== providerInputs.branchId
      ]
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
    timeout: 30_000
  });

  const $projectUrl = (projectId: string) => `${NEON_API_BASE_URL}/projects/${encodeURIComponent(projectId)}`;

  const $status = (err: unknown) => (isAxiosError(err) ? err.response?.status : undefined);

  // Surfaces Neon's own error message ({ code, message }) instead of Axios' generic status text
  const $getErrorMessage = (err: unknown): string => {
    if (isAxiosError<{ message?: string } | string>(err) && err.response) {
      const { data } = err.response;
      if (typeof data === "string" && data) return data;
      if (data && typeof data === "object" && data.message) return data.message;
      if (data) return JSON.stringify(data);
    }
    return (err as Error)?.message;
  };

  const $toBadRequest = (err: unknown, prefix: string, tokens: string[]) => {
    if (err instanceof BadRequestError) return err;
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: $getErrorMessage(err),
      tokens: tokens.filter(Boolean)
    });
    return new BadRequestError({ message: `${prefix}: ${sanitizedErrorMessage}` });
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
  const $waitForOperations = async (apiKey: string, projectId: string, operations: TNeonOperation[] = []) => {
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
            `${$projectUrl(projectId)}/operations/${encodeURIComponent(op.id)}`,
            $requestConfig(apiKey)
          );
          return { ...op, ...data.operation };
        })
      ).then((ops) => ops.filter((op) => !NEON_OPERATION_DONE_STATUSES.has(op.status)));
    }
  };

  const $getConnectionUri = async (providerInputs: TNeonProviderInputs, branchId: string, roleName: string) => {
    const { data } = await safeRequest.get<{ uri: string }>(`${$projectUrl(providerInputs.projectId)}/connection_uri`, {
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

  const $leaseData = (uri: string, extra: Record<string, string> = {}) => {
    const parsed = new URL(uri);
    return {
      DATABASE_URL: uri,
      DB_HOST: parsed.hostname,
      DB_NAME: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      DB_USERNAME: decodeURIComponent(parsed.username),
      DB_PASSWORD: decodeURIComponent(parsed.password),
      ...extra
    };
  };

  // Branch leases fork from the configured branch, or from the project's default branch
  const $resolveParentBranchId = async (providerInputs: TNeonProviderInputs) => {
    if (providerInputs.branchId) return providerInputs.branchId;

    let cursor: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await safeRequest.get<{ branches: TNeonBranch[]; pagination?: { next?: string } }>(
        `${$projectUrl(providerInputs.projectId)}/branches`,
        { ...$requestConfig(providerInputs.apiKey), params: { limit: 100, ...(cursor ? { cursor } : {}) } }
      );
      const defaultBranch = data.branches.find((branch) => branch.default);
      if (defaultBranch) return defaultBranch.id;
      cursor = data.branches.length ? data.pagination?.next : undefined;
    } while (cursor);

    throw new BadRequestError({ message: "Neon project has no default branch; set a parent branch ID" });
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await $parseInputs(inputs);
    const config = $requestConfig(providerInputs.apiKey);
    const projectUrl = $projectUrl(providerInputs.projectId);

    try {
      // Confirms the API key can see the project, the branch exists, and the database (and for
      // branch leases the role) exists on it, so misconfiguration fails on save rather than on lease.
      await safeRequest.get(projectUrl, config);
      const branchId = await $resolveParentBranchId(providerInputs);
      const branchUrl = `${projectUrl}/branches/${encodeURIComponent(branchId)}`;
      await safeRequest.get(branchUrl, config);
      await safeRequest.get(`${branchUrl}/databases/${encodeURIComponent(providerInputs.databaseName)}`, config);
      if (providerInputs.leaseType === NeonLeaseType.Branch && providerInputs.roleName) {
        await safeRequest.get(`${branchUrl}/roles/${encodeURIComponent(providerInputs.roleName)}`, config);
      }
      return true;
    } catch (err) {
      throw $toBadRequest(err, "Failed to connect with Neon", [providerInputs.apiKey]);
    }
  };

  const $createRoleLease = async (
    providerInputs: TNeonProviderInputs,
    { usernameTemplate, inputs, dynamicSecret, identity }: Parameters<TDynamicProviderFns["create"]>[0]
  ) => {
    const branchId = providerInputs.branchId as string;
    const rolesUrl = `${$projectUrl(providerInputs.projectId)}/branches/${encodeURIComponent(branchId)}/roles`;
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
            $requestConfig(providerInputs.apiKey)
          )
        )
      ).data;
      await $waitForOperations(providerInputs.apiKey, providerInputs.projectId, created.operations);
      const uri = await $getConnectionUri(providerInputs, branchId, created.role.name);
      return { entityId: created.role.name, data: $leaseData(uri) };
    } catch (err) {
      if (created) {
        // don't leave a role behind that no lease points at
        const orphanUrl = `${rolesUrl}/${encodeURIComponent(created.role.name)}`;
        await $withLockedRetry(() => safeRequest.delete(orphanUrl, $requestConfig(providerInputs.apiKey))).catch(
          () => undefined
        );
      }
      throw $toBadRequest(err, "Failed to create Neon role", [providerInputs.apiKey, created?.role.password ?? ""]);
    }
  };

  const $createBranchLease = async (
    providerInputs: TNeonProviderInputs,
    { usernameTemplate, inputs, dynamicSecret, identity, expireAt }: Parameters<TDynamicProviderFns["create"]>[0]
  ) => {
    const { apiKey, projectId } = providerInputs;
    const roleName = providerInputs.roleName as string;
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
          `${$projectUrl(projectId)}/branches`,
          {
            branch: {
              name: branchName,
              ...(providerInputs.branchId ? { parent_id: providerInputs.branchId } : {}),
              ...(providerInputs.setBranchExpiration ? { expires_at: toNeonTimestamp(expireAt) } : {})
            },
            endpoints: [{ type: "read_write" }]
          },
          $requestConfig(apiKey)
        )
      );
      branch = data.branch;
      await $waitForOperations(apiKey, projectId, data.operations);

      const branchUrl = `${$projectUrl(projectId)}/branches/${encodeURIComponent(branch.id)}`;
      if (providerInputs.resetRolePassword) {
        // A branch inherits its parent's roles and passwords. Rotating the password on the new
        // branch keeps the lease from handing out credentials that also work on the parent.
        const { data: reset } = await $withLockedRetry(() =>
          safeRequest.post<TNeonCreateRoleResponse>(
            `${branchUrl}/roles/${encodeURIComponent(roleName)}/reset_password`,
            {},
            $requestConfig(apiKey)
          )
        );
        resetPassword = reset.role.password ?? "";
        await $waitForOperations(apiKey, projectId, reset.operations);
      }

      const uri = await $getConnectionUri(providerInputs, branch.id, roleName);
      return {
        entityId: branch.id,
        data: $leaseData(uri, { BRANCH_ID: branch.id, BRANCH_NAME: branch.name })
      };
    } catch (err) {
      if (branch) {
        const branchId = branch.id;
        await $withLockedRetry(() =>
          safeRequest.delete(
            `${$projectUrl(projectId)}/branches/${encodeURIComponent(branchId)}`,
            $requestConfig(apiKey)
          )
        ).catch(() => undefined);
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

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await $parseInputs(inputs);
    const projectUrl = $projectUrl(providerInputs.projectId);
    const url =
      providerInputs.leaseType === NeonLeaseType.Branch
        ? `${projectUrl}/branches/${encodeURIComponent(entityId)}`
        : `${projectUrl}/branches/${encodeURIComponent(providerInputs.branchId as string)}/roles/${encodeURIComponent(entityId)}`;

    try {
      await $withLockedRetry(() => safeRequest.delete(url, $requestConfig(providerInputs.apiKey)));
    } catch (err) {
      // already gone, e.g. deleted in the Neon console or removed by the branch's expiration time
      if ($status(err) !== 404) {
        const what = providerInputs.leaseType === NeonLeaseType.Branch ? "branch" : "role";
        throw $toBadRequest(err, `Failed to revoke Neon ${what}`, [providerInputs.apiKey]);
      }
    }
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await $parseInputs(inputs);
    // Role credentials don't expire in Neon, and branches only do when an expiration time was set;
    // either way Infisical revokes the lease when it expires.
    if (providerInputs.leaseType !== NeonLeaseType.Branch || !providerInputs.setBranchExpiration) {
      return { entityId };
    }

    try {
      await $withLockedRetry(() =>
        safeRequest.patch(
          `${$projectUrl(providerInputs.projectId)}/branches/${encodeURIComponent(entityId)}`,
          { branch: { expires_at: toNeonTimestamp(expireAt) } },
          $requestConfig(providerInputs.apiKey)
        )
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
