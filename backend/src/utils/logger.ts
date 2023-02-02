/* eslint-disable no-console */
import { createLogger, format, transports } from 'winston';
import LokiTransport from 'winston-loki';
import { LOKI_HOST, NODE_ENV } from '../config';

const { combine, colorize, label, printf, splat, timestamp } = format;

const logFormat = (prefix: string) => combine(
  timestamp(),
  splat(),
  label({ label: prefix }),
  printf((info) => `${info.timestamp} ${info.label} ${info.level}: ${info.message}`)
);

const createLoggerWithLabel = (level: string, label: string) => {
  const _level = level.toLowerCase() || 'info'
  //* Always add Console output to transports
  const _transports: any[] = [
    new transports.Console({
      format: combine(
        colorize(),
        logFormat(label),
        // format.json()
      )
    })
  ]
  //* Add LokiTransport if it's enabled
  if(LOKI_HOST !== undefined){
    _transports.push(
      new LokiTransport({
        host: LOKI_HOST,
        handleExceptions: true,
        handleRejections: true,
        batching: true,
        level: _level,
        timeout: 30000,
        format: format.combine(
          format.json()
        ),
        labels: {app: process.env.npm_package_name, version: process.env.npm_package_version, environment: NODE_ENV},
        onConnectionError: (err: Error)=> console.error('Connection error while connecting to Loki Server.\n', err)
      })
    )
  }
  
  
  return createLogger({
    level: _level,
    transports: _transports,
    format: format.combine(
      logFormat(label),
      format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
    )
  });
}

const DEFAULT_LOGGERS = {
  "backend-main": createLoggerWithLabel('info', '[IFSC:backend-main]'),
  "database": createLoggerWithLabel('info', '[IFSC:database]'),
}
type LoggerNames = keyof typeof DEFAULT_LOGGERS

export const getLogger = (loggerName: LoggerNames) => {
  return DEFAULT_LOGGERS[loggerName]
} 
