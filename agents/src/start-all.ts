import { 
  TRIAGE_AGENT_CARD,
  SUPPORT_AGENT_CARD,
  FULFILLMENT_AGENT_CARD,
  ESCALATION_AGENT_CARD,
  AGENT_PORTS,
} from './shared/index.js';
import { startAgentServer } from './shared/server-factory.js';
import { TriageAgentExecutor } from './agents/triage/executor.js';
import { SupportAgentExecutor } from './agents/support/executor.js';
import { FulfillmentAgentExecutor } from './agents/fulfillment/executor.js';
import { EscalationAgentExecutor } from './agents/escalation/executor.js';

async function startAllAgents(): Promise<void> {
  console.log('🚀 Starting AgentGate Demo - Customer Support Agent Organization\n');
  console.log('═'.repeat(60));

  await startAgentServer({
    agentCard: TRIAGE_AGENT_CARD,
    executor: new TriageAgentExecutor(),
    port: AGENT_PORTS.triage,
  });

  await startAgentServer({
    agentCard: SUPPORT_AGENT_CARD,
    executor: new SupportAgentExecutor(),
    port: AGENT_PORTS.support,
  });

  await startAgentServer({
    agentCard: FULFILLMENT_AGENT_CARD,
    executor: new FulfillmentAgentExecutor(),
    port: AGENT_PORTS.fulfillment,
  });

  await startAgentServer({
    agentCard: ESCALATION_AGENT_CARD,
    executor: new EscalationAgentExecutor(),
    port: AGENT_PORTS.escalation,
  });

  console.log('\n' + '═'.repeat(60));
  console.log('✅ All agents started successfully!\n');
  console.log('Agent Organization:');
  console.log('  • Triage Agent     → Port 4001 (classifies & routes tickets)');
  console.log('  • Support Agent    → Port 4002 (frontline support worker)');
  console.log('  • Fulfillment Agent → Port 4003 (warehouse operations)');
  console.log('  • Escalation Agent → Port 4004 (senior authority)');
  console.log('\nRun `npm run demo` to execute the demo scenario.');
  console.log('═'.repeat(60) + '\n');
}

startAllAgents().catch(console.error);
