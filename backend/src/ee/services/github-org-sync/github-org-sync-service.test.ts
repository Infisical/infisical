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
  const matched = (result: ReturnType<ReturnType<typeof buildGithubMemberMatcher>>) =>
    result.status === "matched" ? { id: (result.member as { id: string }).id, rule: result.rule } : result;

  describe("email rule", () => {
    test("matches a login equal to the email prefix", () => {
      const match = buildGithubMemberMatcher([member("a", "jane.doe@acme.com")]);
      expect(matched(match("Jane.Doe"))).toEqual({ id: "a", rule: "email" });
    });

    test("matches across separator differences between email and login", () => {
      const match = buildGithubMemberMatcher([member("a", "jane.doe@acme.com")]);
      expect(matched(match("janedoe"))).toEqual({ id: "a", rule: "email" });
      expect(matched(match("jane-doe"))).toEqual({ id: "a", rule: "email" });
    });
  });

  describe("org suffix rule", () => {
    test("matches a login that appends the organization name to the email prefix", () => {
      const match = buildGithubMemberMatcher([member("a", "jane@acme.com")]);
      expect(matched(match("janeacme"))).toEqual({ id: "a", rule: "email-with-org-suffix" });
    });

    test("does not match the organization name alone", () => {
      const match = buildGithubMemberMatcher([member("a", "jane@acme.com")]);
      expect(match("acme").status).toBe("unmatched");
    });
  });

  describe("name part rule", () => {
    test("matches when a login component equals the longest email part", () => {
      const match = buildGithubMemberMatcher([member("a", "j.smithson@acme.com")]);
      expect(matched(match("smithson-dev"))).toEqual({ id: "a", rule: "name-part" });
    });

    test("does not match a name part buried inside a login component", () => {
      const match = buildGithubMemberMatcher([member("a", "deep@acme.com"), member("b", "nast@acme.com")]);
      expect(match("0xarshdeep").status).toBe("unmatched");
      expect(match("carlosmonastyrski").status).toBe("unmatched");
    });

    test("does not match a name part shorter than four characters", () => {
      const match = buildGithubMemberMatcher([member("a", "j.li@acme.com")]);
      expect(match("li-jones").status).toBe("unmatched");
    });
  });

  describe("rule precedence", () => {
    test("an exact email match beats a name part match found earlier in the list", () => {
      const match = buildGithubMemberMatcher([
        member("weak", "scott@infisical.com"),
        member("exact", "scott-ray-wilson@acme.com")
      ]);
      expect(matched(match("scott-ray-wilson"))).toEqual({ id: "exact", rule: "email" });
    });

    test("falls through to the next rule only when no member matches the stronger one", () => {
      const match = buildGithubMemberMatcher([member("weak", "scott@infisical.com")]);
      expect(matched(match("scott-ray-wilson"))).toEqual({ id: "weak", rule: "name-part" });
    });
  });

  describe("ambiguity", () => {
    test("reports the candidate members rather than guessing between them", () => {
      const match = buildGithubMemberMatcher([member("a", "jane.doe@acme.com"), member("b", "janedoe@other.com")]);
      const result = match("janedoe");
      expect(result.status).toBe("ambiguous");
      if (result.status !== "ambiguous") return;
      expect(result.rule).toBe("email");
      // Callers need the members, not just their emails, so only these two are held back from removal.
      expect(result.members.map((m) => m.id)).toEqual(["a", "b"]);
    });

    test("does not report ambiguity for a member listed twice with the same email", () => {
      const match = buildGithubMemberMatcher([member("a", "jane@acme.com"), member("b", "jane@acme.com")]);
      expect(match("jane").status).toBe("matched");
    });
  });

  describe("input handling", () => {
    test("falls back to inviteEmail and skips members with neither", () => {
      const match = buildGithubMemberMatcher([member("no-email", null), member("invited", null, "bob@acme.com")]);
      expect(matched(match("bob"))).toEqual({ id: "invited", rule: "email" });
    });

    test("ignores a malformed email instead of throwing", () => {
      const match = buildGithubMemberMatcher([member("bad", "not-an-email"), member("good", "bob@acme.com")]);
      expect(() => match("bob")).not.toThrow();
      expect(matched(match("bob"))).toEqual({ id: "good", rule: "email" });
    });

    test("returns unmatched for an empty member list", () => {
      expect(buildGithubMemberMatcher([])("anyone").status).toBe("unmatched");
    });
  });
});
