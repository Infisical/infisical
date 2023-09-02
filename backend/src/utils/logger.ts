/* eslint-disable no-console */
import { createLogger, format, transports } from "winston";
import LokiTransport from "winston-loki";
import { getLokiHost, getNodeEnv } from "../config";

const { combine, colorize, label, printf, splat, timestamp } = format;

const logFormat = (prefix: string) =>
  combine(
    timestamp(),
    splat(),
    label({ label: prefix }),
    printf((info) => `${info.timestamp} ${info.label} ${info.level}: ${info.message}`)
  );

const createLoggerWithLabel = async (level: string, label: string) => {
  const _level = level.toLowerCase() || "info";
  //* Always add Console output to transports
  const _transports: any[] = [
    new transports.Console({
      format: combine(
        colorize(),
        logFormat(label)
        // format.json()
      )
    })
  ];
  //* Add LokiTransport if it's enabled
  if ((await getLokiHost()) !== undefined) {
    _transports.push(
      new LokiTransport({
        host: await getLokiHost(),
        handleExceptions: true,
        handleRejections: true,
        batching: true,
        level: _level,
        timeout: 30000,
        format: format.combine(format.json()),
        labels: {
          app: process.env.npm_package_name,
          version: process.env.npm_package_version,
          environment: await getNodeEnv()
        },
        onConnectionError: (err: Error) =>
          console.error("Connection error while connecting to Loki Server.\n", err)
      })
    );
  }

  return createLogger({
    level: _level,
    transports: _transports,
    format: format.combine(
      logFormat(label),
      format.metadata({ fillExcept: ["message", "level", "timestamp", "label"] })
    )
  });
};

export const getLogger = async (loggerName: "backend-main" | "database") => {
  const logger = {
    "backend-main": await createLoggerWithLabel("info", "[IFSC:backend-main]"),
    database: await createLoggerWithLabel("info", "[IFSC:database]")
  };
  return logger[loggerName];
};
