import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

type TDeepSearchResponse = {
  secrets?: { secretKey: string }[];
  folders?: { name: string }[];
  totalSecretCount: number;
  totalFolderCount: number;
  totalCount: number;
  searchLimit: number;
  isSearchLimitReached: boolean;
};

// distinctive prefix so the project-wide search only ever matches the secrets seeded by this spec
const SEARCH_TERM = "E2E_DEEP_SEARCH";
const TEST_PATH = "/";

const createSecret = async (key: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: TEST_PATH,
      secretKey: key,
      secretValue: "test-value"
    }
  });
  expect(res.statusCode).toBe(200);
};

const deleteSecret = async (key: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${key}`,
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

const createFolder = async (name: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      name,
      path: TEST_PATH
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder as { id: string };
};

const deleteFolder = async (id: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/folders/${id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      path: TEST_PATH
    }
  });
  expect(res.statusCode).toBe(200);
};

const deepSearch = async (pagination?: { limit?: number; offset?: number }) => {
  const params = new URLSearchParams({
    projectId: seedData1.projectV3.id,
    environments: seedData1.environment.slug,
    search: SEARCH_TERM
  });
  if (pagination?.limit !== undefined) params.set("limit", String(pagination.limit));
  if (pagination?.offset !== undefined) params.set("offset", String(pagination.offset));

  return testServer.inject({
    method: "GET",
    url: `/api/v1/dashboard/secrets-deep-search?${params.toString()}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

describe("Dashboard - deep search pagination", async () => {
  const secretKeys = [`${SEARCH_TERM}_A`, `${SEARCH_TERM}_B`, `${SEARCH_TERM}_C`];

  beforeAll(async () => {
    for await (const key of secretKeys) {
      await createSecret(key);
    }
  });

  afterAll(async () => {
    for await (const key of secretKeys) {
      await deleteSecret(key);
    }
  });

  test("returns every match with the total count when the page fits", async () => {
    const res = await deepSearch();
    expect(res.statusCode).toBe(200);

    const payload = JSON.parse(res.payload) as TDeepSearchResponse;
    expect(payload.secrets?.map((secret) => secret.secretKey)).toEqual(secretKeys);
    expect(payload.totalSecretCount).toBe(secretKeys.length);
    expect(payload.totalCount).toBe(secretKeys.length);
    expect(payload.isSearchLimitReached).toBe(false);
  });

  test("pages through matches without dropping the last one", async () => {
    const firstPageRes = await deepSearch({ limit: 2, offset: 0 });
    expect(firstPageRes.statusCode).toBe(200);
    const firstPage = JSON.parse(firstPageRes.payload) as TDeepSearchResponse;

    const secondPageRes = await deepSearch({ limit: 2, offset: 2 });
    expect(secondPageRes.statusCode).toBe(200);
    const secondPage = JSON.parse(secondPageRes.payload) as TDeepSearchResponse;

    // the total stays the full match count on every page, so the UI can size its pager
    expect(firstPage.totalSecretCount).toBe(secretKeys.length);
    expect(secondPage.totalSecretCount).toBe(secretKeys.length);

    const firstPageKeys = firstPage.secrets?.map((secret) => secret.secretKey);
    const secondPageKeys = secondPage.secrets?.map((secret) => secret.secretKey);
    expect(firstPageKeys).toEqual(secretKeys.slice(0, 2));
    expect(secondPageKeys).toEqual(secretKeys.slice(2));
  });

  test.each([
    ["limit below the minimum", { limit: 0 }],
    ["limit above the maximum", { limit: 101 }],
    ["offset beyond the search limit", { offset: 501 }],
    ["a negative offset", { offset: -1 }]
  ])("rejects %s", async (_, pagination) => {
    const res = await deepSearch(pagination);

    expect(res.statusCode).toBe(422);
  });

  describe("with a folder matching the same term", async () => {
    const folderName = `${SEARCH_TERM}_FOLDER`;
    let folderId: string;

    beforeAll(async () => {
      folderId = (await createFolder(folderName)).id;
    });

    afterAll(async () => {
      await deleteFolder(folderId);
    });

    test("counts and pages each resource type on its own offset", async () => {
      const firstPageRes = await deepSearch({ limit: 2, offset: 0 });
      expect(firstPageRes.statusCode).toBe(200);
      const firstPage = JSON.parse(firstPageRes.payload) as TDeepSearchResponse;

      expect(firstPage.totalFolderCount).toBe(1);
      expect(firstPage.totalSecretCount).toBe(secretKeys.length);
      expect(firstPage.folders?.map((folder) => folder.name)).toEqual([folderName]);
      expect(firstPage.secrets?.map((secret) => secret.secretKey)).toEqual(secretKeys.slice(0, 2));

      // the folder bucket is exhausted a page before the secret bucket, so a pager sized on the sum of the
      // counts would offer pages that hold nothing
      const secondPageRes = await deepSearch({ limit: 2, offset: 2 });
      expect(secondPageRes.statusCode).toBe(200);
      const secondPage = JSON.parse(secondPageRes.payload) as TDeepSearchResponse;

      expect(secondPage.totalFolderCount).toBe(1);
      expect(secondPage.folders ?? []).toEqual([]);
      expect(secondPage.secrets?.map((secret) => secret.secretKey)).toEqual(secretKeys.slice(2));
      expect(secondPage.isSearchLimitReached).toBe(false);
    });
  });
});
