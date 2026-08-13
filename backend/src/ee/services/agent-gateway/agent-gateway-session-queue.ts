import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { TAgentGatewaySessionServiceFactory } from "./agent-gateway-session-service";

type TAgentGatewaySessionQueueFactoryDep = {
  cronJob: TCronJobFactory;
  agentGatewaySessionService: Pick<TAgentGatewaySessionServiceFactory, "expireSessions">;
};

// Bounded so one tick cannot turn into an unbounded fan-out of provider calls. When the tick keeps coming
// back full, the drain rate is behind and that is the signal worth alerting on, not queue depth.
const EXPIRY_DISCOVERY_LIMIT = 200;

export const agentGatewaySessionQueueFactory = ({
  cronJob,
  agentGatewaySessionService
}: TAgentGatewaySessionQueueFactoryDep) => {
  const init = () => {
    cronJob.register({
      name: CronJobName.AgentGatewaySessionExpiry,
      pattern: "* * * * *",
      runHashTtlS: 5 * 60,
      handler: async () => {
        const expired = await agentGatewaySessionService.expireSessions({ limit: EXPIRY_DISCOVERY_LIMIT });
        if (expired === EXPIRY_DISCOVERY_LIMIT) {
          logger.warn(
            `agent gateway session expiry: discovery hit its cap of ${EXPIRY_DISCOVERY_LIMIT}, so the backlog is draining slower than it accumulates`
          );
        }
      }
    });
  };

  return { init };
};
