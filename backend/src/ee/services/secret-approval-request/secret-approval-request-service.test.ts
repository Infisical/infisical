import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { TSecretApprovalPolicies } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { QueueJobs, QueueName } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { ChangeRequestWebhookAction, WebhookEvents } from "@app/services/webhook/webhook-types";

import { sendApprovalEmailsFn } from "./secret-approval-request-fns";
import { secretApprovalRequestServiceFactory } from "./secret-approval-request-service";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SITE_URL: "https://app.test" })
}));
vi.mock("@app/lib/workflow-integrations/trigger-notification", () => ({
  triggerWorkflowIntegrationNotification: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("./secret-approval-request-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./secret-approval-request-fns")>()),
  sendApprovalEmailsFn: vi.fn().mockResolvedValue(undefined)
}));

const POLICY_ID = "policy-1";

const build = () => {
  const permissionService = { getProjectPermission: vi.fn() };
  const secretApprovalRequestDAL = { create: vi.fn(), findById: vi.fn().mockResolvedValue(null) };
  const secretChangePolicyBridgeService = {
    findSecretChangePolicy: vi.fn().mockResolvedValue({ id: POLICY_ID })
  };
  const secretChangeRequestBridgeService = {
    findSecretChangeRequest: vi.fn().mockResolvedValue(null),
    createSecretChangeRequestSideEffects: vi.fn().mockResolvedValue(undefined)
  };
  const userDAL = { findById: vi.fn().mockResolvedValue({ id: "user-1", email: "alice@example.com" }) };
  const projectDAL = { findById: vi.fn().mockResolvedValue({ id: "project-1", name: "Project", orgId: "org-1" }) };
  const projectEnvDAL = { findOne: vi.fn().mockResolvedValue({ id: "env-1", name: "Development", slug: "dev" }) };
  const queueService = { queue: vi.fn().mockResolvedValue(undefined) };
  const telemetryService = { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) };

  const service = secretApprovalRequestServiceFactory({
    permissionService,
    secretApprovalRequestDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService,
    userDAL,
    projectDAL,
    projectEnvDAL,
    queueService,
    telemetryService
  } as unknown as Parameters<typeof secretApprovalRequestServiceFactory>[0]);

  return {
    service,
    permissionService,
    secretApprovalRequestDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService,
    projectDAL,
    queueService
  };
};

describe("generateSecretApprovalRequest", () => {
  test("refuses a policy from the approval system before checking permission or writing a request", async () => {
    const { service, permissionService, secretApprovalRequestDAL, secretChangePolicyBridgeService } = build();

    await expect(
      service.generateSecretApprovalRequest({
        policy: { id: POLICY_ID } as TSecretApprovalPolicies,
        data: {},
        actor: ActorType.USER,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null,
        projectId: "project-1",
        environment: "dev",
        secretPath: "/"
      })
    ).rejects.toThrow(
      new BadRequestError({
        message: `Secret approval policy with ID '${POLICY_ID}' is on the new approval system, which does not support projects that have not been upgraded to the latest secrets version.`
      })
    );

    expect(secretChangePolicyBridgeService.findSecretChangePolicy).toHaveBeenCalledWith(POLICY_ID);
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
    expect(secretApprovalRequestDAL.create).not.toHaveBeenCalled();
  });
});

describe("createSecretApprovalSideEffects", () => {
  const TX = { isTx: true } as unknown as Knex;
  const dto = {
    secretApprovalRequest: { id: "request-1", policyId: POLICY_ID, commits: [{ id: "commit-1" }] },
    projectId: "project-1",
    environment: "dev",
    secretPath: "/",
    secretKeys: ["KEY"],
    actor: ActorType.USER,
    actorId: "user-1",
    actorOrgId: "org-1",
    tx: TX
  };

  test("hands a request stored on the global approval system to the bridge, through the caller's transaction", async () => {
    const { service, secretChangeRequestBridgeService, projectDAL } = build();
    secretChangeRequestBridgeService.findSecretChangeRequest.mockResolvedValueOnce({ id: "request-1" });

    await service.createSecretApprovalSideEffects(dto);

    expect(secretChangeRequestBridgeService.findSecretChangeRequest).toHaveBeenCalledWith("request-1", TX);
    expect(secretChangeRequestBridgeService.createSecretChangeRequestSideEffects).toHaveBeenCalledWith(dto);
    expect(projectDAL.findById).not.toHaveBeenCalled();
  });

  test("keeps a legacy request on the legacy path", async () => {
    const { service, secretApprovalRequestDAL, secretChangeRequestBridgeService, queueService } = build();
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    secretApprovalRequestDAL.findById.mockResolvedValueOnce({
      id: "request-1",
      slug: "slug-1",
      status: "open",
      hasMerged: false,
      bypassReason: null,
      committerUserId: "user-1",
      committerUser: { firstName: "Alice", lastName: "Smith", username: "alice", email: "alice@example.com" },
      policy: { id: POLICY_ID, name: "dev-policy", enforcementLevel: "hard" },
      createdAt,
      updatedAt: createdAt
    });

    await service.createSecretApprovalSideEffects(dto);

    expect(secretChangeRequestBridgeService.createSecretChangeRequestSideEffects).not.toHaveBeenCalled();
    expect(triggerWorkflowIntegrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          projectId: "project-1",
          notification: expect.objectContaining({
            payload: expect.objectContaining({ requestId: "request-1", environment: "Development" }) as object
          }) as object
        }
      })
    );
    expect(sendApprovalEmailsFn).toHaveBeenCalledWith(
      expect.objectContaining({ secretApprovalRequest: dto.secretApprovalRequest, projectId: "project-1" })
    );
    expect(secretApprovalRequestDAL.findById).toHaveBeenCalledWith("request-1", TX);
    expect(queueService.queue).toHaveBeenCalledWith(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.ChangeRequestModified,
        payload: expect.objectContaining({
          projectId: "project-1",
          environmentName: "Development",
          action: ChangeRequestWebhookAction.Created,
          request: expect.objectContaining({ id: "request-1", slug: "slug-1" }) as object
        }) as object
      },
      expect.objectContaining({ attempts: 5 })
    );
  });
});
