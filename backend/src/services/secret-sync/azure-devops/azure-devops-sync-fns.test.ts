import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestGetMock, getConnectionTokenMock } = vi.hoisted(() => ({
  requestGetMock: vi.fn<(url: string, config: { headers: { Authorization: string } }) => Promise<unknown>>(),
  getConnectionTokenMock: vi.fn<() => Promise<string>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { get: requestGetMock } }));
vi.mock("@app/services/app-connection/azure-devops/azure-devops-fns", () => ({
  getAzureDevopsConnection: getConnectionTokenMock
}));

/* eslint-disable import/first */
import { AzureDevOpsConnectionMethod } from "@app/services/app-connection/azure-devops/azure-devops-enums";

import { azureDevOpsSyncFactory } from "./azure-devops-sync-fns";
import { TAzureDevOpsSyncWithCredentials } from "./azure-devops-sync-types";
/* eslint-enable import/first */

const makeSync = (method: AzureDevOpsConnectionMethod) =>
  ({
    connectionId: "connection-id",
    connection: { method, credentials: { orgName: "contoso" } },
    destinationConfig: { devopsProjectId: "project-id" },
    environment: { name: "dev" }
  }) as unknown as TAzureDevOpsSyncWithCredentials;

const getAuthorizationHeader = async (method: AzureDevOpsConnectionMethod) => {
  const syncFns = azureDevOpsSyncFactory({} as unknown as Parameters<typeof azureDevOpsSyncFactory>[0]);
  await syncFns.getSecrets(makeSync(method));
  return requestGetMock.mock.calls[0][1].headers.Authorization;
};

describe("Azure DevOps sync authorization header", () => {
  beforeEach(() => {
    requestGetMock.mockReset().mockResolvedValue({ data: { count: 0, value: [] } });
    getConnectionTokenMock.mockReset().mockResolvedValue("token");
  });

  it.each([
    AzureDevOpsConnectionMethod.OAuth,
    AzureDevOpsConnectionMethod.ClientSecret,
    AzureDevOpsConnectionMethod.ManagedIdentity
  ])("sends the Entra access token as Bearer for %s", async (method) => {
    expect(await getAuthorizationHeader(method)).toBe("Bearer token");
  });

  it("sends a personal access token as Basic", async () => {
    expect(await getAuthorizationHeader(AzureDevOpsConnectionMethod.AccessToken)).toBe(
      `Basic ${Buffer.from(":token").toString("base64")}`
    );
  });
});
