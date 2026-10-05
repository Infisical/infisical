import { describe, expect, test, vi } from "vitest";

import { TSecretApprovalPolicies } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretApprovalRequestServiceFactory } from "./secret-approval-request-service";

const POLICY_ID = "policy-1";

const build = () => {
  const permissionService = { getProjectPermission: vi.fn() };
  const secretApprovalRequestDAL = { create: vi.fn() };
  const secretChangePolicyBridgeService = {
    findSecretChangePolicy: vi.fn().mockResolvedValue({ id: POLICY_ID })
  };

  const service = secretApprovalRequestServiceFactory({
    permissionService,
    secretApprovalRequestDAL,
    secretChangePolicyBridgeService
  } as unknown as Parameters<typeof secretApprovalRequestServiceFactory>[0]);

  return { service, permissionService, secretApprovalRequestDAL, secretChangePolicyBridgeService };
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
