import { isGcpServiceDisabledError } from "./gcp-connection-errors";

describe("isGcpServiceDisabledError", () => {
  it("detects a disabled API from the SERVICE_DISABLED reason", () => {
    expect(
      isGcpServiceDisabledError({ error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "Cloud DNS API is disabled.")
    ).toBe(true);
  });

  it("detects a disabled API from the accessNotConfigured reason", () => {
    expect(isGcpServiceDisabledError({ error: { errors: [{ reason: "accessNotConfigured" }] } }, "")).toBe(true);
  });

  it("falls back to Google's disabled-API message", () => {
    expect(
      isGcpServiceDisabledError(undefined, "Cloud DNS API has not been used in project 123 before or it is disabled.")
    ).toBe(true);
  });

  it("does not treat other disabled resources as a disabled API", () => {
    expect(isGcpServiceDisabledError(undefined, "The billing account for the project is disabled.")).toBe(false);
  });
});
