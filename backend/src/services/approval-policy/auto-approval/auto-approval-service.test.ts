import { ActorType } from "@app/services/auth/auth-type";
import { TAiJudgeResult } from "@app/services/ai/ai-types";

import { autoApprovalServiceFactory } from "./auto-approval-service";
import {
  AUTO_APPROVAL_AI_CONSTRAINT,
  AUTO_APPROVAL_AI_SUBJECT,
  AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT,
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
    gatewayPoolService: {} as never,
    membershipDAL: {} as never,
    userDAL: {} as never,
    groupDAL: {} as never,
    userGroupMembershipDAL: {} as never
  });

  const evaluate = (rules: TStoredAutoApproval["rules"]) =>
    service.evaluate({
      stored: { inputs: [], rules },
      parsedInputs: [],
      isRecordUsed: async () => false,
      orgId: "org-1",
      projectId: "project-1",
      requesterId: "user-1",
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

describe("autoApprovalService requester checks", () => {
  const alice = "6f2f0c1e-6a0e-4c1e-9a43-3f1b6d1f2a01";
  const bob = "6f2f0c1e-6a0e-4c1e-9a43-3f1b6d1f2a02";
  const carol = "6f2f0c1e-6a0e-4c1e-9a43-3f1b6d1f2a03";
  const engineering = "0b7d3f6e-1c2a-4e5b-8d9f-1a2b3c4d5e01";
  const operations = "0b7d3f6e-1c2a-4e5b-8d9f-1a2b3c4d5e02";

  const requesterCheck = (id: string, constraint: string, values: string[]): TCondition => ({
    id,
    inputId: null,
    connectionId: null,
    subject: AUTO_APPROVAL_REQUESTER_SUBJECT,
    constraint,
    values,
    prompt: null,
    contextConnectionIds: []
  });

  const setupRequesterChecks = ({
    requesterGroupIds = [] as string[],
    projectGroupIds = [engineering, operations],
    // alice is a direct project member and bob is one through a group
    directProjectUserIds = [alice],
    groupProjectUserIds = [bob]
  } = {}) => {
    const service = autoApprovalServiceFactory({
      approvalPolicyAutoApprovalDAL: {} as never,
      appConnectionDAL: {} as never,
      appConnectionService: {} as never,
      aiService: { getOrgAiModel: vi.fn(), runJudge: vi.fn() } as never,
      kmsService: {} as never,
      gatewayV2Service: {} as never,
      gatewayPoolService: {} as never,
      membershipDAL: {
        find: async ({ $in }: { $in: { actorUserId?: string[]; actorGroupId?: string[] } }) => [
          ...($in.actorUserId ?? [])
            .filter((id) => directProjectUserIds.includes(id))
            .map((actorUserId) => ({ actorUserId })),
          ...($in.actorGroupId ?? [])
            .filter((id) => projectGroupIds.includes(id))
            .map((actorGroupId) => ({ actorGroupId }))
        ]
      } as never,
      userDAL: {
        find: async () => [
          { id: alice, firstName: "Alice", lastName: "Smith", email: "alice@acme.com", username: "alice" },
          { id: bob, firstName: null, lastName: null, email: "bob@acme.com", username: "bob" }
        ]
      } as never,
      groupDAL: {
        find: async () => [
          { id: engineering, name: "Engineering" },
          { id: operations, name: "Operations" }
        ]
      } as never,
      userGroupMembershipDAL: {
        find: async ({ $in }: { $in: { groupId: string[] } }) =>
          $in.groupId.filter((id) => requesterGroupIds.includes(id)).map((groupId) => ({ groupId })),
        findUserGroupMembershipsInProjectByUserIds: async (userIds: string[]) =>
          userIds.filter((id) => groupProjectUserIds.includes(id))
      } as never
    });

    const evaluate = (requesterId: string, conditions: TCondition[]) =>
      service.evaluate({
        stored: { inputs: [], rules: [{ id: "rule-1", name: "Direct access", conditions }] },
        parsedInputs: [],
        isRecordUsed: async () => false,
        orgId: "org-1",
        projectId: "project-1",
        requesterId,
        ctx: { requester: { email: "dev@acme.com" } }
      });

    const validate = (conditions: { constraint: string; values: string[] }[]) =>
      service.validateConfig({
        projectId: "project-1",
        actor: { id: "admin-1", type: ActorType.USER, orgId: "org-1" } as never,
        config: {
          inputs: [],
          rules: [
            {
              name: "Direct access",
              conditions: conditions.map((condition) => ({
                subject: AUTO_APPROVAL_REQUESTER_SUBJECT,
                ...condition
              }))
            }
          ]
        }
      });

    return { evaluate, validate };
  };

  test("approves a user the rule names and describes them by name", async () => {
    const { evaluate } = setupRequesterChecks();
    const check = requesterCheck("c-1", AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT, [alice, bob]);

    const approved = await evaluate(alice, [check]);
    expect(approved.approvedByRuleId).toBe("rule-1");
    expect(conditionResult(approved, "c-1")).toMatchObject({
      passed: true,
      description: "Requester is Alice Smith or bob@acme.com"
    });

    const refused = await evaluate(carol, [check]);
    expect(refused.approvedByRuleId).toBeNull();
    expect(conditionResult(refused, "c-1")).toMatchObject({
      passed: false,
      reason: "The requester isn't Alice Smith or bob@acme.com"
    });
  });

  test("approves a member of a group the rule names while the group is a member of the project", async () => {
    const check = requesterCheck("c-1", AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT, [engineering, operations]);

    const approved = await setupRequesterChecks({ requesterGroupIds: [operations] }).evaluate(carol, [check]);
    expect(approved.approvedByRuleId).toBe("rule-1");
    expect(conditionResult(approved, "c-1")).toMatchObject({
      description: "Requester is a member of Engineering or Operations"
    });

    const removed = await setupRequesterChecks({
      requesterGroupIds: [operations],
      projectGroupIds: [engineering]
    }).evaluate(carol, [check]);
    expect(removed.approvedByRuleId).toBeNull();
    expect(conditionResult(removed, "c-1")).toMatchObject({
      passed: false,
      reason: "The requester isn't a member of Engineering or Operations"
    });
  });

  test("saves checks without a connection, and refuses values that aren't the project's users or groups", async () => {
    const { validate } = setupRequesterChecks();

    const config = await validate([
      { constraint: AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT, values: [alice, ` ${alice}`, bob] },
      { constraint: AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT, values: [engineering] }
    ]);
    expect(config.rules[0].conditions).toMatchObject([
      { connectionId: null, constraint: AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT, values: [alice, bob] },
      { connectionId: null, constraint: AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT, values: [engineering] }
    ]);

    await expect(validate([{ constraint: AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT, values: ["alice"] }])).rejects.toThrow(
      "'Requester is' takes user IDs, and 'alice' isn't one"
    );
    await expect(validate([{ constraint: AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT, values: [carol] }])).rejects.toThrow(
      `checks for user '${carol}', who isn't a member of the policy's project`
    );
    await expect(
      validate([{ constraint: AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT, values: ["0b7d3f6e-1c2a-4e5b-8d9f-1a2b3c4d5e09"] }])
    ).rejects.toThrow("which isn't a member of the policy's project");
    await expect(validate([{ constraint: "on-call", values: [alice] }])).rejects.toThrow(
      "which is not a check on the requester's Infisical user or groups"
    );
  });
});
