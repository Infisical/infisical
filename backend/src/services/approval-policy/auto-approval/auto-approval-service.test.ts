import { TAiJudgeResult } from "@app/services/ai/ai-types";

import { autoApprovalServiceFactory } from "./auto-approval-service";
import {
  AUTO_APPROVAL_AI_CONSTRAINT,
  AUTO_APPROVAL_AI_SUBJECT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  TStoredAutoApproval
} from "./auto-approval-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (raw: unknown) => raw
}));
vi.mock("./auto-approval-providers", () => ({
  AUTO_APPROVAL_APPS: [],
  getAutoApprovalProvider: () => ({
    subjects: {
      [AUTO_APPROVAL_REQUESTER_SUBJECT]: {
        label: "Requester",
        resolve: async () => ({ status: "Approved" }),
        constraints: {
          status: {
            label: "has status",
            value: AutoApprovalConstraintValue.Many,
            test: (facts: { status: string }, values: string[]) =>
              values.includes(facts.status) ? { pass: true } : { pass: false, reason: `status is ${facts.status}` }
          }
        }
      }
    }
  })
}));

type TCondition = TStoredAutoApproval["rules"][number]["conditions"][number];

const aiCondition = (id: string): TCondition => ({
  id,
  inputId: null,
  connectionId: null,
  subject: AUTO_APPROVAL_AI_SUBJECT,
  constraint: AUTO_APPROVAL_AI_CONSTRAINT,
  values: [],
  prompt: "Approve if it looks fine",
  contextConnectionIds: []
});

const statusCondition = (id: string, status: string): TCondition => ({
  id,
  inputId: null,
  connectionId: "connection-1",
  subject: AUTO_APPROVAL_REQUESTER_SUBJECT,
  constraint: "status",
  values: [status],
  prompt: null,
  contextConnectionIds: []
});

const judge = (approve: boolean): TAiJudgeResult => ({
  approve,
  reason: approve ? "Looks fine" : "Not convinced",
  model: "claude-test",
  toolCalls: [],
  error: null
});

const setup = (runJudge: (args: { deadline?: number }) => Promise<TAiJudgeResult>) => {
  const aiService = { getOrgAiModel: vi.fn(), runJudge: vi.fn(runJudge) };
  const service = autoApprovalServiceFactory({
    approvalPolicyAutoApprovalDAL: {} as never,
    appConnectionDAL: {
      findById: async (id: string) => ({ id, orgId: "org-1", projectId: null, app: "jira", name: "Jira" }),
      find: vi.fn()
    } as never,
    appConnectionService: {} as never,
    aiService: aiService as never,
    kmsService: {} as never,
    gatewayV2Service: {} as never,
    gatewayPoolService: {} as never
  });

  const evaluate = (rules: TStoredAutoApproval["rules"]) =>
    service.evaluate({
      stored: { inputs: [], rules },
      parsedInputs: [],
      isRecordUsed: async () => false,
      orgId: "org-1",
      projectId: "project-1",
      ctx: { requester: { email: "dev@acme.com" } }
    });

  return { aiService, evaluate };
};

const conditionResult = (evidence: Awaited<ReturnType<ReturnType<typeof setup>["evaluate"]>>, id: string) =>
  evidence.rules.flatMap((rule) => rule.conditions).find((condition) => condition.id === id);

describe("autoApprovalService.evaluate AI conditions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("skips the AI when another condition in its rule failed", async () => {
    const { aiService, evaluate } = setup(async () => judge(true));

    const evidence = await evaluate([
      { id: "rule-1", name: "AI", conditions: [statusCondition("c-1", "Scheduled"), aiCondition("ai-1")] }
    ]);

    expect(aiService.runJudge).not.toHaveBeenCalled();
    expect(evidence.approvedByRuleId).toBeNull();
    expect(conditionResult(evidence, "ai-1")).toMatchObject({
      passed: false,
      reason: "Not reviewed because another condition in this rule didn't pass"
    });
  });

  test("skips the AI once an earlier rule approved", async () => {
    const { aiService, evaluate } = setup(async () => judge(true));

    const evidence = await evaluate([
      { id: "rule-1", name: "First AI", conditions: [aiCondition("ai-1")] },
      { id: "rule-2", name: "Second AI", conditions: [aiCondition("ai-2")] }
    ]);

    expect(aiService.runJudge).toHaveBeenCalledTimes(1);
    expect(evidence.approvedByRuleId).toBe("rule-1");
    expect(conditionResult(evidence, "ai-2")).toMatchObject({
      passed: false,
      reason: "Not reviewed because another rule approved the request"
    });
  });

  test("skips the AI when a rule without AI already passes", async () => {
    const { aiService, evaluate } = setup(async () => judge(true));

    const evidence = await evaluate([
      { id: "rule-1", name: "AI", conditions: [aiCondition("ai-1")] },
      { id: "rule-2", name: "Status", conditions: [statusCondition("c-1", "Approved")] }
    ]);

    expect(aiService.runJudge).not.toHaveBeenCalled();
    expect(evidence.approvedByRuleId).toBe("rule-2");
  });

  test("shares one deadline across rules", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { aiService, evaluate } = setup(async () => {
      now += 26_000;
      return judge(false);
    });

    const evidence = await evaluate([
      { id: "rule-1", name: "First AI", conditions: [aiCondition("ai-1")] },
      { id: "rule-2", name: "Second AI", conditions: [aiCondition("ai-2")] }
    ]);

    expect(aiService.runJudge).toHaveBeenCalledTimes(1);
    expect(aiService.runJudge.mock.calls[0][0].deadline).toBe(1_030_000);
    expect(evidence.approvedByRuleId).toBeNull();
    expect(conditionResult(evidence, "ai-2")).toMatchObject({
      passed: false,
      reason: "Not reviewed because the AI ran out of time on earlier rules"
    });
  });
});
