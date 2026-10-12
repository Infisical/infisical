import { describe, expect, test } from "vitest";

import { OrderByDirection } from "@app/lib/types";

import {
  compareSecretApprovalRequests,
  mergeSecretApprovalRequestPages,
  TSecretApprovalRequestSortable
} from "./secret-approval-request-fns";
import { SecretApprovalRequestOrderBy } from "./secret-approval-request-types";

const request = (
  overrides: Partial<TSecretApprovalRequestSortable> & { id: string }
): TSecretApprovalRequestSortable => ({
  createdAt: new Date("2026-01-01"),
  environment: "dev",
  environmentName: "Development",
  policy: { secretPath: "/" },
  committerUser: { firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
  committerIdentity: null,
  ...overrides
});

const idsSortedBy = (
  requests: TSecretApprovalRequestSortable[],
  orderBy?: SecretApprovalRequestOrderBy,
  orderDirection?: OrderByDirection
) => [...requests].sort(compareSecretApprovalRequests(orderBy, orderDirection)).map((el) => el.id);

describe("compareSecretApprovalRequests", () => {
  test("orders by createdAt descending by default and breaks ties on id ascending", () => {
    const requests = [
      request({ id: "b", createdAt: new Date("2026-01-02") }),
      request({ id: "c", createdAt: new Date("2026-01-03") }),
      request({ id: "a", createdAt: new Date("2026-01-02") })
    ];
    expect(idsSortedBy(requests)).toEqual(["c", "a", "b"]);
    expect(idsSortedBy(requests, SecretApprovalRequestOrderBy.CreatedAt, OrderByDirection.ASC)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  test("orders by environment name case-insensitively and falls back to the slug", () => {
    const requests = [
      request({ id: "a", environment: "prod", environmentName: "Production" }),
      request({ id: "b", environment: "zeta", environmentName: null }),
      request({ id: "c", environment: "dev", environmentName: "development" })
    ];
    expect(idsSortedBy(requests, SecretApprovalRequestOrderBy.Environment, OrderByDirection.ASC)).toEqual([
      "c",
      "a",
      "b"
    ]);
    expect(idsSortedBy(requests, SecretApprovalRequestOrderBy.Environment, OrderByDirection.DESC)).toEqual([
      "b",
      "a",
      "c"
    ]);
  });

  test("orders by the policy secret path", () => {
    const requests = [
      request({ id: "a", policy: { secretPath: "/b" } }),
      request({ id: "b", policy: { secretPath: null } }),
      request({ id: "c", policy: { secretPath: "/A" } })
    ];
    expect(idsSortedBy(requests, SecretApprovalRequestOrderBy.SecretPath, OrderByDirection.ASC)).toEqual([
      "b",
      "c",
      "a"
    ]);
  });

  test("orders by author falling back from the name to the email to the identity name", () => {
    const requests = [
      request({ id: "a", committerUser: { firstName: "zoe", lastName: null, email: "zoe@example.com" } }),
      request({ id: "b", committerUser: { firstName: null, lastName: null, email: "bob@example.com" } }),
      request({ id: "c", committerUser: null, committerIdentity: { name: "Deploy bot" } }),
      request({ id: "d", committerUser: null, committerIdentity: null })
    ];
    expect(idsSortedBy(requests, SecretApprovalRequestOrderBy.Author, OrderByDirection.ASC)).toEqual([
      "d",
      "b",
      "c",
      "a"
    ]);
  });
});

describe("mergeSecretApprovalRequestPages", () => {
  const legacy = {
    approvals: [
      request({ id: "legacy-new", createdAt: new Date("2026-01-04") }),
      request({ id: "legacy-old", createdAt: new Date("2026-01-01") })
    ],
    totalCount: 7
  };
  const global = {
    approvals: [
      request({ id: "global-new", createdAt: new Date("2026-01-05") }),
      request({ id: "global-old", createdAt: new Date("2026-01-02") })
    ],
    totalCount: 3
  };

  test("sorts both pages together, slices the requested window and sums the totals", () => {
    const merged = mergeSecretApprovalRequestPages({ pages: [legacy, global], offset: 1, limit: 2 });
    expect(merged.approvals.map((el) => el.id)).toEqual(["legacy-new", "global-old"]);
    expect(merged.totalCount).toBe(10);
  });

  test("honours the requested ordering", () => {
    const merged = mergeSecretApprovalRequestPages({
      pages: [legacy, global],
      offset: 0,
      limit: 10,
      orderBy: SecretApprovalRequestOrderBy.CreatedAt,
      orderDirection: OrderByDirection.ASC
    });
    expect(merged.approvals.map((el) => el.id)).toEqual(["legacy-old", "global-old", "legacy-new", "global-new"]);
  });
});
