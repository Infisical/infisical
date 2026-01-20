import handlebars from "handlebars";
import knex from "knex";
import RE2 from "re2";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretAzureSqlDBSchema, PasswordRequirements, SqlProviders, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

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

const generatePassword = (requirements?: PasswordRequirements) => {
  const finalReqs = requirements || DEFAULT_PASSWORD_REQUIREMENTS;

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

type TAzureSqlDatabaseProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export const AzureSqlDatabaseProvider = ({
  gatewayService,
  gatewayV2Service
}: TAzureSqlDatabaseProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretAzureSqlDBSchema.parseAsync(inputs);

    const [hostIp] = await verifyHostInputValidity({
      host: providerInputs.host,
      isGateway: Boolean(providerInputs.gatewayId),
      isDynamicSecret: true
    });
    validateHandlebarTemplate("Azure SQL master creation", providerInputs.masterCreationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration", "database"].includes(val)
    });
    validateHandlebarTemplate("Azure SQL creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration", "database"].includes(val)
    });
    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("Azure SQL renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration", "database"].includes(val)
      });
    }
    validateHandlebarTemplate("Azure SQL revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username", "database"].includes(val)
    });

    return { ...providerInputs, hostIp };
  };

  const $getClient = async (
    providerInputs: z.infer<typeof DynamicSecretAzureSqlDBSchema> & { hostIp: string; originalHost: string },
    targetDatabase?: string
  ) => {
    const ssl = providerInputs.ca
      ? { rejectUnauthorized: false, ca: providerInputs.ca, servername: providerInputs.host }
      : undefined;

    /*
      We route through the gateway by setting connection.host = "localhost".
      Azure SQL identifies the logical server from the TDS login name when the host
      isn't the Azure FQDN. Therefore, when using the gateway, ensure username is
      "user@<azure-server-name>" so Azure opens the correct logical server.
      Direct connections to the Azure FQDN usually don't require this suffix.
    */
    const isAzureSql = new RE2(/\.database\.windows\.net$/i).test(providerInputs.originalHost);
    const azureServerLabel =
      isAzureSql && providerInputs.gatewayId ? providerInputs.originalHost?.split(".")[0] : undefined;
    const effectiveUser =
      isAzureSql && !providerInputs.username.includes("@") && azureServerLabel
        ? `${providerInputs.username}@${azureServerLabel}`
        : providerInputs.username;

    const db = knex({
      client: SqlProviders.MsSQL,
      connection: {
        database: targetDatabase || providerInputs.database,
        port: providerInputs.port,
        host: providerInputs.host,
        user: effectiveUser,
        password: providerInputs.password,
        ssl,
        // @ts-expect-error this is because of knexjs type signature issue. This is directly passed to driver
        // https://github.com/knex/knex/blob/b6507a7129d2b9fafebf5f831494431e64c6a8a0/lib/dialects/mssql/index.js#L66
        // https://github.com/tediousjs/tedious/blob/ebb023ed90969a7ec0e4b036533ad52739d921f7/test/config.ci.ts#L19
        options: {
          ...(providerInputs.sslEnabled !== undefined ? { encrypt: providerInputs.sslEnabled } : {}),
          trustServerCertificate: !providerInputs.ca,
          cryptoCredentialsDetails: providerInputs.ca ? { ca: providerInputs.ca } : {}
        }
      },
      acquireConnectionTimeout: EXTERNAL_REQUEST_TIMEOUT,
      pool: { min: 0, max: 7 }
    });
    return db;
  };

  const gatewayProxyWrapper = async (
    providerInputs: z.infer<typeof DynamicSecretAzureSqlDBSchema>,
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

      try {
        isConnected = await db.raw("SELECT 1").then(() => true);
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
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, expireAt, usernameTemplate, identity, dynamicSecret } = data;

    const providerInputs = await validateProviderInputs(inputs);
    const { database, masterDatabase } = providerInputs;
    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });
    const password = generatePassword(providerInputs.passwordRequirements);

    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const expiration = new Date(expireAt).toISOString();

      const masterDb = await $getClient(
        {
          ...providerInputs,
          port,
          host,
          originalHost: providerInputs.host
        },
        masterDatabase
      );

      try {
        const masterCreationStatement = handlebars.compile(providerInputs.masterCreationStatement, { noEscape: true })({
          username,
          password,
          expiration,
          database
        });

        const masterQueries = masterCreationStatement.toString().split(";").filter(Boolean);
        await masterDb.transaction(async (tx) => {
          for (const query of masterQueries) {
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
          message: `Failed to create login in master database: ${sanitizedErrorMessage}`
        });
      } finally {
        await masterDb.destroy();
      }

      const targetDb = await $getClient({
        ...providerInputs,
        port,
        host,
        originalHost: providerInputs.host
      });

      try {
        const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
          username,
          password,
          expiration,
          database
        });

        const queries = creationStatement.toString().split(";").filter(Boolean);
        await targetDb.transaction(async (tx) => {
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
          message: `Failed to create user in target database: ${sanitizedErrorMessage}`
        });
      } finally {
        await targetDb.destroy();
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
    const { database, masterDatabase } = providerInputs;

    const gatewayCallback = async (host = providerInputs.host, port = providerInputs.port) => {
      const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username, database });
      const queries = revokeStatement.toString().split(";").filter(Boolean);

      const userDropQueries = queries.filter((query) => query.toLowerCase().includes("drop user"));
      const loginDropQueries = queries.filter((query) => query.toLowerCase().includes("drop login"));

      if (userDropQueries.length > 0) {
        const targetDb = await $getClient({
          ...providerInputs,
          port,
          host,
          originalHost: providerInputs.host
        });

        try {
          await targetDb.transaction(async (tx) => {
            for (const query of userDropQueries) {
              // eslint-disable-next-line
              await tx.raw(query.trim());
            }
          });
        } catch (err) {
          const sanitizedErrorMessage = sanitizeString({
            unsanitizedString: (err as Error)?.message,
            tokens: [username, database]
          });
          throw new BadRequestError({
            message: `Failed to drop user from target database: ${sanitizedErrorMessage}`
          });
        } finally {
          await targetDb.destroy();
        }
      }

      if (loginDropQueries.length > 0) {
        const masterDb = await $getClient(
          {
            ...providerInputs,
            port,
            host,
            originalHost: providerInputs.host
          },
          masterDatabase
        );

        try {
          await masterDb.transaction(async (tx) => {
            for (const query of loginDropQueries) {
              // eslint-disable-next-line
              await tx.raw(query.trim());
            }
          });
        } catch (err) {
          const sanitizedErrorMessage = sanitizeString({
            unsanitizedString: (err as Error)?.message,
            tokens: [username, database]
          });
          throw new BadRequestError({
            message: `Failed to drop login from master database: ${sanitizedErrorMessage}`
          });
        } finally {
          await masterDb.destroy();
        }
      }

      const otherQueries = queries.filter(
        (query) => !query.toLowerCase().includes("drop user") && !query.toLowerCase().includes("drop login")
      );

      if (otherQueries.length > 0) {
        const targetDb = await $getClient({
          ...providerInputs,
          port,
          host,
          originalHost: providerInputs.host
        });

        try {
          await targetDb.transaction(async (tx) => {
            for (const query of otherQueries) {
              // eslint-disable-next-line
              await tx.raw(query.trim());
            }
          });
        } catch (err) {
          const sanitizedErrorMessage = sanitizeString({
            unsanitizedString: (err as Error)?.message,
            tokens: [username, database]
          });
          throw new BadRequestError({
            message: `Failed to execute revocation statement: ${sanitizedErrorMessage}`
          });
        } finally {
          await targetDb.destroy();
        }
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
