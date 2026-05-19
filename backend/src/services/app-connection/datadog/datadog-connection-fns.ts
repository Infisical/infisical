import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { DatadogConnectionMethod } from "./datadog-connection-enums";
import { TDatadogConnection, TDatadogConnectionConfig, TDatadogServiceAccount } from "./datadog-connection-types";

const DATADOG_ALLOWED_DOMAIN_SUFFIXES = ["datadoghq.com", "datadoghq.eu", "ddog-gov.com"];

export const getDatadogBaseUrl = async (config: TDatadogConnectionConfig) => {
  const rawUrl = removeTrailingSlash(config.credentials.url);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError({ message: "Invalid Datadog URL" });
  }

  const { hostname } = parsed;
  const isAllowedHost = DATADOG_ALLOWED_DOMAIN_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
  if (!isAllowedHost) {
    throw new BadRequestError({
      message: "Datadog URL must end with datadoghq.com, datadoghq.eu, or ddog-gov.com"
    });
  }

  await blockLocalAndPrivateIpAddresses(rawUrl);

  return rawUrl;
};

export const getDatadogConnectionListItem = () => {
  return {
    name: "Datadog" as const,
    app: AppConnection.Datadog as const,
    methods: Object.values(DatadogConnectionMethod) as [DatadogConnectionMethod.ApiKey]
  };
};

export const getDatadogAuthHeaders = (credentials: { apiKey: string; applicationKey: string }) => ({
  "DD-API-KEY": credentials.apiKey,
  "DD-APPLICATION-KEY": credentials.applicationKey,
  Accept: "application/json"
});

type TDatadogJsonApiError = { detail?: string; title?: string; status?: string };

// Datadog v2 errors use JSON:API shape: { errors: [{ detail, title, status }] }.
// Surface the most actionable field; fall back to axios error.message.
export const getDatadogErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const errors = (error.response?.data as { errors?: TDatadogJsonApiError[] } | undefined)?.errors;
    const first = errors?.[0];
    if (first?.detail) return first.detail;
    if (first?.title) return first.title;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Unknown error";
};

export const validateDatadogConnectionCredentials = async (config: TDatadogConnectionConfig) => {
  const baseUrl = await getDatadogBaseUrl(config);

  try {
    await request.get(`${baseUrl}/api/v2/permissions`, { headers: getDatadogAuthHeaders(config.credentials) });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to validate Datadog credentials: ${getDatadogErrorMessage(error)}`
    });
  }

  return config.credentials;
};

type TDatadogServiceAccountEntry = {
  id: string;
  type: string;
  attributes?: {
    name?: string | null;
    email?: string | null;
    handle?: string | null;
    disabled?: boolean;
  };
};

type TDatadogServiceAccountResponse = {
  data: TDatadogServiceAccountEntry[];
  meta?: {
    page?: {
      total_count?: number;
    };
  };
};

export const listDatadogServiceAccounts = async (connection: TDatadogConnection): Promise<TDatadogServiceAccount[]> => {
  const baseUrl = await getDatadogBaseUrl(connection);
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;

  const rawEntries: TDatadogServiceAccountEntry[] = [];

  try {
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await request.get<TDatadogServiceAccountResponse>(`${baseUrl}/api/v2/users`, {
        params: {
          "filter[service_account]": "true",
          "page[size]": PAGE_SIZE,
          "page[number]": pageNumber
        },
        headers: getDatadogAuthHeaders(connection.credentials)
      });

      const pageEntries = data.data ?? [];
      rawEntries.push(...pageEntries);

      const totalCount = data.meta?.page?.total_count;
      if (pageEntries.length < PAGE_SIZE) break;
      if (typeof totalCount === "number" && rawEntries.length >= totalCount) break;
    }
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to list Datadog service accounts: ${getDatadogErrorMessage(error)}`
    });
  }

  return rawEntries
    .filter((entry) => !entry.attributes?.disabled)
    .map((entry) => ({
      id: entry.id,
      name: entry.attributes?.name || entry.attributes?.email || entry.attributes?.handle || entry.id
    }));
};
