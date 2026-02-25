import { SUPPORT_AGENT_CARD, AGENT_PORTS } from '../../shared/index.js';
import { startAgentServer } from '../../shared/server-factory.js';
import { SupportAgentExecutor } from './executor.js';

const executor = new SupportAgentExecutor();

startAgentServer({
  agentCard: SUPPORT_AGENT_CARD,
  executor,
  port: AGENT_PORTS.support,
});
