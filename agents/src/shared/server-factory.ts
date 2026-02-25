import express, { Express } from 'express';
import { AgentCard, AGENT_CARD_PATH } from '@a2a-js/sdk';
import {
  AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';

export interface AgentServerConfig {
  agentCard: AgentCard;
  executor: AgentExecutor;
  port: number;
}

export function createAgentServer(config: AgentServerConfig): Express {
  const { agentCard, executor, port } = config;

  const requestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    executor
  );

  const app = express();

  app.use(express.json());

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  
  app.use('/a2a/jsonrpc', jsonRpcHandler({ 
    requestHandler, 
    userBuilder: UserBuilder.noAuthentication 
  }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', agent: agentCard.name, port });
  });

  return app;
}

export function startAgentServer(config: AgentServerConfig): Promise<void> {
  return new Promise((resolve) => {
    const app = createAgentServer(config);
    app.listen(config.port, () => {
      console.log(`🤖 ${config.agentCard.name} started on http://localhost:${config.port}`);
      console.log(`   Agent Card: http://localhost:${config.port}/${AGENT_CARD_PATH}`);
      console.log(`   JSON-RPC: http://localhost:${config.port}/a2a/jsonrpc`);
      resolve();
    });
  });
}
