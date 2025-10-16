import handlebars from "handlebars";
import knex from "knex";
import RE2 from "re2";
import { z } from "zod";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
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
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export const SqlDatabaseProvider = ({
  gatewayService,
  gatewayV2Service
}: TSqlDatabaseProviderDTO): TDynamicProviderFns => {
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

  const $getClient = async (
    providerInputs: z.infer<typeof DynamicSecretSqlDBSchema> & { hostIp: string; originalHost: string }
  ) => {
    const ssl = providerInputs.ca
      ? { rejectUnauthorized: false, ca: providerInputs.ca, servername: providerInputs.host }
      : undefined;

    const isMsSQLClient = providerInputs.client === SqlProviders.MsSQL;

    /*
      We route through the gateway by setting connection.host = "localhost".
      Azure SQL identifies the logical server from the TDS login name when the host
      isn’t the Azure FQDN. Therefore, when using the gateway, ensure username is
      "user@<azure-server-name>" so Azure opens the correct logical server.
      Direct connections to the Azure FQDN usually don’t require this suffix.
    */
    const isAzureSql = isMsSQLClient && new RE2(/\.database\.windows\.net$/i).test(providerInputs.originalHost);
    const azureServerLabel =
      isAzureSql && providerInputs.gatewayId ? providerInputs.originalHost?.split(".")[0] : undefined;
    const effectiveUser =
      isAzureSql && !providerInputs.username.includes("@") && azureServerLabel
        ? `${providerInputs.username}@${azureServerLabel}`
        : providerInputs.username;

    const db = knex({
      client: providerInputs.client,
      connection: {
        database: providerInputs.database,
        port: providerInputs.port,
        host:
          providerInputs.client === SqlProviders.Postgres && !providerInputs.gatewayId
            ? providerInputs.hostIp
            : providerInputs.host,
        user: effectiveUser,
        password: providerInputs.password,
        ssl,
        // @ts-expect-error this is because of knexjs type signature issue. This is directly passed to driver
        // https://github.com/knex/knex/blob/b6507a7129d2b9fafebf5f831494431e64c6a8a0/lib/dialects/mssql/index.js#L66
        // https://github.com/tediousjs/tedious/blob/ebb023ed90969a7ec0e4b036533ad52739d921f7/test/config.ci.ts#L19
        options: isMsSQLClient
          ? {
              ...(providerInputs.sslEnabled !== undefined ? { encrypt: providerInputs.sslEnabled } : {}),
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
    const gatewayV2ConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId: providerInputs.gatewayId as string,
      targetHost: providerInputs.host,
      targetPort: providerInputs.port
    });

    if (gatewayV2ConnectionDetails) {
      return withGatewayV2Proxy(
        async (port) => {
          await gatewayCallback("localhost", port);
        },
        {
          relayHost: gatewayV2ConnectionDetails.relayHost,
          gateway: gatewayV2ConnectionDetails.gateway,
          relay: gatewayV2ConnectionDetails.relay,
          protocol: GatewayProxyProtocol.Tcp
        }
      );
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(providerInputs.gatewayId as string);
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
    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const db = await $getClient({
        ...providerInputs,
        port,
        host,
        hostIp: providerInputs.hostIp,
        originalHost: providerInputs.host
      });
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

    if (providerInputs.gatewayId) {
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
      const db = await $getClient({
        ...providerInputs,
        port,
        host,
        originalHost: providerInputs.host
      });
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
      const db = await $getClient({
        ...providerInputs,
        port,
        host,
        originalHost: providerInputs.host
      });
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
      const db = await $getClient({
        ...providerInputs,
        port,
        host,
        originalHost: providerInputs.host
      });
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
