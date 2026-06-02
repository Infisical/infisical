import { RawAxiosRequestHeaders } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_BATCH_TIMEOUT, AUDIT_LOG_STREAM_TIMEOUT } from "../../audit-log/audit-log-queue";
import {
  TLogStreamFactoryBatchStreamLog,
  TLogStreamFactoryGetProviderBatchLimit,
  TLogStreamFactoryStreamLog,
  TLogStreamFactoryValidateCredentials
} from "../audit-log-stream-types";
import { TCriblProviderCredentials } from "./cribl-provider-types";

export const CriblProviderFactory = () => {
  const validateCredentials: TLogStreamFactoryValidateCredentials<TCriblProviderCredentials> = async ({
    credentials
  }) => {
    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    await request
      .post(url, JSON.stringify({ ping: "ok" }), {
        headers: streamHeaders,
        timeout: AUDIT_LOG_STREAM_TIMEOUT
      })
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with Cribl: ${(err as Error)?.message}` });
      });

    return credentials;
  };

  // Cribl HTTP source ingests newline-delimited JSON for batch payloads.
  const batchStreamLog: TLogStreamFactoryBatchStreamLog<TCriblProviderCredentials> = async ({
    credentials,
    auditLogs
  }) => {
    if (auditLogs.length === 0) return;

    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/x-ndjson",
      Authorization: `Bearer ${token}`
    };

    const body = auditLogs.map((auditLog) => JSON.stringify(auditLog)).join("\n");

    await request.post(url, body, {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_BATCH_TIMEOUT
    });
  };

  const streamLog: TLogStreamFactoryStreamLog<TCriblProviderCredentials> = async ({ credentials, auditLog }) => {
    const { url, token } = credentials;

    await blockLocalAndPrivateIpAddresses(url);

    const streamHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    await request.post(url, JSON.stringify(auditLog), {
      headers: streamHeaders,
      timeout: AUDIT_LOG_STREAM_TIMEOUT
    });
  };

  const getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit = () => ({
    maxLogs: 900,
    maxBytes: 4 * 1024 * 1024
  });

  return {
    validateCredentials,
    batchStreamLog,
    streamLog,
    getProviderBatchLimit
  };
};
