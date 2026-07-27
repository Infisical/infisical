import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const workspaceId = seedData1.projectV3.id;
const environment = seedData1.environment.slug;

const createRawSecret = async (secretKey: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${secretKey}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId,
      environment,
      type: SecretType.Shared,
      secretPath: "/",
      secretKey,
      secretValue: "value"
    }
  });
  expect(res.statusCode).toBe(200);
};

const deleteRawSecret = async (secretKey: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${secretKey}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId,
      environment,
      secretPath: "/"
    }
  });
  expect(res.statusCode).toBe(200);
};

const requestRename = (secretKey: string, newSecretName: string) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v3/secrets/raw/${secretKey}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId,
      environment,
      secretPath: "/",
      type: SecretType.Shared,
      newSecretName
    }
  });

describe("Secret approval request for a rename", () => {
  const sourceSecretKey = "RENAME-SRC";
  const takenSecretKey = "RENAME-TAKEN";
  let policyId = "";

  beforeAll(async () => {
    // secrets must exist before the policy does, or their creation would route through approval too
    await createRawSecret(sourceSecretKey);
    await createRawSecret(takenSecretKey);

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/secret-approvals`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId,
        environment,
        name: "rename-policy",
        secretPath: "/",
        approvers: [{ type: ApproverType.User, id: seedData1.id }],
        approvals: 1
      }
    });
    expect(res.statusCode).toBe(200);
    policyId = res.json().approval.id;
  });

  afterAll(async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/secret-approvals/${policyId}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(200);

    await deleteRawSecret(sourceSecretKey);
    await deleteRawSecret(takenSecretKey);
  });

  test("rename request stores an update commit carrying the new key and the source secret id", async () => {
    const res = await requestRename(sourceSecretKey, "RENAME-DST");
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("approval");

    const detailRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-approval-requests/${payload.approval.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(detailRes.statusCode).toBe(200);
    const { approval } = detailRes.json();

    // the merge path applies the commit's key by secret id, so both must be present and correct
    expect(approval.commits).toHaveLength(1);
    expect(approval.commits[0]).toEqual(
      expect.objectContaining({
        op: "update",
        secretKey: "RENAME-DST",
        secret: expect.objectContaining({
          id: expect.any(String),
          secretKey: sourceSecretKey
        })
      })
    );
  });

  test("rename request targeting an existing secret name is rejected", async () => {
    const res = await requestRename(sourceSecretKey, takenSecretKey);
    expect(res.statusCode).toBe(400);
  });
});
