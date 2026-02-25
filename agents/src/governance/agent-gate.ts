import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import {
  PolicyEvaluationResult,
  ActionContext,
  GovernanceAuditLog,
  ActionStartedEvent,
  ActionCompletedEvent,
} from "./types.js";
import {
  InfisicalAgentGateClient,
  InfisicalAgentGateConfig,
} from "./infisical-client.js";

export interface AgentGateOptions {
  agentId: string;
  declaredSkills: string[];
  infisicalConfig?: InfisicalAgentGateConfig;
}

export interface ExecutionHandle {
  executionId: string;
  startTime: number;
  complete: (result?: Record<string, unknown>) => Promise<void>;
  fail: (error: string) => Promise<void>;
}

/**
 * AgentGate - The governance client for agent actions (connects to Infisical Agent Arbiter).
 *
 * This is a thin client that asks Infisical for permission before every action.
 * ALL policy evaluation happens in Infisical - this client just:
 * 1. Sends the request to Infisical
 * 2. Gets back allowed: true/false
 * 3. Reports execution start/complete back to Infisical for monitoring
 *
 * The agent has NO knowledge of policies - it just asks and waits for the answer.
 */
export class AgentGate {
  private agentId: string;
  private declaredSkills: string[];
  private client: InfisicalAgentGateClient;
  private auditLog: GovernanceAuditLog[] = [];

  constructor(options: AgentGateOptions) {
    this.agentId = options.agentId;
    this.declaredSkills = options.declaredSkills;

    this.client = new InfisicalAgentGateClient(
      options.infisicalConfig || {
        baseUrl: process.env.INFISICAL_BASE_URL || "http://localhost:8080",
        machineIdentityToken:
          process.env.INFISICAL_MACHINE_IDENTITY_TOKEN || "",
        projectId: process.env.INFISICAL_PROJECT_ID || "",
      },
    );
  }

  /**
   * Initialize and register the agent with Agent Arbiter.
   * Call this when the agent starts up.
   */
  async register(): Promise<{
    success: boolean;
    effectivePermissions: string[];
  }> {
    const result = await this.client.registerAgent(
      this.agentId,
      this.declaredSkills,
    );
    console.log(`[AgentArbiter] ${this.agentId} registered:`, result);
    return result;
  }

  /**
   * Check if this agent can execute a skill (self-governance).
   *
   * Sends the skill + context to Infisical, waits for allowed: true/false.
   * Agent doesn't know WHY - it just knows if it can proceed or not.
   *
   * Returns an ExecutionHandle if allowed, which must be used to report completion.
   */
  async canExecuteSkill(
    skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
  ): Promise<{ result: PolicyEvaluationResult; handle?: ExecutionHandle }> {
    const startTime = Date.now();

    const result = await this.client.checkSkillPermission(
      this.agentId,
      skillId,
      parameters,
      context,
    );

    this.logAction("skill", skillId, undefined, result, context);

    const elapsed = Date.now() - startTime;
    console.log(
      `[AgentArbiter] ${this.agentId}.${skillId} → ${result.allowed ? "✅ ALLOWED" : "❌ DENIED"} (${elapsed}ms)`,
    );
    if (!result.allowed) {
      console.log(`[AgentArbiter]   ↳ ${result.reasoning}`);
      return { result };
    }

    const executionId = uuidv4();
    const handle = this.createExecutionHandle(
      executionId,
      "skill",
      skillId,
      this.agentId,
      parameters,
      context,
    );

    return { result, handle };
  }

  /**
   * Check if this agent can message/request something from another agent.
   *
   * The TARGET agent's inboundPolicies are checked to see if this agent is allowed.
   *
   * Returns an ExecutionHandle if allowed, which must be used to report completion.
   */
  async canMessageAgent(
    targetAgentId: string,
    messageType: string,
    content: Record<string, unknown>,
    context: ActionContext,
  ): Promise<{ result: PolicyEvaluationResult; handle?: ExecutionHandle }> {
    const startTime = Date.now();

    const result = await this.client.checkCommunicationPermission(
      this.agentId,
      targetAgentId,
      messageType,
      content,
      context,
    );

    this.logAction(
      "communication",
      messageType,
      targetAgentId,
      result,
      context,
    );

    const elapsed = Date.now() - startTime;
    console.log(
      `[AgentArbiter] ${this.agentId} → ${targetAgentId} → ${result.allowed ? "✅ ALLOWED" : "❌ DENIED"} (${elapsed}ms)`,
    );
    if (!result.allowed) {
      console.log(`[AgentArbiter]   ↳ ${result.reasoning}`);
      return { result };
    }

    const executionId = uuidv4();
    const handle = this.createExecutionHandle(
      executionId,
      "communication",
      messageType,
      targetAgentId,
      content,
      context,
    );

    return { result, handle };
  }

  private createExecutionHandle(
    executionId: string,
    actionType: "skill" | "communication",
    action: string,
    targetAgentId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
  ): ExecutionHandle {
    const startTime = Date.now();
    const sessionId = context.sessionId; // Extract sessionId for all events

    const startEvent: ActionStartedEvent = {
      executionId,
      sessionId, // Include sessionId for unified audit trail
      requestingAgentId: this.agentId,
      targetAgentId,
      actionType,
      action,
      parameters,
      context,
      startedAt: new Date().toISOString(),
    };
    this.client.reportActionStarted(startEvent);

    return {
      executionId,
      startTime,
      complete: async (result?: Record<string, unknown>) => {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;

        const completeEvent: ActionCompletedEvent = {
          executionId,
          sessionId, // Include sessionId for unified audit trail
          requestingAgentId: this.agentId,
          targetAgentId,
          action,
          status: "completed",
          completedAt,
          durationMs,
          result,
        };
        await this.client.reportActionCompleted(completeEvent);
      },
      fail: async (error: string) => {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;

        const completeEvent: ActionCompletedEvent = {
          executionId,
          sessionId, // Include sessionId for unified audit trail
          requestingAgentId: this.agentId,
          targetAgentId,
          action,
          status: "failed",
          completedAt,
          durationMs,
          error,
        };
        await this.client.reportActionCompleted(completeEvent);
      },
    };
  }

  getAuditLog(): GovernanceAuditLog[] {
    return [...this.auditLog];
  }

  async queryAuditLogs(options?: {
    sessionId?: string; // Filter by sessionId to see all events in a workflow
    agentId?: string;
    action?: string;
    result?: "allowed" | "denied";
    limit?: number;
  }): Promise<GovernanceAuditLog[]> {
    return this.client.queryAuditLogs(options);
  }

  private logAction(
    actionType: "skill" | "communication",
    action: string,
    targetAgent: string | undefined,
    result: PolicyEvaluationResult,
    context: ActionContext,
  ): void {
    const log: GovernanceAuditLog = {
      id: uuidv4(),
      sessionId: context.sessionId, // Include sessionId for unified audit trail
      timestamp: new Date().toISOString(),
      requestingAgentId: this.agentId,
      targetAgentId: targetAgent || this.agentId,
      actionType,
      action,
      result: result.allowed ? "allowed" : "denied",
      policyEvaluations: [result],
      context,
    };

    this.auditLog.push(log);
  }
}
