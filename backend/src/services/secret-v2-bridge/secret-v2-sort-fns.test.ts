import { OrderByDirection } from "@app/lib/types";
import { DashboardSecretsOrderBy } from "@app/services/secret/secret-types";

import { TSecretSortCandidate } from "./secret-v2-bridge-types";
import { selectAuthorizedSecretSortPage } from "./secret-v2-sort-fns";

const candidate = (
  id: string,
  key: string,
  folderId: string,
  createdAt: string,
  tags: TSecretSortCandidate["tags"] = []
): TSecretSortCandidate => ({
  id,
  key,
  folderId,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  tags
});

describe("selectAuthorizedSecretSortPage", () => {
  test("filters restricted secrets before timestamp ordering and pagination", () => {
    const result = selectAuthorizedSecretSortPage({
      candidates: [
        candidate("allowed-old", "ALLOWED_OLD", "prod", "2026-01-01T00:00:00.000Z"),
        candidate("restricted-new", "RESTRICTED_NEW", "prod", "2026-01-03T00:00:00.000Z"),
        candidate("allowed-new", "ALLOWED_NEW", "prod", "2026-01-02T00:00:00.000Z")
      ],
      canAccessSecret: ({ id }) => id !== "restricted-new",
      sortFolderIds: ["prod"],
      orderBy: DashboardSecretsOrderBy.CreatedAt,
      orderDirection: OrderByDirection.DESC,
      limit: 1
    });

    expect(result.orderedKeys).toEqual(["ALLOWED_NEW"]);
    expect(result.candidates.map(({ id }) => id)).toEqual(["allowed-new"]);
    expect(result.isLimitReached).toBe(true);
  });

  test("does not use a restricted environment timestamp for a visible multi-environment key", () => {
    const result = selectAuthorizedSecretSortPage({
      candidates: [
        candidate("shared-dev", "SHARED", "dev", "2026-01-01T00:00:00.000Z"),
        candidate("shared-prod", "SHARED", "prod", "2026-01-04T00:00:00.000Z"),
        candidate("prod-visible", "PROD_VISIBLE", "prod", "2026-01-02T00:00:00.000Z")
      ],
      canAccessSecret: ({ id }) => id !== "shared-prod",
      sortFolderIds: ["prod"],
      orderBy: DashboardSecretsOrderBy.UpdatedAt,
      orderDirection: OrderByDirection.DESC
    });

    expect(result.orderedKeys).toEqual(["PROD_VISIBLE", "SHARED"]);
    expect(result.candidates.map(({ id }) => id)).toEqual(["shared-dev", "prod-visible"]);
  });

  test("uses the latest authorized timestamp per key for ascending order", () => {
    const result = selectAuthorizedSecretSortPage({
      candidates: [
        candidate("shared", "SHARED", "prod", "2026-01-01T00:00:00.000Z"),
        candidate("personal", "SHARED", "prod", "2026-01-05T00:00:00.000Z"),
        candidate("other", "OTHER", "prod", "2026-01-03T00:00:00.000Z")
      ],
      canAccessSecret: () => true,
      sortFolderIds: ["prod"],
      orderBy: DashboardSecretsOrderBy.CreatedAt,
      orderDirection: OrderByDirection.ASC
    });

    expect(result.orderedKeys).toEqual(["OTHER", "SHARED"]);
  });

  test("applies offsets to authorized keys", () => {
    const result = selectAuthorizedSecretSortPage({
      candidates: [
        candidate("a", "A", "prod", "2026-01-01T00:00:00.000Z"),
        candidate("hidden", "HIDDEN", "prod", "2026-01-04T00:00:00.000Z"),
        candidate("b", "B", "prod", "2026-01-02T00:00:00.000Z"),
        candidate("c", "C", "prod", "2026-01-03T00:00:00.000Z")
      ],
      canAccessSecret: ({ id }) => id !== "hidden",
      sortFolderIds: ["prod"],
      orderBy: DashboardSecretsOrderBy.CreatedAt,
      orderDirection: OrderByDirection.DESC,
      offset: 1,
      limit: 1
    });

    expect(result.orderedKeys).toEqual(["B"]);
    expect(result.isLimitReached).toBe(true);
  });
});
