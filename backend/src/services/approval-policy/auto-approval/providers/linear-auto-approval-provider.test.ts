import { BadRequestError } from "@app/lib/errors";
import { getLinearIssue, LinearGraphqlError, TLinearIssue, TLinearUser } from "@app/services/app-connection/linear";

import { TAutoApprovalContext } from "../auto-approval-types";
import {
  LINEAR_AUTO_APPROVAL_PROVIDER,
  LINEAR_SUBMITTED_ISSUE_SUBJECT,
  LinearIssueConstraint,
  parseLinearIssue,
  TLinearIssueFacts
} from "./linear-auto-approval-provider";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/linear", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/linear")>()),
  getLinearIssue: vi.fn()
}));

const conn = { credentials: { apiKey: "lin_api_x", workspaceUrlKey: "acme" } } as Parameters<
  typeof parseLinearIssue
>[1];

const ctx: TAutoApprovalContext = { requester: { email: "dev@acme.com" } };

const facts = (overrides: Partial<TLinearIssueFacts> = {}): TLinearIssueFacts => ({
  issueId: "uuid-1",
  identifier: "ENG-123",
  status: "Approved",
  teamKey: "ENG",
  labels: ["prod-access"],
  assignee: null,
  ...overrides
});

const subject = LINEAR_AUTO_APPROVAL_PROVIDER.subjects[LINEAR_SUBMITTED_ISSUE_SUBJECT];
const check = (constraint: LinearIssueConstraint, issue: TLinearIssueFacts, values: string[] = []) =>
  subject.constraints[constraint].test(issue, values, ctx);

describe("parseLinearIssue", () => {
  test("accepts an issue ID in any case", () => {
    expect(parseLinearIssue("ENG-123", conn)).toBe("ENG-123");
    expect(parseLinearIssue("  eng-123 ", conn)).toBe("ENG-123");
    expect(parseLinearIssue("OPS2-9", conn)).toBe("OPS2-9");
  });

  test("reads the ID from links to the issue in the connection's workspace", () => {
    expect(parseLinearIssue("https://linear.app/acme/issue/ENG-123/rotate-the-db-key", conn)).toBe("ENG-123");
    expect(parseLinearIssue("https://linear.app/ACME/issue/eng-7", conn)).toBe("ENG-7");
    expect(parseLinearIssue("linear.app/acme/issue/ENG-8/title", conn)).toBe("ENG-8");
  });

  test("skips the workspace check for connections that didn't store one", () => {
    expect(parseLinearIssue("https://linear.app/other/issue/ENG-1", { credentials: { apiKey: "x" } } as never)).toBe(
      "ENG-1"
    );
  });

  test("rejects links to another workspace or site", () => {
    expect(() => parseLinearIssue("https://linear.app/evil/issue/ENG-123", conn)).toThrow(
      /Linear workspace evil, but this Linear connection is for acme/
    );
    expect(() => parseLinearIssue("https://evil.app/acme/issue/ENG-123", conn)).toThrow(/isn't on linear\.app/);
    expect(() => parseLinearIssue("http://linear.app/acme/issue/ENG-123", conn)).toThrow(/isn't on linear\.app/);
  });

  test("rejects values that are not an issue", () => {
    [
      "",
      "ENG",
      "ENG-0",
      "123",
      "https://linear.app/acme/project/ENG-123",
      "https://linear.app/acme/issue/",
      "https://linear.app/acme"
    ].forEach((value) => expect(() => parseLinearIssue(value, conn)).toThrow(BadRequestError));
  });

  test("builds the issue link from the connection's workspace", () => {
    expect(subject.input?.getUrl?.("ENG-123", conn as never)).toBe("https://linear.app/acme/issue/ENG-123");
  });
});

describe("Linear issue checks", () => {
  test("status and team match any listed value, ignoring case", () => {
    expect(check(LinearIssueConstraint.Status, facts(), ["approved", "Done"]).pass).toBe(true);
    expect(check(LinearIssueConstraint.Status, facts({ status: "In Progress" }), ["Approved", "Done"])).toEqual({
      pass: false,
      reason: "status isn't Approved or Done"
    });
    expect(check(LinearIssueConstraint.Team, facts({ teamKey: "OPS" }), ["ENG"]).reason).toBe("team isn't ENG");
  });

  test("label check passes when any label matches", () => {
    expect(check(LinearIssueConstraint.Label, facts({ labels: [] }), ["oncall"]).reason).toBe(
      "doesn't have label oncall"
    );
    expect(check(LinearIssueConstraint.Label, facts({ labels: ["Bug", "OnCall"] }), ["oncall"]).pass).toBe(true);
  });

  test("assignee check fails closed when it was not fetched", () => {
    expect(check(LinearIssueConstraint.AssignedToRequester, facts()).pass).toBe(false);
  });
});

describe("resolving a Linear issue", () => {
  const issue = (assignee: TLinearUser | null = null): TLinearIssue => ({
    id: "uuid-1",
    identifier: "ENG-123",
    state: { name: "Approved", type: "started" },
    team: { key: "ENG", name: "Engineering" },
    labels: { nodes: [{ name: "prod-access" }] },
    assignee
  });

  const resolveIssue = (constraintIds: string[]) =>
    subject.resolve(
      conn as never,
      "ENG-123",
      ctx,
      Object.fromEntries(constraintIds.map((constraintId) => [constraintId, []])),
      {} as Parameters<typeof subject.resolve>[4]
    ) as Promise<TLinearIssueFacts>;

  beforeEach(() => {
    vi.mocked(getLinearIssue).mockReset().mockResolvedValue(issue());
  });

  test("keeps the facts the checks read", async () => {
    expect(await resolveIssue([LinearIssueConstraint.Status])).toEqual({
      issueId: "uuid-1",
      identifier: "ENG-123",
      status: "Approved",
      teamKey: "ENG",
      labels: ["prod-access"],
      assignee: null
    });
  });

  test("matches the assignee only by a visible email address", async () => {
    const assigneeOf = async (assignee: TLinearUser | null) => {
      vi.mocked(getLinearIssue).mockResolvedValue(issue(assignee));
      return (await resolveIssue([LinearIssueConstraint.AssignedToRequester])).assignee;
    };

    expect(await assigneeOf({ email: "DEV@acme.com" })).toEqual({ matchesRequester: true, reason: null });
    expect((await assigneeOf({ email: null }))?.reason).toBe(
      "Linear doesn't share the email address of ENG-123's assignee"
    );
    expect((await assigneeOf({ email: "ops@acme.com" }))?.reason).toBe("ENG-123 isn't assigned to the requester");
    expect((await assigneeOf(null))?.reason).toBe("ENG-123 isn't assigned to anyone");
  });

  test("explains issues that can't be read", async () => {
    vi.mocked(getLinearIssue).mockRejectedValue(new LinearGraphqlError({ message: "Entity not found: Issue" }));
    await expect(resolveIssue([])).rejects.toThrow(
      "Linear issue ENG-123 doesn't exist, or the Linear connection can't see it"
    );

    vi.mocked(getLinearIssue).mockRejectedValue(
      new LinearGraphqlError({ message: "Could not find referenced Issue.", extensions: { code: "INPUT_ERROR" } })
    );
    await expect(resolveIssue([])).rejects.toThrow(
      "Linear issue ENG-123 doesn't exist, or the Linear connection can't see it"
    );

    vi.mocked(getLinearIssue).mockRejectedValue(
      new LinearGraphqlError({ message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } })
    );
    await expect(resolveIssue([])).rejects.toThrow(
      "Couldn't read Linear issue ENG-123: Linear rejected the connection's API key"
    );

    vi.mocked(getLinearIssue).mockRejectedValue(
      new LinearGraphqlError({ message: "stack trace", extensions: { code: "INTERNAL_SERVER_ERROR" } })
    );
    await expect(resolveIssue([])).rejects.toThrow(
      "Couldn't read Linear issue ENG-123: Linear returned an error (INTERNAL_SERVER_ERROR)"
    );
  });

  test("rejects issues in the trash or archived", async () => {
    vi.mocked(getLinearIssue).mockResolvedValue({ ...issue(), trashed: true });
    await expect(resolveIssue([])).rejects.toThrow("Linear issue ENG-123 is in the trash");

    vi.mocked(getLinearIssue).mockResolvedValue({ ...issue(), archivedAt: "2026-11-01T00:00:00Z" });
    await expect(resolveIssue([])).rejects.toThrow("Linear issue ENG-123 is archived");
  });

  test("identifies an issue by Linear's id, which survives a move to another team", async () => {
    vi.mocked(getLinearIssue).mockResolvedValue({ ...issue(), identifier: "OPS-9" });
    expect(subject.getStableId?.(await resolveIssue([]))).toBe("uuid-1");
  });
});
