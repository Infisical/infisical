import { describe, expect, test } from "vitest";

import { PamHeartbeatStatus } from "../pam/pam-enums";
import { classifyCloudProbeError } from "./pam-heartbeat-fns";

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
