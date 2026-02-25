import { v4 as uuidv4 } from "uuid";
import {
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "@a2a-js/sdk";
import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from "@a2a-js/sdk/server";
import { Client, ClientFactory } from "@a2a-js/sdk/client";
import {
  AgentGate,
  ActionContext,
  PolicyEvaluationResult,
} from "../governance/index.js";
import { AGENT_PORTS } from "./types.js";

const AGENT_URLS: Record<string, string> = {
  triage_agent: `http://localhost:${AGENT_PORTS.triage}`,
  support_agent: `http://localhost:${AGENT_PORTS.support}`,
  fulfillment_agent: `http://localhost:${AGENT_PORTS.fulfillment}`,
  escalation_agent: `http://localhost:${AGENT_PORTS.escalation}`,
};

export interface AgentMessageResult {
  targetTaskId?: string;
  response?: Message | Task;
}

export interface GovernedExecutorConfig {
  agentId: string;
  agentName: string;
  declaredSkills: string[];
}

export abstract class BaseAgentExecutor implements AgentExecutor {
  protected agentId: string;
  protected agentName: string;
  protected gate: AgentGate;

  constructor(config: GovernedExecutorConfig) {
    this.agentId = config.agentId;
    this.agentName = config.agentName;

    this.gate = new AgentGate({
      agentId: config.agentId,
      declaredSkills: config.declaredSkills,
    });
  }

  /**
   * Register this agent with Infisical Agent Arbiter.
   * Called automatically by startAgentServer on startup.
   */
  async registerWithArbiter(): Promise<{ success: boolean; effectivePermissions: string[] }> {
    return this.gate.register();
  }

  abstract executeTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    userMessage: Message,
  ): Promise<void>;

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext;

    if (!task) {
      const initialTask: Task = {
        kind: "task",
        id: taskId,
        contextId: contextId,
        status: {
          state: "submitted",
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
      };
      eventBus.publish(initialTask);
    }

    this.publishStatus(eventBus, taskId, contextId, "working");

    try {
      await this.executeTask(requestContext, eventBus, userMessage);
      this.publishStatus(eventBus, taskId, contextId, "completed", true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.publishStatus(
        eventBus,
        taskId,
        contextId,
        "failed",
        true,
        errorMessage,
      );
    }

    eventBus.finished();
  }

  async cancelTask(
    taskId: string,
    _eventBus: ExecutionEventBus,
  ): Promise<void> {
    console.log(`[${this.agentName}] Task ${taskId} cancelled`);
  }

  /**
   * Execute a skill with governance check.
   *
   * Flow:
   * 1. Ask Infisical for permission
   * 2. If denied, return immediately
   * 3. If allowed, report "started" to Infisical
   * 4. Execute the skill
   * 5. Report "completed" or "failed" to Infisical
   */
  protected async governedSkillExecution<T>(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
    executor: () => Promise<T>,
  ): Promise<
    | { allowed: true; result: T; governance: PolicyEvaluationResult }
    | { allowed: false; governance: PolicyEvaluationResult }
  > {
    const { result: governance, handle } = await this.gate.canExecuteSkill(
      skillId,
      parameters,
      context,
    );

    if (!governance.allowed || !handle) {
      this.publishArtifact(
        eventBus,
        taskId,
        contextId,
        `${skillId}_denied`,
        `${skillId}_policy_denial.json`,
        {
          skillId,
          status: "denied",
          policyType: governance.policyType,
          policyId: governance.policyId,
          reasoning: governance.reasoning,
          llmEvaluation: governance.llmEvaluation,
          parameters,
          context,
        },
      );

      return { allowed: false, governance };
    }

    try {
      const result = await executor();

      await handle.complete(result as Record<string, unknown>);

      this.publishArtifact(
        eventBus,
        taskId,
        contextId,
        `${skillId}_result`,
        `${skillId}_result.json`,
        {
          skillId,
          status: "executed",
          executionId: handle.executionId,
          policyType: governance.policyType,
          policyId: governance.policyId,
          reasoning: governance.reasoning,
          result: result as Record<string, unknown>,
        },
      );

      return { allowed: true, result, governance };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await handle.fail(errorMessage);

      this.publishArtifact(
        eventBus,
        taskId,
        contextId,
        `${skillId}_failed`,
        `${skillId}_execution_failed.json`,
        {
          skillId,
          status: "failed",
          executionId: handle.executionId,
          error: errorMessage,
        },
      );

      throw error;
    }
  }

  /**
   * Send a message to another agent with governance check.
   *
   * The TARGET agent's inboundPolicies are checked to see if this agent is allowed.
   * If allowed, actually forwards the message to the target agent via HTTP.
   */
  protected async governedAgentMessage(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    targetAgentId: string,
    messageType: string,
    content: Record<string, unknown>,
    context: ActionContext,
  ): Promise<
    | { allowed: true; governance: PolicyEvaluationResult; result: AgentMessageResult }
    | { allowed: false; governance: PolicyEvaluationResult }
  > {
    const { result: governance, handle } = await this.gate.canMessageAgent(
      targetAgentId,
      messageType,
      content,
      context,
    );

    if (!governance.allowed || !handle) {
      this.publishArtifact(
        eventBus,
        taskId,
        contextId,
        `comm_${targetAgentId}_denied`,
        "communication_denial.json",
        {
          communicationType: "agent_message",
          fromAgent: this.agentId,
          toAgent: targetAgentId,
          messageType,
          status: "denied",
          policyType: governance.policyType,
          policyId: governance.policyId,
          reasoning: governance.reasoning,
        },
      );

      return { allowed: false, governance };
    }

    this.log(`FORWARDING to ${targetAgentId}`, { messageType });

    let agentResponse: AgentMessageResult = {};

    try {
      const targetUrl = AGENT_URLS[targetAgentId];
      if (!targetUrl) {
        throw new Error(`Unknown agent: ${targetAgentId}`);
      }

      const factory = new ClientFactory();
      const client: Client = await factory.createFromUrl(targetUrl);

      const response = await client.sendMessage({
        message: {
          kind: "message",
          messageId: uuidv4(),
          role: "user",
          parts: [
            {
              kind: "data",
              data: {
                ...content,
                _sourceAgent: this.agentId,
                _messageType: messageType,
              },
            },
          ],
        },
      });

      if (response.kind === "task") {
        let task = response;
        this.log(`${targetAgentId} created task`, { taskId: task.id, status: task.status.state });

        // Poll until task reaches terminal state
        const terminalStates = ["completed", "failed", "canceled"];
        const maxPolls = 60; // Max 60 seconds
        let polls = 0;

        while (!terminalStates.includes(task.status.state) && polls < maxPolls) {
          await this.simulateDelay(1000); // Wait 1 second between polls
          polls++;
          
          try {
            task = await client.getTask({ id: task.id });
            this.log(`Polling ${targetAgentId} task`, { 
              taskId: task.id, 
              status: task.status.state,
              poll: polls 
            });
          } catch (pollError) {
            this.log(`Error polling ${targetAgentId} task`, { error: String(pollError) });
            break;
          }
        }

        agentResponse = {
          targetTaskId: task.id,
          response: task,
        };

        this.log(`${targetAgentId} task finished`, { 
          taskId: task.id, 
          status: task.status.state,
          hasHistory: !!task.history?.length,
          hasArtifacts: !!task.artifacts?.length,
        });
      } else {
        agentResponse = { response };
        this.log(`${targetAgentId} responded with message`, { messageId: response.messageId });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log(`ERROR forwarding to ${targetAgentId}`, { error: errorMessage });
      
      await handle.fail(errorMessage);

      this.publishArtifact(
        eventBus,
        taskId,
        contextId,
        `comm_${targetAgentId}_failed`,
        "communication_failed.json",
        {
          communicationType: "agent_message",
          fromAgent: this.agentId,
          toAgent: targetAgentId,
          messageType,
          status: "failed",
          error: errorMessage,
        },
      );

      throw error;
    }

    this.publishArtifact(
      eventBus,
      taskId,
      contextId,
      `comm_${targetAgentId}`,
      "communication.json",
      {
        communicationType: "agent_message",
        fromAgent: this.agentId,
        toAgent: targetAgentId,
        messageType,
        status: "forwarded",
        executionId: handle.executionId,
        content,
        targetTaskId: agentResponse.targetTaskId,
      },
    );

    await handle.complete({ 
      messageType, 
      targetAgentId, 
      content,
      targetTaskId: agentResponse.targetTaskId,
    });

    return { allowed: true, governance, result: agentResponse };
  }

  protected publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: "working" | "completed" | "failed" | "canceled",
    isFinal: boolean = false,
    message?: string,
  ): void {
    const statusUpdate: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state,
        timestamp: new Date().toISOString(),
        message: message
          ? {
              kind: "message",
              messageId: uuidv4(),
              role: "agent",
              parts: [{ kind: "text", text: message }],
            }
          : undefined,
      },
      final: isFinal,
    };
    eventBus.publish(statusUpdate);
  }

  protected publishArtifact(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    artifactId: string,
    name: string,
    data: Record<string, unknown>,
  ): void {
    const artifactUpdate: TaskArtifactUpdateEvent = {
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: {
        artifactId,
        name,
        parts: [{ kind: "data", data }],
      },
    };
    eventBus.publish(artifactUpdate);
  }

  protected publishMessage(eventBus: ExecutionEventBus, text: string): void {
    const message: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [{ kind: "text", text }],
    };
    eventBus.publish(message);
  }

  protected log(action: string, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [${this.agentName}] ${action}`,
      details ? JSON.stringify(details) : "",
    );
  }

  protected simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
