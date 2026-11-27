import { ErrorCode } from "@slack/web-api";
import { describe, expect, test } from "vitest";

import { ChatPostFailure } from "../../models/enums";
import { toChatPostRefusal } from "./errors";

const platformError = (error: string) => ({ code: ErrorCode.PlatformError, data: { error } });

describe("toChatPostRefusal", () => {
  test.each([
    ["not_in_channel", ChatPostFailure.NotInChannel],
    ["channel_not_found", ChatPostFailure.ChannelNotFound],
    ["is_archived", ChatPostFailure.Archived],
    ["invalid_auth", ChatPostFailure.AuthRejected],
    ["not_authed", ChatPostFailure.AuthRejected],
    ["token_revoked", ChatPostFailure.AuthRejected],
    ["account_inactive", ChatPostFailure.AuthRejected],
    ["token_expired", ChatPostFailure.AuthRejected],
    ["msg_too_long", ChatPostFailure.Other]
  ])("should map the Slack error %s to %s and keep the code", (slackError, failure) => {
    // Setup
    const err = platformError(slackError);

    // Action
    const refusal = toChatPostRefusal(err);

    // Assert
    expect(refusal).toEqual({ failure, providerError: slackError });
  });

  test("should map a rate limit to RateLimited", () => {
    // Setup
    const err = { code: ErrorCode.RateLimitedError };

    // Action
    const refusal = toChatPostRefusal(err);

    // Assert
    expect(refusal).toEqual({ failure: ChatPostFailure.RateLimited });
  });

  test("should map a request error to Unreachable", () => {
    // Setup
    const err = { code: ErrorCode.RequestError };

    // Action
    const refusal = toChatPostRefusal(err);

    // Assert
    expect(refusal).toEqual({ failure: ChatPostFailure.Unreachable });
  });

  test.each([[new Error("boom")], [undefined], [null]])("should map an unknown error to Other", (err) => {
    // Action
    const refusal = toChatPostRefusal(err);

    // Assert
    expect(refusal).toEqual({ failure: ChatPostFailure.Other });
  });
});
