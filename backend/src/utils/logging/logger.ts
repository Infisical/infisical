import pino from "pino";

export const logger = pino({
  level: process.env.PINO_LOG_LEVEL || "trace",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    bindings: (bindings) => {
        return {
            pid: bindings.pid,
            hostname: bindings.hostname
            // node_version: process.version
        };
    },
  }
});