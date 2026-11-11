import { describe, expect, it, vi } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretAccessApprovalRequestServiceFactory } from "./access-approval-request-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://example.com" })
}));

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const REQUEST_ID = "request-id";

const actor = {
  actor: ActorType.USER as const,
  actorId: "actor-id",
  actorAuthMethod: null,
  actorOrgId: ORG_ID
};

const createService = (secretApproval: boolean) => {
  const getPlan = vi.fn().mockResolvedValue({ secretApproval } as unknown as TFeatureSet);

  const deps = {
    projectDAL: {
      findProjectBySlug: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID })
    },
    permissionService: {
      // the update gate sits behind the authorization check, so the actor must pass it
      getProjectPermission: vi.fn().mockResolvedValue({ hasRole: () => true })
    },
    licenseService: { getPlan },
    accessApprovalRequestDAL: {
      findById: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        projectId: PROJECT_ID,
        status: "pending",
        policy: { deletedAt: null, approvers: [] },
        requestedByUser: { id: "requester-id", firstName: "Re", lastName: "Quester", email: "re@example.com" }
      })
    }
  };

  const service = secretAccessApprovalRequestServiceFactory(
    deps as unknown as Parameters<typeof secretAccessApprovalRequestServiceFactory>[0]
  );

  return { service, getPlan };
};

describe("access approval request plan gate", () => {
  it("rejects request creation without the secretApproval entitlement", async () => {
    const { service, getPlan } = createService(false);

    await expect(
      service.createAccessApprovalRequest({
        ...actor,
        projectSlug: "project-slug",
        isTemporary: true,
        temporaryRange: "1h",
        permissions: []
      })
    ).rejects.toThrow("Upgrade plan to create access approval request");

    expect(getPlan).toHaveBeenCalledWith(ORG_ID);
  });

  it("rejects request edits without the secretApproval entitlement", async () => {
    const { service } = createService(false);

    const edit = service.updateAccessApprovalRequest();
    await expect(edit).rejects.toBeInstanceOf(BadRequestError);
    await expect(edit).rejects.toThrow("Access requests on the global approval system cannot be edited");
  });
});
