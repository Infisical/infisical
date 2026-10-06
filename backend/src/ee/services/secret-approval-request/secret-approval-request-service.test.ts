import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { TSecretApprovalPolicies } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretApprovalRequestServiceFactory } from "./secret-approval-request-service";

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
  const projectDAL = { findById: vi.fn().mockResolvedValue(null) };

  const service = secretApprovalRequestServiceFactory({
    permissionService,
    secretApprovalRequestDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService,
    userDAL,
    projectDAL
  } as unknown as Parameters<typeof secretApprovalRequestServiceFactory>[0]);

  return {
    service,
    permissionService,
    secretApprovalRequestDAL,
    secretChangePolicyBridgeService,
    secretChangeRequestBridgeService,
    projectDAL
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
    const { service, secretChangeRequestBridgeService, projectDAL } = build();

    await expect(service.createSecretApprovalSideEffects(dto)).rejects.toThrow();

    expect(secretChangeRequestBridgeService.createSecretChangeRequestSideEffects).not.toHaveBeenCalled();
    expect(projectDAL.findById).toHaveBeenCalledWith("project-1");
  });
});
