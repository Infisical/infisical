import { randomInt } from "crypto";
import handlebars from "handlebars";
import knex from "knex";
import { z } from "zod";

import { withGatewayProxy } from "@app/lib/gateway";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSqlDBSchema, PasswordRequirements, SqlProviders, TDynamicProviderFns } from "./models";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: "-_.~!*"
};

const ORACLE_PASSWORD_REQUIREMENTS = {
  ...DEFAULT_PASSWORD_REQUIREMENTS,
  length: 30
};

const generatePassword = (provider: SqlProviders, requirements?: PasswordRequirements) => {
  const defaultReqs = provider === SqlProviders.Oracle ? ORACLE_PASSWORD_REQUIREMENTS : DEFAULT_PASSWORD_REQUIREMENTS;
  const finalReqs = requirements || defaultReqs;

  try {
    const { length, required, allowedSymbols } = finalReqs;

    const chars = {
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      digits: "0123456789",
      symbols: allowedSymbols || "-_.~!*"
    };

    const parts: string[] = [];

    if (required.lowercase > 0) {
      parts.push(
        ...Array(required.lowercase)
          .fill(0)
          .map(() => chars.lowercase[randomInt(chars.lowercase.length)])
      );
    }

    if (required.uppercase > 0) {
      parts.push(
        ...Array(required.uppercase)
          .fill(0)
          .map(() => chars.uppercase[randomInt(chars.uppercase.length)])
      );
    }

    if (required.digits > 0) {
      parts.push(
        ...Array(required.digits)
          .fill(0)
          .map(() => chars.digits[randomInt(chars.digits.length)])
      );
    }

    if (required.symbols > 0) {
      parts.push(
        ...Array(required.symbols)
          .fill(0)
          .map(() => chars.symbols[randomInt(chars.symbols.length)])
      );
    }

    const requiredTotal = Object.values(required).reduce<number>((a, b) => a + b, 0);
    const remainingLength = Math.max(length - requiredTotal, 0);

    const allowedChars = Object.entries(chars)
      .filter(([key]) => required[key as keyof typeof required] > 0)
      .map(([, value]) => value)
      .join("");

    parts.push(
      ...Array(remainingLength)
        .fill(0)
        .map(() => allowedChars[randomInt(allowedChars.length)])
    );

    // shuffle the array to mix up the characters
    for (let i = parts.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }

    return parts.join("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to generate password: ${message}`);
  }
};

const generateUsername = (provider: SqlProviders) => {
  // For oracle, the client assumes everything is upper case when not using quotes around the password
  if (provider === SqlProviders.Oracle) return alphaNumericNanoId(32).toUpperCase();

  return alphaNumericNanoId(32);
};

type TSqlDatabaseProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
};

export const SqlDatabaseProvider = ({ gatewayService }: TSqlDatabaseProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSqlDBSchema.parseAsync(inputs);

    const [hostIp] = await verifyHostInputValidity(providerInputs.host, Boolean(providerInputs.gatewayId));
    validateHandlebarTemplate("SQL creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration", "database"].includes(val)
    });
    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("SQL renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration", "database"].includes(val)
      });
    }
    validateHandlebarTemplate("SQL revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username", "database"].includes(val)
    });

    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSqlDBSchema>) => {
    const ssl = providerInputs.ca ? { rejectUnauthorized: false, ca: providerInputs.ca } : undefined;
    const isMsSQLClient = providerInputs.client === SqlProviders.MsSQL;

    const db = knex({
      client: providerInputs.client,
      connection: {
        database: providerInputs.database,
        port: providerInputs.port,
        host: providerInputs.host,
        user: providerInputs.username,
        password: providerInputs.password,
        ssl,
        // @ts-expect-error this is because of knexjs type signature issue. This is directly passed to driver
        // https://github.com/knex/knex/blob/b6507a7129d2b9fafebf5f831494431e64c6a8a0/lib/dialects/mssql/index.js#L66
        // https://github.com/tediousjs/tedious/blob/ebb023ed90969a7ec0e4b036533ad52739d921f7/test/config.ci.ts#L19
        options: isMsSQLClient
          ? {
              trustServerCertificate: !providerInputs.ca,
              cryptoCredentialsDetails: providerInputs.ca ? { ca: providerInputs.ca } : {}
            }
          : undefined
      },
      acquireConnectionTimeout: EXTERNAL_REQUEST_TIMEOUT,
      pool: { min: 0, max: 7 }
    });
    return db;
  };

  const gatewayProxyWrapper = async (
    providerInputs: z.infer<typeof DynamicSecretSqlDBSchema>,
    gatewayCallback: (host: string, port: number) => Promise<void>
  ) => {
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(providerInputs.gatewayId as string);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");
    await withGatewayProxy(
      async (port) => {
        await gatewayCallback("localhost", port);
      },
      {
        targetHost: providerInputs.host,
        targetPort: providerInputs.port,
        relayHost,
        relayPort: Number(relayPort),
        identityId: relayDetails.identityId,
        orgId: relayDetails.orgId,
        tlsOptions: {
          ca: relayDetails.certChain,
          cert: relayDetails.certificate,
          key: relayDetails.privateKey.toString()
        }
      }
    );
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    let isConnected = false;
    const gatewayCallback = async (host = providerInputs.hostIp, port = providerInputs.port) => {
      const db = await $getClient({ ...providerInputs, port, host });
      // oracle needs from keyword
      const testStatement = providerInputs.client === SqlProviders.Oracle ? "SELECT 1 FROM DUAL" : "SELECT 1";

      isConnected = await db.raw(testStatement).then(() => true);
      await db.destroy();
    };

    if (providerInputs.gatewayId) {
      await gatewayProxyWrapper(providerInputs, gatewayCallback);
    } else {
      await gatewayCallback();
    }
    return isConnected;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const username = generateUsername(providerInputs.client);
    const password = generatePassword(providerInputs.client, providerInputs.passwordRequirements);
    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const db = await $getClient({ ...providerInputs, port, host });
      try {
        const { database } = providerInputs;
        const expiration = new Date(expireAt).toISOString();

        const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
          username,
          password,
          expiration,
          database
        });

        const queries = creationStatement.toString().split(";").filter(Boolean);
        await db.transaction(async (tx) => {
          for (const query of queries) {
            // eslint-disable-next-line
            await tx.raw(query);
          }
        });
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId) {
      await gatewayProxyWrapper(providerInputs, gatewayCallback);
    } else {
      await gatewayCallback();
    }
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const username = entityId;
    const { database } = providerInputs;
    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const db = await $getClient({ ...providerInputs, port, host });
      try {
        const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username, database });
        const queries = revokeStatement.toString().split(";").filter(Boolean);
        await db.transaction(async (tx) => {
          for (const query of queries) {
            // eslint-disable-next-line
            await tx.raw(query);
          }
        });
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId) {
      await gatewayProxyWrapper(providerInputs, gatewayCallback);
    } else {
      await gatewayCallback();
    }
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const db = await $getClient({ ...providerInputs, port, host });
      const expiration = new Date(expireAt).toISOString();
      const { database } = providerInputs;

      const renewStatement = handlebars.compile(providerInputs.renewStatement)({
        username: entityId,
        expiration,
        database
      });
      try {
        if (renewStatement) {
          const queries = renewStatement.toString().split(";").filter(Boolean);
          await db.transaction(async (tx) => {
            for (const query of queries) {
              // eslint-disable-next-line
              await tx.raw(query);
            }
          });
        }
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId) {
      await gatewayProxyWrapper(providerInputs, gatewayCallback);
    } else {
      await gatewayCallback();
    }
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
