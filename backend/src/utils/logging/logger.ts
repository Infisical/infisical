import pino, { Logger } from "pino";
import { getAwsCloudWatchLog, getNodeEnv } from "../../config";

export let logger: Logger;

// https://github.com/pinojs/pino/blob/master/lib/levels.js#L13-L20
const logLevelToSeverityLookup: Record<string, string> = {
  "10": "TRACE",
  "20": "DEBUG",
  "30": "INFO",
  "40": "WARNING",
  "50": "ERROR",
  "60": "CRITICAL"
}

export const initLogger = async () => {
  const awsCloudWatchLogCfg = await getAwsCloudWatchLog();
  const nodeEnv = await getNodeEnv();
  const isProduction = nodeEnv === "production";
  const targets: pino.TransportMultiOptions["targets"][number][] = [
    isProduction
      ? { level: "info", target: "pino/file", options: {} }
      : {
        level: "info",
        target: "pino-pretty", // must be installed separately
        options: {
          colorize: true
        }
      }
  ];

  if (awsCloudWatchLogCfg) {
    targets.push({
      target: "@serdnam/pino-cloudwatch-transport",
      level: "info",
      options: {
        logGroupName: awsCloudWatchLogCfg.logGroupName,
        logStreamName: awsCloudWatchLogCfg.logGroupName,
        awsRegion: awsCloudWatchLogCfg.region,
        awsAccessKeyId: awsCloudWatchLogCfg.accessKeyId,
        awsSecretAccessKey: awsCloudWatchLogCfg.accessKeySecret,
        interval: awsCloudWatchLogCfg.interval
      }
    });
  }

  const transport = pino.transport({
    targets
  });

  logger = pino(
    {
      mixin(_context, level) {
        return { "severity": logLevelToSeverityLookup[level] || logLevelToSeverityLookup["30"] }
      },
      level: process.env.PINO_LOG_LEVEL || "info",
      formatters: {
        bindings: (bindings) => {
          return {
            pid: bindings.pid,
            hostname: bindings.hostname
            // node_version: process.version
          };
        }
      }
    },
    transport
  );
};
