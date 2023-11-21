import pino, { Logger } from "pino";
import { getAwsCloudWatchLog, getNodeEnv } from "../../config";

export let logger: Logger;

export const initLogger = async () => {
  const awsCloudWatchLogCfg = await getAwsCloudWatchLog();
  const nodeEnv = await getNodeEnv();
  const isProduction = nodeEnv === "production";
  const targets: pino.TransportMultiOptions["targets"][number][] = [
    isProduction
      ? { level: "info", target: "pino/file", options: { destination: 'logs/infisical-backend/logs.txt', mkdir: true } }
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
