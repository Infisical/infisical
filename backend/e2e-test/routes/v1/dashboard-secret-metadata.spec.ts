import qs from "qs";

import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

type TRawSecretWithId = {
  id: string;
  secretKey: string;
  secretValue: string;
  version: number;
};

type TMetadataSearchResult = {
  secretId: string;
  metadata: { key: string; value: string }[];
}[];

// distinctive keys so the org-wide search only ever matches the secrets seeded by this spec
const ENV_KEY = "e2e-search-env";
const TEAM_KEY = "e2e-search-team";
const TEST_PATH = "/";

const createSecretWithMetadata = async (dto: { key: string; metadata: { key: string; value: string }[] }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: TEST_PATH,
      secretKey: dto.key,
      secretValue: "test-value",
      secretMetadata: dto.metadata
    }
  });
  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("secret");
  return payload.secret as TRawSecretWithId;
};

const deleteSecret = async (dto: { key: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: TEST_PATH
    }
  });
  expect(res.statusCode).toBe(200);
};

const searchSecretMetadata = async (dto: { operator: "and" | "or"; filters: { key: string; value: string }[] }) => {
  const queryString = qs.stringify({
    projectId: seedData1.projectV3.id,
    operator: dto.operator,
    filters: dto.filters.map((filter) => ({ ...filter, operator: "is" }))
  });
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/dashboard/secrets-by-metadata?${queryString}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).secrets as TMetadataSearchResult;
};

describe("Dashboard - search secrets by metadata", async () => {
  const secretKeys = {
    a: "E2E_METADATA_SEARCH_A",
    b: "E2E_METADATA_SEARCH_B",
    c: "E2E_METADATA_SEARCH_C"
  };

  let secretAId = "";
  let secretBId = "";
  let secretCId = "";

  beforeAll(async () => {
    // A -> env=prod, team=backend | B -> env=prod, team=frontend | C -> env=staging, team=backend
    const [secretA, secretB, secretC] = await Promise.all([
      createSecretWithMetadata({
        key: secretKeys.a,
        metadata: [
          { key: ENV_KEY, value: "prod" },
          { key: TEAM_KEY, value: "backend" }
        ]
      }),
      createSecretWithMetadata({
        key: secretKeys.b,
        metadata: [
          { key: ENV_KEY, value: "prod" },
          { key: TEAM_KEY, value: "frontend" }
        ]
      }),
      createSecretWithMetadata({
        key: secretKeys.c,
        metadata: [
          { key: ENV_KEY, value: "staging" },
          { key: TEAM_KEY, value: "backend" }
        ]
      })
    ]);

    secretAId = secretA.id;
    secretBId = secretB.id;
    secretCId = secretC.id;
  });

  afterAll(async () => {
    await Promise.all([
      deleteSecret({ key: secretKeys.a }),
      deleteSecret({ key: secretKeys.b }),
      deleteSecret({ key: secretKeys.c })
    ]);
  });

  test("OR operator returns secrets matching any condition", async () => {
    const secrets = await searchSecretMetadata({
      operator: "or",
      filters: [
        { key: ENV_KEY, value: "prod" },
        { key: TEAM_KEY, value: "backend" }
      ]
    });

    const matchedIds = secrets.map((secret) => secret.secretId);
    // A (env=prod & team=backend), B (env=prod), C (team=backend) all match at least one condition
    expect(matchedIds).toEqual(expect.arrayContaining([secretAId, secretBId, secretCId]));

    // B only matched env=prod, so it should not carry the team=backend pair
    const secretB = secrets.find((secret) => secret.secretId === secretBId);
    expect(secretB?.metadata).toEqual(expect.arrayContaining([{ key: ENV_KEY, value: "prod" }]));
    expect(secretB?.metadata).toEqual(expect.not.arrayContaining([{ key: TEAM_KEY, value: "frontend" }]));
  });

  test("AND operator returns only secrets matching every condition", async () => {
    const secrets = await searchSecretMetadata({
      operator: "and",
      filters: [
        { key: ENV_KEY, value: "prod" },
        { key: TEAM_KEY, value: "backend" }
      ]
    });

    const matchedIds = secrets.map((secret) => secret.secretId);
    // only A has BOTH env=prod and team=backend
    expect(matchedIds).toEqual(expect.arrayContaining([secretAId]));
    expect(matchedIds).toEqual(expect.not.arrayContaining([secretBId, secretCId]));

    const secretA = secrets.find((secret) => secret.secretId === secretAId);
    expect(secretA?.metadata).toEqual(
      expect.arrayContaining([
        { key: ENV_KEY, value: "prod" },
        { key: TEAM_KEY, value: "backend" }
      ])
    );
  });

  test("single condition returns only exact matches", async () => {
    const secrets = await searchSecretMetadata({
      operator: "and",
      filters: [{ key: ENV_KEY, value: "staging" }]
    });

    const matchedIds = secrets.map((secret) => secret.secretId);
    // only C has env=staging
    expect(matchedIds).toEqual(expect.arrayContaining([secretCId]));
    expect(matchedIds).toEqual(expect.not.arrayContaining([secretAId, secretBId]));
  });
});
