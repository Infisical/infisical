import { Octokit } from "@octokit/core";
import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  assertGithubGroupMembersLinked,
  buildGithubMemberMatcher,
  fetchGithubOrgTeams
} from "./github-org-sync-service";

type TVariables = { cursor: string | null; slug?: string; teamsPageSize?: number; membersPageSize?: number };

const page = <T>(nodes: T[], endCursor: string | null) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: endCursor !== null, endCursor }
});

const team = (slug: string, members: string[], membersCursor: string | null = null) => ({
  slug,
  name: slug.toUpperCase(),
  description: null,
  members: page(
    members.map((login) => ({ login, databaseId: Number(login.slice(1)) })),
    membersCursor
  )
});

const buildOctokit = (handler: (query: string, variables: TVariables) => unknown) => {
  const graphql = vi.fn(async (query: string, variables: TVariables) => handler(query, variables));
  return { octokit: { graphql } as unknown as Pick<Octokit, "graphql">, graphql };
};

describe("fetchGithubOrgTeams", () => {
  test("follows the team cursor across pages and flattens members", async () => {
    const { octokit, graphql } = buildOctokit((_query, { cursor }) => {
      if (cursor === null) {
        return { organization: { teams: page([team("a", ["u1", "u2"])], "c1") } };
      }
      return { organization: { teams: page([team("b", ["u3"])], null) } };
    });

    const teams = await fetchGithubOrgTeams(octokit, "acme");

    expect(teams).toEqual([
      {
        slug: "a",
        name: "A",
        description: null,
        members: [
          { login: "u1", databaseId: 1 },
          { login: "u2", databaseId: 2 }
        ]
      },
      { slug: "b", name: "B", description: null, members: [{ login: "u3", databaseId: 3 }] }
    ]);
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[0][0]).toContain("databaseId");
    expect(graphql.mock.calls[1][1]).toMatchObject({ cursor: "c1", org: "acme" });
  });

  test("paginates members separately for teams whose members exceed one page", async () => {
    const { octokit, graphql } = buildOctokit((query, { cursor, slug }) => {
      if (query.includes("query orgTeams")) {
        return {
          organization: {
            teams: page([team("big", ["u1"], "m1"), team("small", ["u9"])], null)
          }
        };
      }
      expect(slug).toBe("big");
      if (cursor === "m1") {
        return { organization: { team: { members: page([{ login: "u2", databaseId: 2 }], "m2") } } };
      }
      return { organization: { team: { members: page([{ login: "u3", databaseId: 3 }], null) } } };
    });

    const teams = await fetchGithubOrgTeams(octokit, "acme");

    expect(teams.find((t) => t.slug === "big")?.members).toEqual([
      { login: "u1", databaseId: 1 },
      { login: "u2", databaseId: 2 },
      { login: "u3", databaseId: 3 }
    ]);
    expect(teams.find((t) => t.slug === "small")?.members).toEqual([{ login: "u9", databaseId: 9 }]);
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  test("fails instead of returning a partial member list when the team disappears mid-pagination", async () => {
    const { octokit } = buildOctokit((query) => {
      if (query.includes("query orgTeams")) {
        return { organization: { teams: page([team("big", ["u1"], "m1")], null) } };
      }
      return { organization: { team: null } };
    });

    await expect(fetchGithubOrgTeams(octokit, "acme")).rejects.toThrow(BadRequestError);
  });

  test("passes a per-request abort signal", async () => {
    const { octokit, graphql } = buildOctokit(() => ({ organization: { teams: page([], null) } }));

    await fetchGithubOrgTeams(octokit, "acme");

    const options = graphql.mock.calls[0][1] as unknown as { request: { signal: AbortSignal } };
    expect(options.request.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("buildGithubMemberMatcher", () => {
  const alias = (externalId: string, userId: string, isEmailVerified = true) => ({
    externalId,
    userId,
    isEmailVerified
  });
  const githubMember = (databaseId: number | null, login = "any-login") => ({ databaseId, login });

  test("matches the exact GitHub account ID", () => {
    const match = buildGithubMemberMatcher([alias("123", "user-a")], new Set(["user-a"]));

    expect(match(githubMember(123, "renamed-user"))).toBe("user-a");
  });

  test("does not infer a match from the GitHub login", () => {
    const match = buildGithubMemberMatcher([alias("123", "user-a")], new Set(["user-a"]));

    expect(match(githubMember(456, "123"))).toBeUndefined();
  });

  test("ignores an alias whose email has not been verified", () => {
    const match = buildGithubMemberMatcher([alias("123", "user-a", false)], new Set(["user-a"]));

    expect(match(githubMember(123))).toBeUndefined();
  });

  test("ignores an alias whose user is not an active organization member", () => {
    const match = buildGithubMemberMatcher([alias("123", "user-a")], new Set(["user-b"]));

    expect(match(githubMember(123))).toBeUndefined();
  });

  test("ignores a GitHub member without a database ID", () => {
    const match = buildGithubMemberMatcher([alias("123", "user-a")], new Set(["user-a"]));

    expect(match(githubMember(null))).toBeUndefined();
  });
});

describe("assertGithubGroupMembersLinked", () => {
  const activeUsers = [
    { id: "user-a", email: "alice@example.com" },
    { id: "user-b", email: "bob@example.com" }
  ];

  test("allows reconciliation when every existing member has a verified GitHub link", () => {
    expect(() =>
      assertGithubGroupMembersLinked({
        currentUserIds: new Set(["user-a", "user-b"]),
        linkedUserIds: new Set(["user-a", "user-b"]),
        activeUsers
      })
    ).not.toThrow();
  });

  test("stops reconciliation before changes when an existing member has no verified GitHub link", () => {
    expect(() =>
      assertGithubGroupMembersLinked({
        currentUserIds: new Set(["user-a", "user-b"]),
        linkedUserIds: new Set(["user-a"]),
        activeUsers,
        noChangesApplied: true
      })
    ).toThrow(/bob@example\.com.*No changes were applied/);
  });
});
