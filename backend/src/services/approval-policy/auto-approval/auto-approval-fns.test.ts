import {
  evaluateAutoApprovalRules,
  getAutoApprovalSummary,
  getClosestFailedRule,
  toAutoApprovalOutcome,
  TResolvedAutoApprovalSubject
} from "./auto-approval-fns";
import {
  AUTO_APPROVAL_AI_CONSTRAINT,
  AUTO_APPROVAL_AI_SUBJECT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AUTO_APPROVAL_UNUSED_CONSTRAINT,
  AutoApprovalConstraintValue,
  TAutoApprovalContext,
  TAutoApprovalSubject,
  TStoredAutoApproval
} from "./auto-approval-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

type TFacts = { status: string };

const ticket: TAutoApprovalSubject<unknown, TFacts> = {
  label: "Jira ticket",
  input: { label: "Jira ticket", placeholder: "PAY-123", parse: (value) => value },
  resolve: async () => ({ status: "Approved" }),
  constraints: {
    status: {
      label: "has status",
      value: AutoApprovalConstraintValue.Many,
      test: (facts, values) =>
        values.includes(facts.status) ? { pass: true } : { pass: false, reason: `status is ${facts.status}` }
    },
    broken: {
      label: "is broken",
      value: AutoApprovalConstraintValue.None,
      test: () => {
        throw new Error("boom");
      }
    }
  }
};

const ctx: TAutoApprovalContext = { requester: { email: "dev@acme.com" } };

const condition = (id: string, constraint: string, values: string[], inputId: string | null = "input-1") => ({
  id,
  inputId,
  connectionId: "connection-1",
  subject: inputId ? "submitted-ticket" : AUTO_APPROVAL_REQUESTER_SUBJECT,
  constraint,
  values,
  prompt: null,
  contextConnectionIds: []
});

const resolved = (status: string, error: string | null = null) =>
  new Map<string, TResolvedAutoApprovalSubject>([
    ["input-1", { label: "Jira ticket", definition: ticket, facts: { status }, error }]
  ]);

describe("evaluateAutoApprovalRules", () => {
  const rules: TStoredAutoApproval["rules"] = [
    { id: "rule-1", name: "Scheduled change", conditions: [condition("c-1", "status", ["Scheduled"])] },
    { id: "rule-2", name: "Approved ticket", conditions: [condition("c-2", "status", ["Approved"])] }
  ];

  test("approves with the first rule whose conditions all pass", () => {
    const result = evaluateAutoApprovalRules(rules, resolved("Approved"), ctx);

    expect(result.approvedByRuleId).toBe("rule-2");
    expect(result.rules.map((rule) => rule.passed)).toEqual([false, true]);
    expect(result.rules[0].conditions[0]).toMatchObject({
      description: "Jira ticket has status Scheduled",
      passed: false,
      reason: "status is Approved"
    });
  });

  test("requires every condition in a rule", () => {
    const result = evaluateAutoApprovalRules(
      [
        {
          id: "rule-1",
          name: "Both",
          conditions: [condition("c-1", "status", ["Approved"]), condition("c-2", "status", ["Done"])]
        }
      ],
      resolved("Approved"),
      ctx
    );

    expect(result.approvedByRuleId).toBeNull();
  });

  test("fails closed when the subject could not be fetched, the check is gone, or the test throws", () => {
    expect(evaluateAutoApprovalRules(rules, resolved("Approved", "Couldn't reach Jira"), ctx)).toMatchObject({
      approvedByRuleId: null,
      rules: [{ conditions: [{ reason: "Couldn't reach Jira" }] }, { conditions: [{ reason: "Couldn't reach Jira" }] }]
    });

    const missing = evaluateAutoApprovalRules(
      [{ id: "rule-1", name: "Gone", conditions: [condition("c-1", "removed", [])] }],
      resolved("Approved"),
      ctx
    );
    expect(missing.rules[0].conditions[0]).toMatchObject({
      passed: false,
      reason: "This check is no longer available"
    });

    const throwing = evaluateAutoApprovalRules(
      [{ id: "rule-1", name: "Broken", conditions: [condition("c-1", "broken", [])] }],
      resolved("Approved"),
      ctx
    );
    expect(throwing.approvedByRuleId).toBeNull();
  });

  test("never approves with a rule that has no conditions", () => {
    expect(
      evaluateAutoApprovalRules([{ id: "rule-1", name: "Empty", conditions: [] }], resolved("Approved"), ctx)
    ).toMatchObject({ approvedByRuleId: null });
  });

  test("passes the reuse check only for a record no earlier approved request linked", () => {
    const unusedRules = [
      { id: "rule-1", name: "Single use", conditions: [condition("c-1", AUTO_APPROVAL_UNUSED_CONSTRAINT, [])] }
    ];
    const subjects = (previouslyUsed: boolean) =>
      new Map<string, TResolvedAutoApprovalSubject>([
        [
          "input-1",
          { label: "Jira ticket", definition: ticket, facts: {}, error: null, recordId: "PAY-123", previouslyUsed }
        ]
      ]);

    expect(evaluateAutoApprovalRules(unusedRules, subjects(false), ctx).approvedByRuleId).toBe("rule-1");
    expect(evaluateAutoApprovalRules(unusedRules, subjects(true), ctx).rules[0].conditions[0]).toMatchObject({
      description: "Jira ticket hasn't been used before",
      passed: false,
      reason: "Jira ticket PAY-123 was already used for another request"
    });
  });
});

describe("toAutoApprovalOutcome", () => {
  const evidence = {
    version: 1,
    evaluatedAt: "2026-10-13T00:00:00.000Z",
    approvedByRuleId: "rule-1",
    inputs: [
      {
        inputId: "input-1",
        connectionId: "connection-1",
        subject: "submitted-ticket",
        label: "Jira ticket",
        value: "https://acme.atlassian.net/browse/PAY-123",
        id: "PAY-123",
        url: "https://acme.atlassian.net/browse/PAY-123",
        stableId: "10001"
      }
    ],
    subjects: [
      {
        connectionId: "connection-1",
        subject: "submitted-ticket",
        inputId: "input-1",
        facts: { secret: 1 },
        error: null
      }
    ],
    rules: [
      {
        id: "rule-1",
        name: "Approved ticket",
        passed: true,
        conditions: [
          {
            id: "c-1",
            connectionId: "connection-1",
            subject: "submitted-ticket",
            constraint: "status",
            values: ["Approved"],
            description: "Jira ticket has status Approved",
            passed: true,
            reason: null
          }
        ]
      }
    ]
  };

  test("returns results and reasons without the fetched facts", () => {
    const approvedAt = new Date();
    const outcome = toAutoApprovalOutcome({ autoApprovedAt: approvedAt, autoApprovalEvidence: evidence });

    expect(outcome).toEqual({
      approvedAt,
      approvedByRuleId: "rule-1",
      inputs: [{ label: "Jira ticket", value: "PAY-123", url: "https://acme.atlassian.net/browse/PAY-123" }],
      rules: [
        {
          id: "rule-1",
          name: "Approved ticket",
          passed: true,
          conditions: [
            { id: "c-1", description: "Jira ticket has status Approved", passed: true, reason: null, ai: null }
          ]
        }
      ]
    });
    expect(JSON.stringify(outcome)).not.toContain("secret");
  });

  test("is null for a request that was never evaluated", () => {
    expect(toAutoApprovalOutcome({ autoApprovalEvidence: null })).toBeNull();
    expect(toAutoApprovalOutcome({})).toBeNull();
  });

  test("summarizes the approving rule for audit logs", () => {
    expect(getAutoApprovalSummary(evidence)).toEqual({
      ruleId: "rule-1",
      ruleName: "Approved ticket",
      linkedRecords: [{ label: "Jira ticket", value: "PAY-123" }],
      conditions: ["Jira ticket has status Approved"]
    });
  });
});

describe("getClosestFailedRule", () => {
  const result = (passed: boolean, reason: string | null = null) => ({
    id: "c",
    connectionId: "conn",
    subject: "submitted-ticket",
    constraint: "status",
    values: [],
    description: "Jira ticket has status Approved",
    passed,
    reason
  });

  test("picks the failed rule with the fewest failed conditions, then the most passed", () => {
    expect(
      getClosestFailedRule({
        rules: [
          { id: "a", name: "Two misses", passed: false, conditions: [result(false, "a1"), result(false, "a2")] },
          { id: "b", name: "One miss", passed: false, conditions: [result(false, "b1")] },
          {
            id: "c",
            name: "One miss, more passes",
            passed: false,
            conditions: [result(true), result(false, "c1")]
          }
        ]
      })
    ).toEqual({ ruleName: "One miss, more passes", reason: "c1" });
  });

  test("is null when no rule failed", () => {
    expect(getClosestFailedRule({ rules: [] })).toBeNull();
  });
});

describe("AI conditions", () => {
  const aiCondition = {
    id: "c-ai",
    inputId: null,
    connectionId: null,
    subject: AUTO_APPROVAL_AI_SUBJECT,
    constraint: AUTO_APPROVAL_AI_CONSTRAINT,
    values: [],
    prompt: "Approve if the reason cites an open incident",
    contextConnectionIds: ["jira-1"]
  };
  const rules: TStoredAutoApproval["rules"] = [
    { id: "rule-1", name: "Incident access", conditions: [condition("c-1", "status", ["Scheduled"]), aiCondition] }
  ];
  const aiResult = {
    approve: true,
    reason: "INC-1 is open and assigned to the requester",
    model: "claude-test",
    error: null,
    toolCalls: [
      {
        tool: "jira_get_ticket",
        connectionId: "jira-1",
        connectionName: "jira-cloud",
        input: { key: "INC-1" },
        summary: "Read INC-1 (Open, assigned to Dev)",
        error: null,
        result: { key: "INC-1", description: "secret details" }
      }
    ]
  };

  test("fails an AI condition the AI didn't review", () => {
    const result = evaluateAutoApprovalRules(rules, resolved("Scheduled"), ctx);
    expect(result.approvedByRuleId).toBeNull();
    expect(result.rules[0].conditions[1]).toMatchObject({
      passed: false,
      reason: "The AI didn't review this request",
      description: "AI approves the request"
    });
  });

  test("approves when the AI approves and the other conditions pass", () => {
    const result = evaluateAutoApprovalRules(
      rules,
      resolved("Scheduled"),
      ctx,
      new Map([["c-ai", { passed: true, reason: null, ai: aiResult }]])
    );
    expect(result.approvedByRuleId).toBe("rule-1");
    expect(result.rules[0].conditions[1].ai).toEqual(aiResult);
  });

  test("returns the AI's steps without what the tools returned", () => {
    const evidence = {
      version: 1,
      evaluatedAt: new Date().toISOString(),
      inputs: [],
      subjects: [],
      ...evaluateAutoApprovalRules(
        rules,
        resolved("Scheduled"),
        ctx,
        new Map([["c-ai", { passed: true, reason: null, ai: aiResult }]])
      )
    };
    const outcome = toAutoApprovalOutcome({ autoApprovedAt: new Date(), autoApprovalEvidence: evidence });
    const ai = outcome?.rules[0].conditions[1].ai;
    expect(ai?.reason).toBe(aiResult.reason);
    expect(ai?.toolCalls).toEqual([
      {
        tool: "jira_get_ticket",
        connectionName: "jira-cloud",
        input: { key: "INC-1" },
        summary: "Read INC-1 (Open, assigned to Dev)",
        error: null
      }
    ]);
    expect(JSON.stringify(outcome)).not.toContain("secret details");
    expect(outcome?.rules[0].conditions[0].ai).toBeNull();
  });

  test("hides the AI's reasoning and lookups from the requester", () => {
    const declined = { ...aiResult, approve: false, reason: "INC-1 is closed" };
    const evidence = {
      version: 1,
      evaluatedAt: new Date().toISOString(),
      inputs: [],
      subjects: [],
      ...evaluateAutoApprovalRules(
        rules,
        resolved("Scheduled"),
        ctx,
        new Map([["c-ai", { passed: false, reason: "INC-1 is closed", ai: declined }]])
      )
    };

    const outcome = toAutoApprovalOutcome({ autoApprovalEvidence: evidence }, { hideAi: true });

    expect(outcome?.rules[0].conditions[1]).toMatchObject({ reason: null, ai: null });
    expect(JSON.stringify(outcome)).not.toContain("INC-1 is closed");
    expect(getClosestFailedRule(evidence)?.reason).toBeNull();
    expect(toAutoApprovalOutcome({ autoApprovalEvidence: evidence })?.rules[0].conditions[1].reason).toBe(
      "INC-1 is closed"
    );
  });
});
