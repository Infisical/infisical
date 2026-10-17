import { BadRequestError } from "@app/lib/errors";

import { TAutoApprovalContext } from "../auto-approval-types";
import {
  JIRA_AUTO_APPROVAL_PROVIDER,
  JIRA_SUBMITTED_TICKET_SUBJECT,
  JiraTicketConstraint,
  parseJiraTicket,
  TJiraTicketFacts
} from "./jira-auto-approval-provider";

const conn = { credentials: { instanceUrl: "https://acme.atlassian.net" } } as Parameters<typeof parseJiraTicket>[1];

const ctx: TAutoApprovalContext = {
  requester: { userId: "user-id", machineIdentityId: null, email: "dev@acme.com" }
};

const facts = (overrides: Partial<TJiraTicketFacts> = {}): TJiraTicketFacts => ({
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
