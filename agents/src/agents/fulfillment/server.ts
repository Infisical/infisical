import { FULFILLMENT_AGENT_CARD, AGENT_PORTS } from '../../shared/index.js';
import { startAgentServer } from '../../shared/server-factory.js';
import { FulfillmentAgentExecutor } from './executor.js';

const executor = new FulfillmentAgentExecutor();

startAgentServer({
  agentCard: FULFILLMENT_AGENT_CARD,
  executor,
  port: AGENT_PORTS.fulfillment,
});
