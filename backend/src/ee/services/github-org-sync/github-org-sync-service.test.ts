import { Octokit } from "@octokit/core";
import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { buildGithubMemberMatcher, fetchGithubOrgTeams } from "./github-org-sync-service";

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
    members.map((login) => ({ login })),
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
      { slug: "a", name: "A", description: null, members: ["u1", "u2"] },
      { slug: "b", name: "B", description: null, members: ["u3"] }
    ]);
    expect(graphql).toHaveBeenCalledTimes(2);
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
        return { organization: { team: { members: page([{ login: "u2" }], "m2") } } };
      }
      return { organization: { team: { members: page([{ login: "u3" }], null) } } };
    });

    const teams = await fetchGithubOrgTeams(octokit, "acme");

    expect(teams.find((t) => t.slug === "big")?.members).toEqual(["u1", "u2", "u3"]);
    expect(teams.find((t) => t.slug === "small")?.members).toEqual(["u9"]);
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
  const member = (id: string, email: string | null, inviteEmail: string | null = null) => ({
    id,
    user: email === null ? null : { email },
    inviteEmail
  });

  test("matches a login equal to the email prefix", () => {
    const match = buildGithubMemberMatcher([member("a", "jane.doe@acme.com")]);
    expect(match("Jane.Doe")?.id).toBe("a");
    expect(match("someone-else")).toBeUndefined();
  });

  test("matches a login that appends the domain name to the email prefix", () => {
    const match = buildGithubMemberMatcher([member("a", "jane@acme.com")]);
    expect(match("janeacme")?.id).toBe("a");
    expect(match("acme")).toBeUndefined();
  });

  test("matches when the longest email part is contained in the login", () => {
    const match = buildGithubMemberMatcher([member("a", "j.smithson@acme.com")]);
    expect(match("smithson-dev")?.id).toBe("a");
  });

  test("does not match on an email part shorter than four characters", () => {
    const match = buildGithubMemberMatcher([member("a", "j.li@acme.com")]);
    expect(match("xxliyy")).toBeUndefined();
  });

  test("returns the first matching member, preserving input order", () => {
    const match = buildGithubMemberMatcher([member("first", "bob@acme.com"), member("second", "bob@other.com")]);
    expect(match("bob")?.id).toBe("first");
  });

  test("falls back to inviteEmail and skips members with neither", () => {
    const match = buildGithubMemberMatcher([member("no-email", null), member("invited", null, "bob@acme.com")]);
    expect(match("bob")?.id).toBe("invited");
  });

  test("ignores a malformed email instead of throwing", () => {
    const match = buildGithubMemberMatcher([member("bad", "not-an-email"), member("good", "bob@acme.com")]);
    expect(() => match("bob")).not.toThrow();
    expect(match("bob")?.id).toBe("good");
  });
});
