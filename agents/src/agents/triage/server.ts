import { TRIAGE_AGENT_CARD, AGENT_PORTS } from '../../shared/index.js';
import { startAgentServer } from '../../shared/server-factory.js';
import { TriageAgentExecutor } from './executor.js';

const executor = new TriageAgentExecutor();

startAgentServer({
  agentCard: TRIAGE_AGENT_CARD,
  executor,
  port: AGENT_PORTS.triage,
});
