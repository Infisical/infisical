import handlebars from "handlebars";
import knex from "knex";
import { z } from "zod";

import { withConnectorProxy } from "@app/lib/connector/connector";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { TConnectorServiceFactory } from "../../connector/connector-service";
import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSqlDBSchema, PasswordRequirements, SqlProviders, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

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
          .map(() => chars.lowercase[crypto.randomInt(chars.lowercase.length)])
      );
    }

    if (required.uppercase > 0) {
      parts.push(
        ...Array(required.uppercase)
          .fill(0)
          .map(() => chars.uppercase[crypto.randomInt(chars.uppercase.length)])
      );
    }

    if (required.digits > 0) {
      parts.push(
        ...Array(required.digits)
          .fill(0)
          .map(() => chars.digits[crypto.randomInt(chars.digits.length)])
      );
    }

    if (required.symbols > 0) {
      parts.push(
        ...Array(required.symbols)
          .fill(0)
          .map(() => chars.symbols[crypto.randomInt(chars.symbols.length)])
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
        .map(() => allowedChars[crypto.randomInt(allowedChars.length)])
    );

    // shuffle the array to mix up the characters
    for (let i = parts.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }

    return parts.join("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to generate password: ${message}`);
  }
};

const generateUsername = (provider: SqlProviders, usernameTemplate?: string | null, identity?: { name: string }) => {
  let randomUsername = "";
  // For oracle, the client assumes everything is upper case when not using quotes around the password
  if (provider === SqlProviders.Oracle) {
    randomUsername = alphaNumericNanoId(32).toUpperCase();
  } else {
    randomUsername = alphaNumericNanoId(32);
  }
  if (!usernameTemplate) return randomUsername;
  return compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity,
    options: {
      toUpperCase: provider === SqlProviders.Oracle
    }
  });
};

type TSqlDatabaseProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  connectorService: Pick<TConnectorServiceFactory, "getPlatformConnectionDetailsByConnectorId">;
};

export const SqlDatabaseProvider = ({
  gatewayService,
  connectorService
}: TSqlDatabaseProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSqlDBSchema.parseAsync(inputs);

    const [hostIp] = await verifyHostInputValidity(
      providerInputs.host,
      Boolean(providerInputs.gatewayId || providerInputs.connectorId)
    );
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

    // added gatewayId mapping for backwards compatibility
    return { ...providerInputs, hostIp, gatewayId: providerInputs.gatewayId || providerInputs.connectorId };
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
    const connectorConnectionDetails = await connectorService.getPlatformConnectionDetailsByConnectorId({
      connectorId: (providerInputs.gatewayId || providerInputs.connectorId) as string,
      targetHost: providerInputs.host,
      targetPort: providerInputs.port
    });

    if (connectorConnectionDetails) {
      return withConnectorProxy(
        async (port) => {
          await gatewayCallback("localhost", port);
        },
        {
          relayIp: connectorConnectionDetails.relayIp,
          connector: connectorConnectionDetails.connector,
          relay: connectorConnectionDetails.relay,
          protocol: GatewayProxyProtocol.Tcp
        }
      );
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(
      (providerInputs.gatewayId || providerInputs.connectorId) as string
    );
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");
    await withGatewayProxy(
      async (port) => {
        await gatewayCallback("localhost", port);
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
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

      try {
        isConnected = await db.raw(testStatement).then(() => true);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [providerInputs.username]
        });
        throw new BadRequestError({
          message: `Failed to connect with provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await db.destroy();
      }
    };

    if (providerInputs.gatewayId || providerInputs.connectorId) {
      await gatewayProxyWrapper(providerInputs, gatewayCallback);
    } else {
      await gatewayCallback();
    }
    return isConnected;
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity?: { name: string };
  }) => {
    const { inputs, expireAt, usernameTemplate, identity } = data;

    const providerInputs = await validateProviderInputs(inputs);
    const { database } = providerInputs;
    const username = generateUsername(providerInputs.client, usernameTemplate, identity);

    const password = generatePassword(providerInputs.client, providerInputs.passwordRequirements);
    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const db = await $getClient({ ...providerInputs, port, host });
      try {
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
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, password, database]
        });
        throw new BadRequestError({
          message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId || providerInputs.connectorId) {
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
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, database]
        });
        throw new BadRequestError({
          message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId || providerInputs.connectorId) {
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
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [database]
        });
        throw new BadRequestError({
          message: `Failed to renew lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await db.destroy();
      }
    };
    if (providerInputs.gatewayId || providerInputs.connectorId) {
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
