import { ErrorCode } from "@slack/web-api";

import { ChatPostFailure } from "../../models/enums";
import { TChatPostRefusal } from "../../services/dependencies";

const SLACK_AUTH_ERRORS = new Set(["invalid_auth", "not_authed", "token_revoked", "account_inactive", "token_expired"]);

export const toChatPostRefusal = (err: unknown): TChatPostRefusal => {
  const { code, data } = (err ?? {}) as { code?: string; data?: { error?: string } };

  if (code === ErrorCode.PlatformError) {
    const providerError = data?.error;
    if (providerError === "not_in_channel") return { failure: ChatPostFailure.NotInChannel, providerError };
    if (providerError === "channel_not_found") return { failure: ChatPostFailure.ChannelNotFound, providerError };
    if (providerError === "is_archived") return { failure: ChatPostFailure.Archived, providerError };
    if (providerError && SLACK_AUTH_ERRORS.has(providerError)) {
      return { failure: ChatPostFailure.AuthRejected, providerError };
    }
    return { failure: ChatPostFailure.Other, providerError };
  }
  if (code === ErrorCode.RateLimitedError) return { failure: ChatPostFailure.RateLimited };
  if (code === ErrorCode.RequestError) return { failure: ChatPostFailure.Unreachable };
  return { failure: ChatPostFailure.Other };
};
