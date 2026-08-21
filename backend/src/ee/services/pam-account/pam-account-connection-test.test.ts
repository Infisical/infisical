import { describe, expect, test, vi } from "vitest";

import { PamAccountType } from "../pam/pam-enums";
import { buildGatewayConnectionTest, TestConnectionMode } from "./pam-account-connection-test";

vi.mock("../pam-session/aws-iam/aws-iam-federation", () => ({
  AWS_STS_MIN_DURATION_SECONDS: 900,
  generateAwsIamSessionCredentials: vi.fn()
}));
vi.mock("../pam-session/azure/azure-federation", () => ({
  AZURE_SCOPES: { arm: "https://management.azure.com/.default" },
  getAzureAccessToken: vi.fn()
}));
vi.mock("../pam-session/gcp/gcp-federation", () => ({ mintGcpAccessToken: vi.fn() }));

describe("buildGatewayConnectionTest", () => {
  test("builds a TCP connection test from a Web Server URI", async () => {
    await expect(
      buildGatewayConnectionTest(
        PamAccountType.WebServer,
        { uri: "https://example.com/login" },
        { user: "admin", password: "secret" }
      )
    ).resolves.toEqual({
      host: "example.com",
      port: 443,
      request: { mode: TestConnectionMode.Tcp }
    });
  });
});
