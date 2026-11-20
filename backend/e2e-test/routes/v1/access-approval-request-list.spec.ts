import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_PATH = "/list-filter";
const policyIds: string[] = [];

const createMultiEnvPolicy = async () => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      projectSlug: seedData1.project.slug,
      environments: ["dev", "prod"],
      name: "list-filter-dev-prod",
      secretPath: SECRET_PATH,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1
    }
  });
  expect(res.statusCode).toBe(200);
  const policyId: string = res.json().approval.id;
  policyIds.push(policyId);
  return policyId;
};

const createAccessRequest = async (environment: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      permissions: [["read", "secrets", { environment, secretPath: { $glob: SECRET_PATH } }]],
      isTemporary: false
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().approval.id as string;
};

const listAccessRequests = (query: Record<string, string> = {}) =>
  testServer.inject({
    method: "GET",
    url: "/api/v1/access-approvals/requests",
    query: { projectSlug: seedData1.project.slug, ...query },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

// Narrowed to the requests a test created, so a request another spec left in the seeded project cannot affect it.
const listedOf = (res: Awaited<ReturnType<typeof listAccessRequests>>, ownIds: string[]) =>
  (res.json().requests as { id: string; environmentName: string }[]).filter((request) => ownIds.includes(request.id));

describe("Access approval request list", () => {
  afterEach(async () => {
    const db = getDb();
    const ids = policyIds.splice(0);
    if (ids.length) {
      await db(TableName.ApprovalRequests).whereIn("policyId", ids).del();
      await db(TableName.ApprovalPolicies).whereIn("id", ids).del();
    }
  });

  // A policy can cover several environments while each request targets one of them, so the filter has to
  // follow the environment stored in the request's permissions rather than the policy's.
  test("envSlug returns only the requests that target that environment", async () => {
    await createMultiEnvPolicy();
    const devRequestId = await createAccessRequest("dev");
    const prodRequestId = await createAccessRequest("prod");

    const ownIds = [devRequestId, prodRequestId];

    const prod = await listAccessRequests({ envSlug: "prod" });
    expect(prod.statusCode).toBe(200);
    expect(listedOf(prod, ownIds)).toEqual([expect.objectContaining({ id: prodRequestId, environmentName: "prod" })]);

    const dev = await listAccessRequests({ envSlug: "dev" });
    expect(dev.statusCode).toBe(200);
    expect(listedOf(dev, ownIds)).toEqual([expect.objectContaining({ id: devRequestId, environmentName: "dev" })]);

    const staging = await listAccessRequests({ envSlug: "staging" });
    expect(staging.statusCode).toBe(200);
    expect(listedOf(staging, ownIds)).toEqual([]);
  });

  test("authorUserId filters by requester and rejects a value that is not a user id", async () => {
    await createMultiEnvPolicy();
    const devRequestId = await createAccessRequest("dev");
    const prodRequestId = await createAccessRequest("prod");

    const ownIds = [devRequestId, prodRequestId];

    const own = await listAccessRequests({ authorUserId: seedData1.id });
    expect(own.statusCode).toBe(200);
    expect(listedOf(own, ownIds)).toHaveLength(2);

    const someoneElse = await listAccessRequests({ authorUserId: "6f1c7a2e-0000-4000-8000-000000000000" });
    expect(someoneElse.statusCode).toBe(200);
    expect(someoneElse.json().requests).toEqual([]);

    const invalid = await listAccessRequests({ authorUserId: "abc" });
    expect(invalid.statusCode).toBe(422);
  });
});
