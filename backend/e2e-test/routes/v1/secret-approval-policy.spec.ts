import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const createPolicy = async (dto: {
  name: string;
  secretPath: string;
  approvers: { type: ApproverType.User; id: string }[];
  approvals: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approvals`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: dto.approvers,
      approvals: dto.approvals
    }
  });

  expect(res.statusCode).toBe(200);
  return res.json().approval;
};

describe("Secret approval policy router", async () => {
  test("Create policy", async () => {
    const policy = await createPolicy({
      secretPath: "/",
      approvals: 1,
      approvers: [{ id: seedData1.id, type: ApproverType.User }],
      name: "test-policy"
    });

    expect(policy.name).toBe("test-policy");
  });
});
