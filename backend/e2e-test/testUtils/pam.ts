import { randomUUID } from "node:crypto";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { pamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { pamSessionExpirationServiceFactory } from "@app/ee/services/pam-session/pam-session-expiration-queue";
import { pamWebAppSessionDALFactory } from "@app/ee/services/pam-web-app-session/pam-web-app-session-dal";
import { initLogger } from "@app/lib/logger";
import { TQueueServiceFactory } from "@app/queue";
import { projectDALFactory } from "@app/services/project/project-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { registerPamFixtureGateway } from "../fakes/pam-gateway-connection-test";
import { createIsolatedOrgAndProject } from "./fixtures";
import { request } from "./request";

export const pamRequest = (
  authToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: Record<string, unknown>
) =>
  request<{
    id: string;
    projectId: string;
    gateway: { id: string };
    token: string;
    folder: { id: string };
    template: { id: string };
    account: { id: string; name: string };
  }>({ method, url, headers: { authorization: `Bearer ${authToken}` }, ...(body ? { body } : {}) }, (response) => {
    expect(response.statusCode, response.payload).toBeLessThan(300);
    return response.json();
  });
export const createPamFixture = async () => {
  const fixture = await createIsolatedOrgAndProject("pam-web-app");
  const { projectId } = await pamRequest(fixture.authToken, "GET", "/api/v1/pam/project");
  const created = await pamRequest(fixture.authToken, "POST", "/api/v3/gateways", {
    name: `web-${randomUUID().slice(0, 8)}`,
    authMethod: { method: "token" }
  });
  const gatewayId = created.id;
  const enrollment = await pamRequest(
    fixture.authToken,
    "POST",
    `/api/v3/gateways/${gatewayId}/token-auth/generate-enrollment-token`
  );
  const login = await testServer.inject({
    method: "POST",
    url: "/api/v3/gateways/login",
    body: { method: "token", token: enrollment.token }
  });
  expect(login.statusCode, login.payload).toBe(200);
  const gatewayToken = login.json().accessToken as string;
  registerPamFixtureGateway(gatewayId);
  // The in-process gateway advertises capabilities without a browser runtime or a live mTLS transport.
  const heartbeat = await pamRequest(gatewayToken, "POST", "/api/v2/gateways/heartbeat", {
    capabilities: {
      webApp: true,
      supported_account_types: ["web-app"],
      webAppRuntime: { image: "fixture@sha256:test", chromium: "fixture", lastCheckedAt: new Date().toISOString() }
    }
  }).raw();
  expect(heartbeat.statusCode).toBe(400);
  expect(heartbeat.json().message).toContain("no configured connection transport");
  const advertised = await pamRequest(fixture.authToken, "GET", "/api/v2/gateways").raw();
  expect(advertised.json().find((gateway: { id: string }) => gateway.id === gatewayId).capabilities.webApp).toBe(true);
  const { folder } = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/folders", { name: "web-apps" });
  const cleanup = async () => {
    const deleted = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${fixture.orgId}`,
      headers: { authorization: `Bearer ${fixture.authToken}`, "user-agent": "pam-web-app-test" }
    });
    expect(deleted.statusCode, deleted.payload).toBe(200);
  };
  return {
    ...fixture,
    cleanup,
    projectId: projectId as string,
    gatewayId,
    gatewayToken,
    folderId: folder.id as string
  };
};
export const createWebAppAccount = async (
  fixture: Awaited<ReturnType<typeof createPamFixture>>,
  options: {
    settings?: Record<string, unknown>;
    recordingConnectionId?: string;
    policies?: Record<string, unknown>;
  } = {}
) => {
  const { template } = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/account-templates", {
    name: `web-${randomUUID().slice(0, 8)}`,
    type: "web-app",
    gatewayId: fixture.gatewayId,
    settings: options.settings,
    policies: options.policies,
    recordingConnectionId: options.recordingConnectionId
  });
  const { account } = await pamRequest(fixture.authToken, "POST", "/api/v1/pam/accounts/web-app", {
    name: `app-${randomUUID().slice(0, 8)}`,
    folderId: fixture.folderId,
    templateId: template.id,
    connectionDetails: { startUrl: "https://fixture.pam.local/", allowedDestinations: [] },
    credentials: { authMethod: "none" }
  });
  return { accountId: account.id as string, templateId: template.id as string, accountName: account.name as string };
};
export const claimPamWebAppFixture = async (sessionId: string, gatewayId: string) => {
  // The browser supervisor is outside this in-process harness; this models its allocation before testing its HTTP reports.
  await testDb.transaction(async (tx) => {
    await tx(TableName.PamSession).where({ id: sessionId }).update({ gatewayId });
    await tx("pam_web_app_sessions")
      .where({ sessionId })
      .update({ gatewayId, allocationGen: 1, workerState: "provisioning", leaseUntil: new Date(Date.now() + 45_000) });
  });
};
export const createPamReconciler = () => {
  initLogger();
  const { testServices, testQueue } = globalThis as unknown as {
    testServices: FastifyZodProvider["services"];
    testQueue: TQueueServiceFactory;
  };
  const db = testDb as TDbClient;
  return pamSessionExpirationServiceFactory({
    queueService: testQueue,
    pamSessionDAL: pamSessionDALFactory(db),
    projectDAL: projectDALFactory(db),
    userDAL: userDALFactory(db),
    pamWebAppSessionDAL: pamWebAppSessionDALFactory(db),
    telemetryService: testServices.telemetry,
    gatewayV2Service: testServices.gatewayV2,
    auditLogService: testServices.auditLog,
    cronJob: { register: () => {} }
  });
};
