/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-param-reassign */
import axios from "axios";
import jmespath from "jmespath";
import knex from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TAssignOp, TDbProviderClients, TDirectAssignOp, THttpProviderFunction } from "../templates/types";
import { TSecretRotationData, TSecretRotationDbFn } from "./secret-rotation-queue-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const replaceTemplateVariables = (str: string, getValue: (key: string) => unknown) => {
  // Use array to collect pieces and join at the end (more efficient for large strings)
  const parts: string[] = [];
  let pos = 0;

  while (pos < str.length) {
    const start = str.indexOf("${", pos);
    if (start === -1) {
      parts.push(str.slice(pos));
      break;
    }

    parts.push(str.slice(pos, start));
    const end = str.indexOf("}", start + 2);

    if (end === -1) {
      parts.push(str.slice(start));
      break;
    }

    const varName = str.slice(start + 2, end);
    parts.push(String(getValue(varName)));
    pos = end + 1;
  }

  return parts.join("");
};

export const interpolate = (data: any, getValue: (key: string) => unknown) => {
  if (!data) return;

  if (typeof data === "number") return data;

  if (typeof data === "string") {
    return replaceTemplateVariables(data, getValue);
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
  const ssl = ca ? { rejectUnauthorized: false, ca } : undefined;
  const [hostIp] = await verifyHostInputValidity({ host, isDynamicSecret: false });
  const db = knex({
    client,
    connection: {
      database,
      port,
      host: hostIp,
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

  if (db === TDbProviderClients.MySql) {
    return {
      query: `ALTER USER ??@'%' IDENTIFIED BY '${variables.password}'`,
      variables: [variables.username]
    };
  }

  if (db === TDbProviderClients.OracleDB) {
    return {
      query: `ALTER USER ?? IDENTIFIED BY "${variables.password}"`,
      variables: [variables.username]
    };
  }

  // add more based on client
  return {
    query: `ALTER USER ?? IDENTIFIED BY '${variables.password}'`,
    variables: [variables.username]
  };
};
