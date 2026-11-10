import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AnthropicConnectionMethod } from "./anthropic-connection-enums";
import {
  TAnthropicConnectionConfig,
  TAnthropicMessageRequest,
  TAnthropicMessageResponse
} from "./anthropic-connection-types";

export const ANTHROPIC_API_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_MODELS_PAGE_SIZE = 1000;
const ANTHROPIC_MODELS_MAX_PAGES = 5;
const ANTHROPIC_MAX_ERROR_DETAIL_LENGTH = 300;

const getAnthropicHeaders = (apiKey: string) => ({
  "x-api-key": apiKey,
  "anthropic-version": ANTHROPIC_API_VERSION
});

export const getAnthropicConnectionListItem = () => {
  return {
    name: "Anthropic" as const,
    app: AppConnection.Anthropic as const,
    methods: Object.values(AnthropicConnectionMethod) as [AnthropicConnectionMethod.ApiKey]
  };
};

export const validateAnthropicConnectionCredentials = async (config: TAnthropicConnectionConfig) => {
  const { apiKey } = config.credentials;

  try {
    await request.get(`${ANTHROPIC_API_BASE_URL}/models`, {
      headers: getAnthropicHeaders(apiKey),
      validateStatus: (status) => status === 200
    });
  } catch {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key"
    });
  }

  return config.credentials;
};

export const getAnthropicErrorMessage = (error: unknown) => {
  if (!isAxiosError(error)) return "Couldn't reach Anthropic";

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "Anthropic didn't respond in time";
  if (error.code === "ERR_CANCELED") return "The request to Anthropic was cancelled";

  const status = error.response?.status;
  if (status === 401) return "Anthropic rejected the connection's API key";
  if (status === 403) return "The connection's Anthropic API key doesn't have permission for this";
  if (status === 429) return "Anthropic rate limited the request. Try again shortly";
  if (status === 529) return "Anthropic is overloaded. Try again shortly";

  const detail = (error.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message;
  if (typeof detail === "string" && detail.trim()) return detail.slice(0, ANTHROPIC_MAX_ERROR_DETAIL_LENGTH);

  if (status) return `Anthropic responded with status ${status}`;
  return "Couldn't reach Anthropic";
};

// "Claude Opus 4.5" and "Claude 3.5 Sonnet" both belong to "Claude Opus" / "Claude Sonnet"
const getAnthropicModelFamily = (displayName: string) =>
  displayName
    .split(" ")
    .filter((word) => word && ![...word].some((char) => char >= "0" && char <= "9"))
    .join(" ") || null;

export const listAnthropicModels = async (config: Pick<TAnthropicConnectionConfig, "credentials">) => {
  const models: { id: string; displayName: string; family: string | null; createdAt: string | null }[] = [];
  let afterId: string | undefined;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < ANTHROPIC_MODELS_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<{
      data?: { id: string; display_name?: string; created_at?: string }[];
      has_more?: boolean;
      last_id?: string | null;
    }>(`${ANTHROPIC_API_BASE_URL}/models`, {
      headers: getAnthropicHeaders(config.credentials.apiKey),
      params: { limit: ANTHROPIC_MODELS_PAGE_SIZE, after_id: afterId }
    });

    (data?.data ?? []).forEach((model) =>
      models.push({
        id: model.id,
        displayName: model.display_name || model.id,
        family: model.display_name ? getAnthropicModelFamily(model.display_name) : null,
        createdAt: model.created_at ?? null
      })
    );
    hasMore = Boolean(data?.has_more && data.last_id);
    afterId = data?.last_id ?? undefined;
    page += 1;
  }

  if (hasMore) logger.warn(`Anthropic model list truncated after ${ANTHROPIC_MODELS_MAX_PAGES} pages`);

  return models;
};

export const createAnthropicMessage = async (
  config: Pick<TAnthropicConnectionConfig, "credentials">,
  body: TAnthropicMessageRequest,
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number }
) => {
  const { data } = await request.post<TAnthropicMessageResponse>(`${ANTHROPIC_API_BASE_URL}/messages`, body, {
    headers: getAnthropicHeaders(config.credentials.apiKey),
    timeout: timeoutMs,
    signal
  });
  return data;
};
