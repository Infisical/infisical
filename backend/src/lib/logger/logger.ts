/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// logger follows a singleton pattern
// easier to use it that's all.
import pino, { Logger } from "pino";
import { z } from "zod";

const logLevelToSeverityLookup: Record<string, string> = {
  "10": "TRACE",
  "20": "DEBUG",
  "30": "INFO",
  "40": "WARNING",
  "50": "ERROR",
  "60": "CRITICAL"
};

// eslint-disable-next-line import/no-mutable-exports
export let logger: Readonly<Logger>;
// akhilmhdh:
// The logger is not placed in the main app config to avoid a circular dependency.
// The config requires the logger to display errors when an invalid environment is supplied.
// On the other hand, the logger needs the config to obtain credentials for AWS or other transports.
// By keeping the logger separate, it becomes an independent package.

const loggerConfig = z.object({
  AWS_CLOUDWATCH_LOG_GROUP_NAME: z.string().default("infisical-log-stream"),
  AWS_CLOUDWATCH_LOG_REGION: z.string().default("us-east-1"),
  AWS_CLOUDWATCH_LOG_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_CLOUDWATCH_LOG_ACCESS_KEY_SECRET: z.string().min(1).optional(),
  AWS_CLOUDWATCH_LOG_INTERVAL: z.coerce.number().default(1000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("production")
});

const redactedKeys = [
  "accessToken",
  "authToken",
  "serviceToken",
  "identityAccessToken",
  "token",
  "privateKey",
  "serverPrivateKey",
  "plainPrivateKey",
  "plainProjectKey",
  "encryptedPrivateKey",
  "userPrivateKey",
  "protectedKey",
  "decryptKey",
  "encryptedProjectKey",
  "encryptedSymmetricKey",
  "encryptedPrivateKey",
  "backupPrivateKey",
  "secretKey",
  "SecretKey",
  "botPrivateKey",
  "encryptedKey",
  "plaintextProjectKey",
  "accessKey",
  "botKey",
  "decryptedSecret",
  "secrets",
  "key",
  "password",
  "config"
];

export const initLogger = async () => {
  const cfg = loggerConfig.parse(process.env);
  const targets: pino.TransportMultiOptions["targets"][number][] = [
    {
      level: "info",
      target: "pino/file",
      options: {
        destination: 1,
        mkdir: true
      }
    }
  ];

  if (cfg.AWS_CLOUDWATCH_LOG_ACCESS_KEY_ID && cfg.AWS_CLOUDWATCH_LOG_ACCESS_KEY_SECRET) {
    targets.push({
      target: "@serdnam/pino-cloudwatch-transport",
      level: "info",
      options: {
        logGroupName: cfg.AWS_CLOUDWATCH_LOG_GROUP_NAME,
        logStreamName: cfg.AWS_CLOUDWATCH_LOG_GROUP_NAME,
        awsRegion: cfg.AWS_CLOUDWATCH_LOG_REGION,
        awsAccessKeyId: cfg.AWS_CLOUDWATCH_LOG_ACCESS_KEY_ID,
        awsSecretAccessKey: cfg.AWS_CLOUDWATCH_LOG_ACCESS_KEY_SECRET,
        interval: cfg.AWS_CLOUDWATCH_LOG_INTERVAL
      }
    });
  }

  const transport = pino.transport({
    targets
  });

  logger = pino(
    {
      mixin(_context, level) {
        return { severity: logLevelToSeverityLookup[level] || logLevelToSeverityLookup["30"] };
      },
      level: process.env.PINO_LOG_LEVEL || "info",
      formatters: {
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname
          // node_version: process.version
        })
      },
      // redact until depth of three
      redact: [...redactedKeys, ...redactedKeys.map((key) => `*.${key}`), ...redactedKeys.map((key) => `*.*.${key}`)]
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    transport
  );
  return logger;
};
