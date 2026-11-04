import { TApprovalRequest } from "../approval-policy-types";
import { secretAccessApprovalGlobalResourceFactory } from "./secret-access-policy-factory";

const TX = { tx: true } as never;

const approvedRequest = {
  id: "request-1",
  projectId: "project-1",
  requesterId: "user-1",
  requestData: {
    version: 1,
    requestData: {
      permissions: [["read", "secrets", { environment: "dev", secretPath: { $glob: "/app" } }]],
      isTemporary: false,
      temporaryRange: null
    }
  }
} as unknown as TApprovalRequest;

const buildResource = ({ isRequesterProjectMember }: { isRequesterProjectMember: boolean }) => {
  const lockUserProjectMemberships = vi.fn().mockResolvedValue(isRequesterProjectMember);
  const createGrant = vi.fn().mockResolvedValue({ id: "grant-1" });
  const createPrivilege = vi.fn().mockResolvedValue({ id: "privilege-1" });

  const resource = secretAccessApprovalGlobalResourceFactory({
    approvalPolicyDAL: { findSecretAccessPolicyByEnvIdAndSecretPath: vi.fn() },
    approvalRequestGrantsDAL: { find: vi.fn(), create: createGrant },
    additionalPrivilegeDAL: { create: createPrivilege },
    membershipDAL: { lockUserProjectMemberships }
  } as never);

  return { resource, lockUserProjectMemberships, createGrant, createPrivilege };
};

describe("secretAccessApprovalGlobalResource.postApprovalTxRoutine", () => {
  test("grants a requester who is still a member of the project", async () => {
    const { resource, lockUserProjectMemberships, createPrivilege } = buildResource({ isRequesterProjectMember: true });

    await expect(resource.postApprovalTxRoutine(approvedRequest, TX)).resolves.toEqual({ grantId: "grant-1" });

    expect(lockUserProjectMemberships).toHaveBeenCalledWith({ projectId: "project-1", userId: "user-1" }, TX);
    expect(createPrivilege).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "user-1", projectId: "project-1", grantId: "grant-1" }),
      TX
    );
  });

  test("grants nothing to a requester who is no longer a member of the project", async () => {
    const { resource, createGrant, createPrivilege } = buildResource({ isRequesterProjectMember: false });

    await expect(resource.postApprovalTxRoutine(approvedRequest, TX)).rejects.toThrow(
      "The user who created this access request is no longer a member of this project, so access cannot be granted."
    );

    expect(createGrant).not.toHaveBeenCalled();
    expect(createPrivilege).not.toHaveBeenCalled();
  });
});
