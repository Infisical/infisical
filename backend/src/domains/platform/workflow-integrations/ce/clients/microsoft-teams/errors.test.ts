import { AxiosError } from "axios";
import { describe, expect, test } from "vitest";

import { ChatPostFailure } from "../../models/enums";
import { toTeamsPostRefusal } from "./errors";

const withStatus = (status: number) =>
  new AxiosError("failed", String(status), undefined, undefined, { status } as never);

describe("toTeamsPostRefusal", () => {
  test.each([
    [401, ChatPostFailure.AuthRejected],
    [403, ChatPostFailure.AuthRejected],
    [404, ChatPostFailure.ChannelNotFound],
    [429, ChatPostFailure.RateLimited],
    [500, ChatPostFailure.Other]
  ])("should map status %i to %s and keep the status", (status, failure) => {
    // Action
    const refusal = toTeamsPostRefusal(withStatus(status));

    // Assert
    expect(refusal).toEqual({ failure, providerError: String(status) });
  });

  test("should map a missing response to Unreachable", () => {
    // Action
    const refusal = toTeamsPostRefusal(new AxiosError("socket hang up"));

    // Assert
    expect(refusal).toEqual({ failure: ChatPostFailure.Unreachable });
  });

  test("should map a non-HTTP error to Other", () => {
    // Action
    const refusal = toTeamsPostRefusal(new Error("boom"));

    // Assert
    expect(refusal).toEqual({ failure: ChatPostFailure.Other });
  });
});
