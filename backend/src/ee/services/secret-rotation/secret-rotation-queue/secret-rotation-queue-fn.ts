/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-param-reassign */
import axios from "axios";
import jmespath from "jmespath";
import knex from "knex";

import { getConfig } from "@app/lib/config/env";
import { getDbConnectionHost } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TAssignOp, TDbProviderClients, TDirectAssignOp, THttpProviderFunction } from "../templates/types";
import { TSecretRotationData, TSecretRotationDbFn } from "./secret-rotation-queue-types";

const REGEX = /\${([^}]+)}/g;
const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

export const interpolate = (data: any, getValue: (key: string) => unknown) => {
  if (!data) return;

  if (typeof data === "number") return data;

  if (typeof data === "string") {
    return data.replace(REGEX, (_a, b) => getValue(b) as string);
  }

  if (typeof data === "object" && Array.isArray(data)) {
    data.forEach((el, index) => {
      // eslint-disable-next-line
      data[index] = interpolate(el, getValue);
    });
  }

  if (typeof data === "object") {
    if ((data as { ref: string })?.ref) return getValue((data as { ref: string }).ref);
    const temp = data as Record<string, unknown>; // for converting ts object to record type
    Object.keys(temp).forEach((key) => {
      temp[key] = interpolate(data[key], getValue);
    });
  }
  return data;
};

const getInterpolationValue = (variables: TSecretRotationData) => (key: string) => {
  if (key.includes("|")) {
    const [keyword, ...arg] = key.split("|").map((el) => el.trim());
    switch (keyword) {
      case "random": {
        return alphaNumericNanoId(parseInt(arg[0], 10));
      }
      default: {
        throw Error(`Interpolation key not found - ${key}`);
      }
    }
  }
  const [type, keyName] = key.split(".").map((el) => el.trim());
  return variables[type as keyof TSecretRotationData][keyName];
};

export const secretRotationHttpFn = async (func: THttpProviderFunction, variables: TSecretRotationData) => {
  // string interpolation
  const headers = interpolate(func.header, getInterpolationValue(variables));
  const url = interpolate(func.url, getInterpolationValue(variables));
  const body = interpolate(func.body, getInterpolationValue(variables));
  // axios will automatically throw error if req status is not between 2xx range
  return axios({
    method: func.method,
    url,
    headers,
    data: body,
    timeout: EXTERNAL_REQUEST_TIMEOUT,
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT)
  });
};

export const secretRotationDbFn = async ({
  ca,
  host,
  port,
  query,
  database,
  password,
  username,
  client,
  variables,
  options
}: TSecretRotationDbFn) => {
  const appCfg = getConfig();

  const ssl = ca ? { rejectUnauthorized: false, ca } : undefined;
  const isCloud = Boolean(appCfg.LICENSE_SERVER_KEY); // quick and dirty way to check if its cloud or not
  const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);

  if (
    isCloud &&
    // internal ips
    (host === "host.docker.internal" || host.match(/^10\.\d+\.\d+\.\d+/) || host.match(/^192\.168\.\d+\.\d+/))
  )
    throw new Error("Invalid db host");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    // database infisical uses
    dbHost === host
  )
    throw new Error("Invalid db host");

  const db = knex({
    client,
    connection: {
      database,
      port,
      host,
      user: username,
      password,
      connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
      ssl,
      pool: { min: 0, max: 1 },
      options
    }
  });
  const data = await db.raw(query, variables);
  return data;
};

export const secretRotationPreSetFn = (op: Record<string, TDirectAssignOp>, variables: TSecretRotationData) => {
  const getValFn = getInterpolationValue(variables);
  Object.entries(op || {}).forEach(([key, assignFn]) => {
    const [type, keyName] = key.split(".") as [keyof TSecretRotationData, string];
    variables[type][keyName] = interpolate(assignFn.value, getValFn);
  });
};

export const secretRotationHttpSetFn = async (func: THttpProviderFunction, variables: TSecretRotationData) => {
  const getValFn = getInterpolationValue(variables);
  // http setter
  const res = await secretRotationHttpFn(func, variables);
  Object.entries(func.setter || {}).forEach(([key, assignFn]) => {
    const [type, keyName] = key.split(".") as [keyof TSecretRotationData, string];
    if (assignFn.assign === TAssignOp.JmesPath) {
      variables[type][keyName] = jmespath.search(res.data, assignFn.path);
    } else if (assignFn.value) {
      variables[type][keyName] = interpolate(assignFn.value, getValFn);
    }
  });
};

export const getDbSetQuery = (db: TDbProviderClients, variables: { username: string; password: string }) => {
  if (db === TDbProviderClients.Pg) {
    return {
      query: `ALTER USER ?? WITH PASSWORD '${variables.password}'`,
      variables: [variables.username]
    };
  }

  if (db === TDbProviderClients.MsSqlServer) {
    return {
      query: `ALTER LOGIN ?? WITH PASSWORD = '${variables.password}'`,
      variables: [variables.username]
    };
  }

  // add more based on client
  return {
    query: `ALTER USER ?? IDENTIFIED BY '${variables.password}'`,
    variables: [variables.username]
  };
};
