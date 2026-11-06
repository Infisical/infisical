import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { IncidentIoConnectionMethod } from "./incident-io-connection-enums";
import {
  TIncidentIoConnectionConfig,
  TIncidentIoSchedule,
  TIncidentIoScheduleEntry
} from "./incident-io-connection-types";

const INCIDENT_IO_API_URL = "https://api.incident.io";
const INCIDENT_IO_REQUEST_TIMEOUT_MS = 15_000;
const INCIDENT_IO_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const INCIDENT_IO_PAGE_SIZE = 100;
const INCIDENT_IO_MAX_PAGES = 20;
const INCIDENT_IO_MAX_ERROR_DETAIL_LENGTH = 300;

type TIncidentIoRequestConfig = Pick<TIncidentIoConnectionConfig, "credentials">;

export const getIncidentIoConnectionListItem = () => ({
  name: "incident.io" as const,
  app: AppConnection.IncidentIo as const,
  methods: Object.values(IncidentIoConnectionMethod) as [IncidentIoConnectionMethod.ApiKey]
});

const incidentIoRequest = async <T>(
  config: TIncidentIoRequestConfig,
  path: string,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal
) => {
  const { data } = await request.get<T>(`${INCIDENT_IO_API_URL}${path}`, {
    params,
    headers: { Authorization: `Bearer ${config.credentials.apiKey}`, Accept: "application/json" },
    timeout: INCIDENT_IO_REQUEST_TIMEOUT_MS,
    maxContentLength: INCIDENT_IO_MAX_RESPONSE_BYTES,
    signal
  });
  return data;
};

export const getIncidentIoErrorMessage = (error: unknown) => {
  if (error instanceof BadRequestError) return error.message;

  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return `incident.io did not respond within ${INCIDENT_IO_REQUEST_TIMEOUT_MS / 1000} seconds`;
    }

    const status = error.response?.status;
    if (status === 401) return "incident.io rejected the connection's API key";
    if (status === 403) {
      return "The connection's incident.io API key doesn't have permission for this. Give it the View on-call resources permission";
    }
    if (status === 429) return "incident.io is rate limiting the connection's API key";

    const errors = (error.response?.data as { errors?: unknown } | undefined)?.errors;
    const detail = (Array.isArray(errors) ? (errors as { message?: unknown }[]) : [])
      .map((entry) => entry?.message)
      .find((message): message is string => typeof message === "string" && Boolean(message.trim()));
    if (detail) return detail.slice(0, INCIDENT_IO_MAX_ERROR_DETAIL_LENGTH);

    if (status) return `incident.io responded with status ${status}`;
    if (error.code) return `Couldn't reach incident.io (${error.code})`;
  }

  return "Couldn't reach incident.io";
};

export const validateIncidentIoConnectionCredentials = async (config: TIncidentIoConnectionConfig) => {
  try {
    await incidentIoRequest(config, "/v2/schedules", { page_size: 1 });
  } catch (error) {
    throw new BadRequestError({ message: `Unable to validate connection: ${getIncidentIoErrorMessage(error)}` });
  }

  return config.credentials;
};

export const listIncidentIoSchedules = async (
  config: TIncidentIoRequestConfig,
  signal?: AbortSignal
): Promise<TIncidentIoSchedule[]> => {
  const schedules: TIncidentIoSchedule[] = [];
  let after: string | undefined;
  let page = 0;

  do {
    // eslint-disable-next-line no-await-in-loop
    const data = await incidentIoRequest<{
      schedules?: TIncidentIoSchedule[];
      pagination_meta?: { after?: string | null };
    }>(config, "/v2/schedules", { page_size: INCIDENT_IO_PAGE_SIZE, after }, signal);

    schedules.push(...(Array.isArray(data?.schedules) ? data.schedules : []).map(({ id, name }) => ({ id, name })));
    after = data?.pagination_meta?.after || undefined;
    page += 1;
  } while (after && page < INCIDENT_IO_MAX_PAGES);

  // A schedule that wasn't read could share a name with one that was
  if (after) {
    throw new BadRequestError({
      message: `incident.io has more than ${INCIDENT_IO_PAGE_SIZE * INCIDENT_IO_MAX_PAGES} schedules, more than Infisical can read`
    });
  }

  return schedules;
};

// Final entries have overrides merged in, so they match who incident.io shows as on call
export const listIncidentIoShiftsAt = async (
  config: TIncidentIoRequestConfig,
  scheduleId: string,
  at: Date,
  signal?: AbortSignal
): Promise<TIncidentIoScheduleEntry[]> => {
  const data = await incidentIoRequest<{ schedule_entries?: { final?: TIncidentIoScheduleEntry[] } }>(
    config,
    "/v2/schedule_entries",
    {
      schedule_id: scheduleId,
      entry_window_start: at.toISOString(),
      entry_window_end: new Date(at.getTime() + 60_000).toISOString()
    },
    signal
  );

  const time = at.getTime();
  const entries = data?.schedule_entries?.final;
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => Date.parse(entry.start_at) <= time && time < Date.parse(entry.end_at)
  );
};
