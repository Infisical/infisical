import { AxiosError, AxiosResponse } from "axios";

import { BadRequestError } from "@app/lib/errors";
import {
  getJiraIssue,
  listJiraIssueApprovals,
  TJiraApproval,
  TJiraIssue,
  TJiraUser
} from "@app/services/app-connection/jira";

import { TAutoApprovalContext } from "../auto-approval-types";
import {
  JIRA_AUTO_APPROVAL_PROVIDER,
  JIRA_SUBMITTED_TICKET_SUBJECT,
  JiraTicketConstraint,
  parseJiraTicket,
  TJiraTicketFacts
} from "./jira-auto-approval-provider";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/jira", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/jira")>()),
  getJiraIssue: vi.fn(),
  listJiraIssueApprovals: vi.fn()
}));

const conn = { credentials: { instanceUrl: "https://acme.atlassian.net" } } as Parameters<typeof parseJiraTicket>[1];

const ctx: TAutoApprovalContext = {
  requester: { email: "dev@acme.com" }
};

const facts = (overrides: Partial<TJiraTicketFacts> = {}): TJiraTicketFacts => ({
  issueId: "10001",
  key: "PAY-123",
  status: "Approved",
  projectKey: "PAY",
  issueType: "Change Request",
  labels: ["prod-access"],
  assignee: null,
  approval: null,
  ...overrides
});

const { constraints } = JIRA_AUTO_APPROVAL_PROVIDER.subjects[JIRA_SUBMITTED_TICKET_SUBJECT];
const check = (constraint: JiraTicketConstraint, ticket: TJiraTicketFacts, values: string[] = []) =>
  constraints[constraint].test(ticket, values, ctx);

describe("parseJiraTicket", () => {
  test("accepts a ticket key in any case", () => {
    expect(parseJiraTicket("PAY-123", conn)).toBe("PAY-123");
    expect(parseJiraTicket("  pay-123 ", conn)).toBe("PAY-123");
    expect(parseJiraTicket("OPS_2-9", conn)).toBe("OPS_2-9");
  });

  test("reads the key from links to the ticket on the connection's site", () => {
    expect(parseJiraTicket("https://acme.atlassian.net/browse/PAY-123", conn)).toBe("PAY-123");
    expect(
      parseJiraTicket("https://acme.atlassian.net/jira/software/projects/PAY/boards/1?selectedIssue=PAY-7", conn)
    ).toBe("PAY-7");
    expect(parseJiraTicket("https://acme.atlassian.net/servicedesk/customer/portal/2/PAY-55", conn)).toBe("PAY-55");
  });

  test("rejects links to another Jira site", () => {
    expect(() => parseJiraTicket("https://evil.atlassian.net/browse/PAY-123", conn)).toThrow(BadRequestError);
    expect(() => parseJiraTicket("https://evil.atlassian.net/browse/PAY-123", conn)).toThrow(/acme\.atlassian\.net/);
  });

  test("rejects values that are not a ticket", () => {
    [
      "",
      "PAY",
      "PAY-0",
      "123",
      "P-1",
      "https://acme.atlassian.net/browse/",
      "ftp://acme.atlassian.net/browse/PAY-1"
    ].forEach((value) => expect(() => parseJiraTicket(value, conn)).toThrow(BadRequestError));
  });
});

describe("Jira ticket checks", () => {
  test("status matches any listed status, ignoring case", () => {
    expect(check(JiraTicketConstraint.Status, facts(), ["approved", "Scheduled"]).pass).toBe(true);
    expect(check(JiraTicketConstraint.Status, facts({ status: "In Progress" }), ["Approved", "Scheduled"])).toEqual({
      pass: false,
      reason: "status isn't Approved or Scheduled"
    });
  });

  test("project, type, and label checks fail without revealing the ticket's values", () => {
    expect(check(JiraTicketConstraint.Project, facts({ projectKey: "OPS" }), ["PAY"]).reason).toBe("project isn't PAY");
    expect(check(JiraTicketConstraint.Type, facts({ issueType: null }), ["Incident"]).reason).toBe(
      "type isn't Incident"
    );
    expect(check(JiraTicketConstraint.Label, facts({ labels: [] }), ["oncall"]).reason).toBe(
      "doesn't have label oncall"
    );
    expect(check(JiraTicketConstraint.Label, facts({ labels: ["incident"] }), ["oncall"]).reason).toBe(
      "doesn't have label oncall"
    );
    expect(check(JiraTicketConstraint.Label, facts({ labels: ["incident", "OnCall"] }), ["oncall"]).pass).toBe(true);
  });

  test("assignee and approval checks fail closed when they were not fetched", () => {
    expect(check(JiraTicketConstraint.AssignedToRequester, facts()).pass).toBe(false);
    expect(check(JiraTicketConstraint.Approved, facts()).pass).toBe(false);
  });

  test("assignee and approval checks pass only on a positive match", () => {
    expect(
      check(JiraTicketConstraint.AssignedToRequester, facts({ assignee: { matchesRequester: true, reason: null } }))
        .pass
    ).toBe(true);
    expect(
      check(
        JiraTicketConstraint.AssignedToRequester,
        facts({ assignee: { matchesRequester: false, reason: "PAY-123 isn't assigned to the requester" } })
      ).reason
    ).toBe("PAY-123 isn't assigned to the requester");
    expect(check(JiraTicketConstraint.Approved, facts({ approval: { approved: true, reason: null } })).pass).toBe(true);
  });
});

describe("resolving a Jira ticket", () => {
  const { resolve } = JIRA_AUTO_APPROVAL_PROVIDER.subjects[JIRA_SUBMITTED_TICKET_SUBJECT];

  const issue = (assignee: TJiraUser | null = null): TJiraIssue => ({
    id: "10001",
    key: "PAY-123",
    fields: { status: { id: "1", name: "Approved" }, project: { id: "1", key: "PAY", name: "Payments" }, assignee }
  });
  const approval = (finalDecision: TJiraApproval["finalDecision"], epochMillis: number): TJiraApproval => ({
    id: String(epochMillis),
    finalDecision,
    createdDate: { epochMillis }
  });
  const jiraError = (status: number) =>
    new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status } as AxiosResponse);

  const resolveTicket = (constraintIds: string[]) =>
    resolve(
      conn as Parameters<typeof resolve>[0],
      "PAY-123",
      ctx,
      constraintIds,
      {} as Parameters<typeof resolve>[4]
    ) as Promise<TJiraTicketFacts>;

  beforeEach(() => {
    vi.mocked(getJiraIssue).mockReset().mockResolvedValue(issue());
    vi.mocked(listJiraIssueApprovals).mockReset();
  });

  test("uses Jira's newest approval decision, whatever order it arrives in", async () => {
    vi.mocked(listJiraIssueApprovals).mockResolvedValue([approval("declined", 2), approval("approved", 1)]);
    expect((await resolveTicket([JiraTicketConstraint.Approved])).approval).toEqual({
      approved: false,
      reason: "PAY-123 isn't approved in Jira"
    });

    vi.mocked(listJiraIssueApprovals).mockResolvedValue([approval("approved", 2), approval("pending", 1)]);
    expect((await resolveTicket([JiraTicketConstraint.Approved])).approval).toEqual({ approved: true, reason: null });
  });

  test("explains tickets that have no approvals to read", async () => {
    vi.mocked(listJiraIssueApprovals).mockResolvedValue([]);
    expect((await resolveTicket([JiraTicketConstraint.Approved])).approval?.reason).toBe(
      "PAY-123 has no approvals in Jira yet"
    );

    vi.mocked(listJiraIssueApprovals).mockRejectedValue(jiraError(404));
    expect((await resolveTicket([JiraTicketConstraint.Approved])).approval?.reason).toBe(
      "PAY-123 isn't a Jira Service Management request, or the Jira connection can't see its approvals"
    );
  });

  test("fails closed on failed reads without repeating Jira's error", async () => {
    vi.mocked(listJiraIssueApprovals).mockRejectedValue(new Error("upstream detail"));
    expect((await resolveTicket([JiraTicketConstraint.Approved])).approval).toEqual({
      approved: false,
      reason: "Couldn't read Jira approvals on PAY-123"
    });

    vi.mocked(getJiraIssue).mockRejectedValue(jiraError(500));
    await expect(resolveTicket([])).rejects.toThrow(
      new BadRequestError({ message: "Couldn't read Jira ticket PAY-123" })
    );

    vi.mocked(getJiraIssue).mockRejectedValue(jiraError(404));
    await expect(resolveTicket([])).rejects.toThrow(
      "Jira ticket PAY-123 doesn't exist, or the Jira connection can't see it"
    );
  });

  test("matches the assignee only by a visible email address", async () => {
    const assigneeOf = async (assignee: TJiraUser | null) => {
      vi.mocked(getJiraIssue).mockResolvedValue(issue(assignee));
      return (await resolveTicket([JiraTicketConstraint.AssignedToRequester])).assignee;
    };

    expect(await assigneeOf({ emailAddress: "DEV@acme.com" })).toEqual({ matchesRequester: true, reason: null });
    expect((await assigneeOf({ emailAddress: "" }))?.reason).toBe(
      "Jira doesn't share the email address of PAY-123's assignee"
    );
    expect((await assigneeOf({ emailAddress: "ops@acme.com" }))?.reason).toBe(
      "PAY-123 isn't assigned to the requester"
    );
    expect((await assigneeOf(null))?.reason).toBe("PAY-123 isn't assigned to anyone");
  });

  test("identifies a ticket by Jira's issue id, which survives a move to another key", async () => {
    vi.mocked(getJiraIssue).mockResolvedValue({ ...issue(), key: "OPS-9" });
    const { getStableId } = JIRA_AUTO_APPROVAL_PROVIDER.subjects[JIRA_SUBMITTED_TICKET_SUBJECT];

    expect(getStableId?.(await resolveTicket([]))).toBe("10001");
  });

  test("only reads approvals when a rule checks them", async () => {
    const ticket = await resolveTicket([JiraTicketConstraint.Status]);

    expect(listJiraIssueApprovals).not.toHaveBeenCalled();
    expect(ticket.approval).toBeNull();
    expect(ticket.status).toBe("Approved");
  });
});
