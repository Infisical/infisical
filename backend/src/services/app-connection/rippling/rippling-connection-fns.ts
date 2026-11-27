import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { RipplingConnectionMethod } from "./rippling-connection-enums";
import {
  TRipplingConnection,
  TRipplingConnectionConfig,
  TRipplingDevice,
  TRipplingWorker
} from "./rippling-connection-types";

const RIPPLING_API_URL = "https://rest.ripplingapis.com";
const RIPPLING_REQUEST_TIMEOUT_MS = 15_000;
const RIPPLING_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const RIPPLING_MAX_PAGES = 5;
const RIPPLING_REQUIRED_SCOPES_MESSAGE = "The token needs the devices.read and workers.read scopes";

const RipplingResource = {
  Devices: { path: "/devices/", scope: "devices.read" },
  Workers: { path: "/workers/", scope: "workers.read" }
} as const;

type TRipplingResource = (typeof RipplingResource)[keyof typeof RipplingResource];

type TRipplingRequestConfig = Pick<TRipplingConnectionConfig, "credentials">;

type TRipplingListResponse<T> = { results?: T[]; next_link?: string | null };

type TRawRipplingDevice = Partial<Omit<TRipplingDevice, "pending_actions">> & {
  pending_actions?: { action_type?: string; state?: string | null }[] | null;
};

type TRawRipplingWorker = Partial<TRipplingWorker>;

export const getRipplingConnectionListItem = () => ({
  name: "Rippling" as const,
  app: AppConnection.Rippling as const,
  methods: Object.values(RipplingConnectionMethod) as [RipplingConnectionMethod.ApiToken]
});

const ripplingRequest = async <T>(
  config: TRipplingRequestConfig,
  path: string,
  params: Record<string, string | number | undefined>
) => {
  const { data } = await request.get<T>(`${RIPPLING_API_URL}${path}`, {
    params,
    headers: { Authorization: `Bearer ${config.credentials.apiToken}`, Accept: "application/json" },
    timeout: RIPPLING_REQUEST_TIMEOUT_MS,
    maxContentLength: RIPPLING_MAX_RESPONSE_BYTES
  });
  return data;
};

export const getRipplingErrorMessage = (error: unknown, resource?: TRipplingResource) => {
  if (error instanceof BadRequestError) return error.message;

  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return `Couldn't reach Rippling: no response within ${RIPPLING_REQUEST_TIMEOUT_MS / 1000} seconds`;
    }

    const status = error.response?.status;
    if (status === 401) {
      return "Rippling rejected the API token. It is invalid or expired (Rippling revokes tokens unused for 30 days)";
    }
    if (status === 403) {
      const missing = resource ? ` (missing ${resource.scope})` : "";
      return `Rippling denied access${missing}. ${RIPPLING_REQUIRED_SCOPES_MESSAGE}`;
    }
    if (status === 429) return "Rippling is rate limiting requests, try again shortly";
    if (status) return `Rippling responded with status ${status}`;
    if (error.code) return `Couldn't reach Rippling (${error.code})`;
  }

  return "Couldn't reach Rippling";
};

const buildEqFilter = (field: string, value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestError({ message: `A ${label} is required to look it up in Rippling` });
  if (trimmed.includes("'")) {
    throw new BadRequestError({
      message: `The ${label} contains a single quote, which Rippling filters don't support`
    });
  }
  return `${field} eq '${trimmed}'`;
};

const fetchResults = async <T>(
  config: TRipplingRequestConfig,
  resource: TRipplingResource,
  params: Record<string, string | number | undefined>
) => {
  const results: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < RIPPLING_MAX_PAGES; page += 1) {
    let data: TRipplingListResponse<T> | undefined;
    try {
      // eslint-disable-next-line no-await-in-loop
      data = await ripplingRequest<TRipplingListResponse<T>>(config, resource.path, { ...params, cursor });
    } catch (error) {
      throw new BadRequestError({ message: getRipplingErrorMessage(error, resource) });
    }
    if (Array.isArray(data?.results)) results.push(...data.results);
    const nextLink = data?.next_link;
    cursor = nextLink ? (new URL(nextLink, RIPPLING_API_URL).searchParams.get("cursor") ?? undefined) : undefined;
    if (!cursor) return results;
  }
  logger.warn(`Rippling ${resource.path} lookup stopped after ${RIPPLING_MAX_PAGES} pages`);
  return results;
};

// A re-enrolled serial can have an old decommissioned record too, so the enrolled one wins
const pickDevice = (devices: TRawRipplingDevice[], serialNumber: string) => {
  const matching = devices.filter((device) => String(device.serial_number ?? "").trim() === serialNumber.trim());
  return matching.find((device) => device.enrollment_status === "ENROLLED") ?? matching[0] ?? null;
};

const toRipplingDevice = (raw: TRawRipplingDevice): TRipplingDevice => ({
  id: String(raw.id ?? ""),
  serial_number: String(raw.serial_number ?? ""),
  worker_id: raw.worker_id ?? null,
  platform: raw.platform ?? null,
  model: raw.model ?? null,
  os_name: raw.os_name ?? null,
  os_version: raw.os_version ?? null,
  lifecycle_state: raw.lifecycle_state ?? null,
  enrollment_status: raw.enrollment_status ?? null,
  is_managed: raw.is_managed ?? null,
  is_encrypted: raw.is_encrypted ?? null,
  last_checkin_at: raw.last_checkin_at ?? null,
  pending_actions: Array.isArray(raw.pending_actions)
    ? raw.pending_actions
        .filter((action) => typeof action?.action_type === "string")
        .map((action) => ({ action_type: action.action_type as string, state: action.state ?? null }))
    : undefined
});

export const getRipplingDeviceBySerial = async (
  connection: TRipplingConnection,
  serialNumber: string
): Promise<TRipplingDevice | null> => {
  const devices = await fetchResults<TRawRipplingDevice>(connection, RipplingResource.Devices, {
    filter: buildEqFilter("serial_number", serialNumber, "device serial number"),
    expand: "pending_actions"
  });
  const device = pickDevice(devices, serialNumber);
  return device ? toRipplingDevice(device) : null;
};

export const getRipplingWorkerByEmail = async (
  connection: TRipplingConnection,
  email: string
): Promise<TRipplingWorker | null> => {
  const workers = await fetchResults<TRawRipplingWorker>(connection, RipplingResource.Workers, {
    filter: buildEqFilter("work_email", email, "work email")
  });
  const worker =
    workers.find((candidate) => (candidate.work_email ?? "").trim().toLowerCase() === email.trim().toLowerCase()) ??
    null;
  return worker
    ? { id: String(worker.id ?? ""), status: worker.status ?? null, work_email: worker.work_email ?? null }
    : null;
};

export const validateRipplingConnectionCredentials = async (config: TRipplingConnectionConfig) => {
  for (const resource of [RipplingResource.Devices, RipplingResource.Workers]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await ripplingRequest(config, resource.path, { limit: 1 });
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection: ${getRipplingErrorMessage(error, resource)}`
      });
    }
  }

  return config.credentials;
};
