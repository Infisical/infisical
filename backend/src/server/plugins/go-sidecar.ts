import { ChildProcess, spawn } from "child_process";
import fp from "fastify-plugin";
import path from "path";

import { logger } from "@app/lib/logger";

type GoSidecarOpts = {
  enabled: boolean;
  binaryPath?: string;
  env?: Record<string, string>;
};

export const goSidecarPlugin = fp(async (server, opts: GoSidecarOpts) => {
  if (!opts.enabled) return;

  const binaryPath = opts.binaryPath || path.join(process.cwd(), "go-sidecar");
  const maxRestarts = 10;
  const baseDelayMs = 1000;
  const maxDelayMs = 30000;
  const healthyThresholdMs = 60000;

  let restartCount = 0;
  let sidecar: ChildProcess | null = null;
  let shuttingDown = false;
  let healthTimer: NodeJS.Timeout | null = null;

  const startSidecar = () => {
    if (shuttingDown) return;

    logger.info({ binaryPath }, "go-sidecar: Starting Go sidecar");

    sidecar = spawn(binaryPath, [], {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        ...opts.env,
        PORT: "4040", // Override PORT so Go doesn't conflict with Node.js
        HOST: "127.0.0.1"
      }
    });

    sidecar.on("error", (err) => {
      logger.error({ err }, "go-sidecar: Go sidecar failed to start");
    });

    sidecar.on("exit", (code, signal) => {
      if (healthTimer) {
        clearTimeout(healthTimer);
        healthTimer = null;
      }

      if (shuttingDown) {
        logger.info("go-sidecar: Go sidecar stopped during shutdown");
        return;
      }

      logger.error({ code, signal, restartCount }, "go-sidecar: Go sidecar exited unexpectedly");

      if (restartCount >= maxRestarts) {
        logger.error({ maxRestarts }, "go-sidecar: Go sidecar max restarts reached, giving up");
        return;
      }

      const delay = Math.min(baseDelayMs * 2 ** restartCount, maxDelayMs);
      restartCount += 1;

      logger.info({ delayMs: delay, restartCount }, "go-sidecar: Scheduling Go sidecar restart");
      setTimeout(startSidecar, delay);
    });

    // Reset restart count after healthy running period
    healthTimer = setTimeout(() => {
      if (sidecar && !sidecar.killed) {
        logger.info("go-sidecar: Go sidecar healthy, resetting restart count");
        restartCount = 0;
      }
    }, healthyThresholdMs);
  };

  startSidecar();

  server.addHook("onClose", () => {
    shuttingDown = true;
    if (healthTimer) {
      clearTimeout(healthTimer);
    }
    if (sidecar && !sidecar.killed) {
      logger.info("go-sidecar: Stopping Go sidecar");
      sidecar.kill();
    }
  });
});
