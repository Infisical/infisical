import { describe, expect, test } from "vitest";

import { PamHeartbeatStatus } from "../pam/pam-enums";
import {
  DEFAULT_HEARTBEAT_CONFIG,
  PamHeartbeatConfigSchema
} from "../pam-account-template/pam-account-template-schemas";
import {
  classifyCloudProbeError,
  describeFailure,
  isHeartbeatScheduled,
  UNCLASSIFIED_FAILURE_NOTE
} from "./pam-heartbeat-fns";

// Shapes the three federation helpers actually throw: axios (Azure, GCP) and the AWS SDK.
const axiosError = (status: number) => ({ isAxiosError: true, response: { status } });
const awsError = (status: number) => ({ name: "AccessDenied", $metadata: { httpStatusCode: status } });
const wrapped = (cause: unknown) => Object.assign(new Error("Azure rejected the credentials"), { error: cause });

describe("classifyCloudProbeError", () => {
  test.each([
    ["revoked access (403)", axiosError(403)],
    ["rejected client secret (401)", axiosError(401)],
    ["invalid_client (400)", axiosError(400)],
    ["AWS AccessDenied (403)", awsError(403)]
  ])("%s stops the schedule", (_label, err) => {
    expect(classifyCloudProbeError(err)).toBe(PamHeartbeatStatus.InvalidCredentials);
  });

  test.each([
    ["provider outage (500)", axiosError(500)],
    ["bad gateway (502)", axiosError(502)],
    ["throttled (429)", axiosError(429)],
    ["request timeout (408)", axiosError(408)],
    ["AWS internal failure (500)", awsError(500)],
    ["connection refused", { code: "ECONNREFUSED" }],
    ["DNS failure", { code: "ENOTFOUND" }],
    ["TLS failure with no response", new Error("unable to verify the first certificate")]
  ])("%s keeps checking", (_label, err) => {
    expect(classifyCloudProbeError(err)).toBe(PamHeartbeatStatus.CannotCheck);
  });

  // Azure and GCP rethrow their own error type, so the status only survives on the cause.
  test("reads the status through a wrapping error", () => {
    expect(classifyCloudProbeError(wrapped(axiosError(401)))).toBe(PamHeartbeatStatus.InvalidCredentials);
    expect(classifyCloudProbeError(wrapped(axiosError(503)))).toBe(PamHeartbeatStatus.CannotCheck);
  });

  // A transport code above a status must not be read as a verdict on the credential.
  test("a connection error wrapping nothing stays unchecked", () => {
    expect(classifyCloudProbeError(wrapped({ code: "ETIMEDOUT" }))).toBe(PamHeartbeatStatus.CannotCheck);
  });
});

describe("DEFAULT_HEARTBEAT_CONFIG", () => {
  // New templates opt in; the interval has to be one the scheduler and the template form both accept.
  test("is enabled and within the allowed interval range", () => {
    expect(DEFAULT_HEARTBEAT_CONFIG.enabled).toBe(true);
    expect(PamHeartbeatConfigSchema.safeParse(DEFAULT_HEARTBEAT_CONFIG).success).toBe(true);
    expect(isHeartbeatScheduled(DEFAULT_HEARTBEAT_CONFIG)).toBe(true);
  });
});

describe("describeFailure", () => {
  test("leaves a classified failure's message alone", () => {
    expect(describeFailure("auth", "password authentication failed")).toBe("password authentication failed");
    expect(describeFailure("transport", "connection refused")).toBe("connection refused");
  });

  // An old gateway sends no kind, so every failure it reports lands on invalid-credentials.
  test("says why an unclassified failure reads as a rejection", () => {
    expect(describeFailure(null, "something went wrong")).toContain(UNCLASSIFIED_FAILURE_NOTE);
    expect(describeFailure(null, "something went wrong")).toContain("something went wrong");
    expect(describeFailure(null, undefined)).toBe(UNCLASSIFIED_FAILURE_NOTE);
  });
});
