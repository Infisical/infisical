import { ESCALATION_AGENT_CARD, AGENT_PORTS } from '../../shared/index.js';
import { startAgentServer } from '../../shared/server-factory.js';
import { EscalationAgentExecutor } from './executor.js';

const executor = new EscalationAgentExecutor();

startAgentServer({
  agentCard: ESCALATION_AGENT_CARD,
  executor,
  port: AGENT_PORTS.escalation,
});
