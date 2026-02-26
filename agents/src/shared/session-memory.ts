/**
 * Session Memory Service
 * 
 * Provides shared memory across agent invocations within a session.
 * This enables agents to:
 * 1. Detect cycles (repeated actions with same outcome)
 * 2. Track session status (active, escalated, pending_human_review, resolved)
 * 3. Share context across agent boundaries
 * 4. Prevent infinite loops by checking action history
 */

export type SessionStatus = 
  | 'active' 
  | 'escalated' 
  | 'pending_human_review' 
  | 'resolved' 
  | 'aborted';

export type ActionResult = 'success' | 'denied' | 'error' | 'pending';

export interface ActionRecord {
  id: string;
  agentId: string;
  action: string;
  parameters?: Record<string, unknown>;
  result: ActionResult;
  resultDetails?: string;
  timestamp: string;
}

export interface EscalationRecord {
  id: string;
  fromAgent: string;
  toAgent: string;
  reason: string;
  requestedAmount?: number;
  result: 'approved' | 'denied' | 'flagged_for_human' | 'pending';
  approvedAmount?: number;
  timestamp: string;
}

export interface SessionMemory {
  sessionId: string;
  ticketId: string;
  status: SessionStatus;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  
  actions: ActionRecord[];
  escalations: EscalationRecord[];
  
  metadata: Record<string, unknown>;
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycleType?: 'action_repeat' | 'escalation_loop' | 'denial_loop';
  details?: string;
  recommendation?: 'abort' | 'escalate' | 'complete_pending' | 'continue';
}

class SessionMemoryStore {
  private sessions: Map<string, SessionMemory> = new Map();

  getOrCreate(sessionId: string, ticketId: string): SessionMemory {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        ticketId,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        escalations: [],
        metadata: {},
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  get(sessionId: string): SessionMemory | undefined {
    return this.sessions.get(sessionId);
  }

  updateStatus(sessionId: string, status: SessionStatus, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.statusReason = reason;
      session.updatedAt = new Date().toISOString();
    }
  }

  recordAction(
    sessionId: string,
    agentId: string,
    action: string,
    result: ActionResult,
    parameters?: Record<string, unknown>,
    resultDetails?: string
  ): ActionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const record: ActionRecord = {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      action,
      parameters,
      result,
      resultDetails,
      timestamp: new Date().toISOString(),
    };

    session.actions.push(record);
    session.updatedAt = new Date().toISOString();
    return record;
  }

  recordEscalation(
    sessionId: string,
    fromAgent: string,
    toAgent: string,
    reason: string,
    requestedAmount?: number
  ): EscalationRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const record: EscalationRecord = {
      id: `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromAgent,
      toAgent,
      reason,
      requestedAmount,
      result: 'pending',
      timestamp: new Date().toISOString(),
    };

    session.escalations.push(record);
    session.status = 'escalated';
    session.updatedAt = new Date().toISOString();
    return record;
  }

  updateEscalation(
    sessionId: string,
    escalationId: string,
    result: EscalationRecord['result'],
    approvedAmount?: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const escalation = session.escalations.find(e => e.id === escalationId);
    if (escalation) {
      escalation.result = result;
      escalation.approvedAmount = approvedAmount;
      
      if (result === 'flagged_for_human') {
        session.status = 'pending_human_review';
        session.statusReason = 'Escalation flagged for human review';
      }
      
      session.updatedAt = new Date().toISOString();
    }
  }

  detectCycle(sessionId: string, agentId: string, proposedAction: string): CycleDetectionResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { hasCycle: false, recommendation: 'continue' };
    }

    // Check 1: Session already in terminal state
    if (session.status === 'pending_human_review') {
      return {
        hasCycle: true,
        cycleType: 'escalation_loop',
        details: `Session already pending human review: ${session.statusReason}`,
        recommendation: 'complete_pending',
      };
    }

    if (session.status === 'resolved' || session.status === 'aborted') {
      return {
        hasCycle: true,
        cycleType: 'action_repeat',
        details: `Session already ${session.status}`,
        recommendation: 'abort',
      };
    }

    // Check 2: Same action denied multiple times
    const sameActionDenials = session.actions.filter(
      a => a.agentId === agentId && 
           a.action === proposedAction && 
           a.result === 'denied'
    );

    if (sameActionDenials.length >= 2) {
      return {
        hasCycle: true,
        cycleType: 'denial_loop',
        details: `Action "${proposedAction}" has been denied ${sameActionDenials.length} times`,
        recommendation: 'escalate',
      };
    }

    // Check 3: Escalation loop (escalated same issue multiple times)
    const escalationsFromAgent = session.escalations.filter(
      e => e.fromAgent === agentId
    );

    if (escalationsFromAgent.length >= 2) {
      const flaggedEscalations = escalationsFromAgent.filter(
        e => e.result === 'flagged_for_human'
      );
      
      if (flaggedEscalations.length > 0) {
        return {
          hasCycle: true,
          cycleType: 'escalation_loop',
          details: `Already escalated and flagged for human review`,
          recommendation: 'complete_pending',
        };
      }

      return {
        hasCycle: true,
        cycleType: 'escalation_loop',
        details: `Multiple escalations detected (${escalationsFromAgent.length})`,
        recommendation: 'complete_pending',
      };
    }

    // Check 4: Action repeated too many times (regardless of result)
    const sameActionAttempts = session.actions.filter(
      a => a.agentId === agentId && a.action === proposedAction
    );

    if (sameActionAttempts.length >= 3) {
      return {
        hasCycle: true,
        cycleType: 'action_repeat',
        details: `Action "${proposedAction}" attempted ${sameActionAttempts.length} times`,
        recommendation: 'abort',
      };
    }

    return { hasCycle: false, recommendation: 'continue' };
  }

  getActionHistory(sessionId: string, agentId?: string): ActionRecord[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    if (agentId) {
      return session.actions.filter(a => a.agentId === agentId);
    }
    return session.actions;
  }

  getEscalationHistory(sessionId: string): EscalationRecord[] {
    const session = this.sessions.get(sessionId);
    return session?.escalations || [];
  }

  setMetadata(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata[key] = value;
      session.updatedAt = new Date().toISOString();
    }
  }

  getMetadata(sessionId: string, key: string): unknown {
    const session = this.sessions.get(sessionId);
    return session?.metadata[key];
  }

  getSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return 'Session not found';

    const actionSummary = session.actions
      .map(a => `${a.agentId}.${a.action}:${a.result}`)
      .join(' → ');

    const escalationSummary = session.escalations
      .map(e => `${e.fromAgent}→${e.toAgent}:${e.result}`)
      .join(' → ');

    return `Session ${sessionId} [${session.status}]
Actions: ${actionSummary || 'none'}
Escalations: ${escalationSummary || 'none'}`;
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    this.sessions.clear();
  }
}

// Singleton instance for shared memory across all agents
export const sessionMemory = new SessionMemoryStore();

// Helper functions for common operations
export function shouldAbortSession(sessionId: string): { abort: boolean; reason?: string } {
  const session = sessionMemory.get(sessionId);
  if (!session) {
    return { abort: false };
  }

  if (session.status === 'pending_human_review') {
    return { 
      abort: true, 
      reason: `Session is pending human review: ${session.statusReason}` 
    };
  }

  if (session.status === 'resolved') {
    return { abort: true, reason: 'Session already resolved' };
  }

  if (session.status === 'aborted') {
    return { abort: true, reason: `Session aborted: ${session.statusReason}` };
  }

  return { abort: false };
}

export function canAttemptAction(
  sessionId: string, 
  agentId: string, 
  action: string
): { allowed: boolean; reason?: string } {
  const cycleCheck = sessionMemory.detectCycle(sessionId, agentId, action);
  
  if (cycleCheck.hasCycle) {
    return { 
      allowed: false, 
      reason: cycleCheck.details 
    };
  }

  return { allowed: true };
}
