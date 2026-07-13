import { RawAxiosRequestHeaders } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import {
  TLogStreamFactoryBatchStreamLog,
  TLogStreamFactoryGetProviderBatchLimit,
  TLogStreamFactoryValidateCredentials
} from "../audit-log-stream-types";
import { TSumoLogicProviderCredentials } from "./sumo-logic-provider-types";

const buildStreamHeaders = (
  credentials: TSumoLogicProviderCredentials,
  contentType: string
): RawAxiosRequestHeaders => {
  return {
    "Content-Type": contentType,
    "x-sumo-token": credentials.token
  };
};

export const SumoLogicProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TSumoLogicProviderCredentials> = async ({
    credentials
  }) => {
    const { url } = credentials;

    await safeRequest
      .post(url, JSON.stringify({ ping: "ok" }), {
        headers: buildStreamHeaders(credentials, "application/json"),
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
      })
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Sumo Logic: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  const batchStreamLog: TLogStreamFactoryBatchStreamLog<TSumoLogicProviderCredentials> = async ({
    credentials,
    auditLogs
  }) => {
    if (auditLogs.length === 0) return;

    const { url } = credentials;

    const body = auditLogs.map((auditLog) => JSON.stringify(auditLog)).join("\n");

    await safeRequest.post(url, body, {
      headers: buildStreamHeaders(credentials, "application/x-ndjson"),
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT,
      allowPrivateIps: getConfig().AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP
    });
  };

  const getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit = () => ({
    maxLogs: 900,
    maxBytes: 700 * 1024
  });

  return {
    validateCredentials,
    batchStreamLog,
    getProviderBatchLimit
  };
};
