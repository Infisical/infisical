import axios from "axios";
import jmespath from "jmespath";
import { customAlphabet } from "nanoid";
import { Client as PgClient } from "pg";
import mysql from "mysql2";
import {
  ISecretRotationData,
  TAssignOp,
  TDbProviderClients,
  TDbProviderFunction,
  TDirectAssignOp,
  THttpProviderFunction,
  TProviderFunction,
  TProviderFunctionTypes
} from "../types";
const REGEX = /\${([^}]+)}/g;
const SLUG_ALPHABETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoId = customAlphabet(SLUG_ALPHABETS, 10);

export const interpolate = (data: any, getValue: (key: string) => unknown) => {
  if (!data) return;

  if (typeof data === "number") return data;

  if (typeof data === "string") {
    return data.replace(REGEX, (_a, b) => getValue(b) as string);
  }

  if (typeof data === "object" && Array.isArray(data)) {
    data.forEach((el, index) => {
      data[index] = interpolate(el, getValue);
    });
  }

  if (typeof data === "object") {
    if ((data as { ref: string })?.ref) return getValue((data as { ref: string }).ref);
    const temp = data as Record<string, unknown>; // for converting ts object to record type
    Object.keys(temp).forEach((key) => {
      temp[key as keyof typeof temp] = interpolate(data[key as keyof typeof temp], getValue);
    });
  }
  return data;
};

const getInterpolationValue = (variables: ISecretRotationData) => (key: string) => {
  if (key.includes("|")) {
    const [keyword, ...arg] = key.split("|").map((el) => el.trim());
    switch (keyword) {
      case "random": {
        return nanoId(parseInt(arg[0], 10));
      }
      default: {
        throw Error(`Interpolation key not found - ${key}`);
      }
    }
  }
  const [type, keyName] = key.split(".").map((el) => el.trim());
  return variables[type as keyof ISecretRotationData][keyName];
};

export const secretRotationHttpFn = async (
  func: THttpProviderFunction,
  variables: ISecretRotationData
) => {
  // string interpolation
  const headers = interpolate(func.header, getInterpolationValue(variables));
  const url = interpolate(func.url, getInterpolationValue(variables));
  const body = interpolate(func.body, getInterpolationValue(variables));
  // axios will automatically throw error if req status is not between 2xx range
  return axios({ method: func.method, url, headers, data: body });
};

export const secretRotationDbFn = async (
  func: TDbProviderFunction,
  variables: ISecretRotationData
) => {
  const { type, client, pre, ...dbConnection } = func;
  const { username, password, host, database, port, query, ca } = interpolate(
    dbConnection,
    getInterpolationValue(variables)
  );
  const ssl = ca ? { rejectUnauthorized: false, ca } : undefined;
  if (host === "localhost" || host === "127.0.0.1") throw new Error("Invalid db host");
  if (client === TDbProviderClients.Pg) {
    const pgClient = new PgClient({ user: username, password, host, database, port, ssl });
    await pgClient.connect();
    const res = await pgClient.query(query);
    await pgClient.end();
    return res.rows[0];
  } else if (client === TDbProviderClients.Sql) {
    const sqlClient = mysql.createPool({
      user: username,
      password,
      host,
      database,
      port,
      connectionLimit: 1,
      ssl
    });
    const res = await new Promise((resolve, reject) => {
      sqlClient.query(query, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    await new Promise((resolve, reject) => {
      sqlClient.end(function (err) {
        if (err) return reject(err);
        return resolve({});
      });
    });
    return (res as any)?.[0];
  }
};

export const secretRotationPreSetFn = (
  op: Record<string, TDirectAssignOp>,
  variables: ISecretRotationData
) => {
  const getValFn = getInterpolationValue(variables);
  Object.entries(op || {}).forEach(([key, assignFn]) => {
    const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
    variables[type][keyName] = interpolate(assignFn.value, getValFn);
  });
};

export const secretRotationSetFn = async (
  func: TProviderFunction,
  variables: ISecretRotationData
) => {
  const getValFn = getInterpolationValue(variables);
  // http setter
  if (func.type === TProviderFunctionTypes.HTTP) {
    const res = await secretRotationHttpFn(func, variables);
    Object.entries(func.setter || {}).forEach(([key, assignFn]) => {
      const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
      if (assignFn.assign === TAssignOp.JmesPath) {
        variables[type][keyName] = jmespath.search(res.data, assignFn.path);
      } else if (assignFn.value) {
        variables[type][keyName] = interpolate(assignFn.value, getValFn);
      }
    });
    // db setter
  } else if (func.type === TProviderFunctionTypes.DB) {
    const data = await secretRotationDbFn(func, variables);
    Object.entries(func.setter || {}).forEach(([key, assignFn]) => {
      const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
      if (assignFn.assign === TAssignOp.JmesPath) {
        if (typeof data === "object") {
          variables[type][keyName] = jmespath.search(data, assignFn.path);
        }
      } else if (assignFn.value) {
        variables[type][keyName] = interpolate(assignFn.value, getValFn);
      }
    });
  }
};

export const secretRotationTestFn = async (
  func: TProviderFunction,
  variables: ISecretRotationData
) => {
  if (func.type === TProviderFunctionTypes.HTTP) {
    await secretRotationHttpFn(func, variables);
  } else if (func.type === TProviderFunctionTypes.DB) {
    await secretRotationDbFn(func, variables);
  }
};

export const secretRotationRemoveFn = async (
  func: TProviderFunction,
  variables: ISecretRotationData
) => {
  if (!func) return;
  if (func.type === TProviderFunctionTypes.HTTP) {
    // string interpolation
    return await secretRotationHttpFn(func, variables);
  }
};
