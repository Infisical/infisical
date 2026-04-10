import { createClient } from "@clickhouse/client";
import handlebars from "handlebars";
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
import { DynamicSecretClickhouseSchema, PasswordRequirements, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 1
  },
  allowedSymbols: "-_.~!*"
};

const generatePassword = (requirements?: PasswordRequirements) => {
  const finalReqs = requirements || DEFAULT_PASSWORD_REQUIREMENTS;
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

  for (let i = parts.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join("");
};

type TClickhouseProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export const ClickhouseProvider = ({
  gatewayService,
  gatewayV2Service
}: TClickhouseProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretClickhouseSchema.parseAsync(inputs);

    const sanitizedHost = providerInputs.host.replace(/^https?:\/\//, "");

    const [hostIp] = await verifyHostInputValidity({
      host: sanitizedHost,
      isGateway: Boolean(providerInputs.gatewayId),
      isDynamicSecret: true
    });

    validateHandlebarTemplate("ClickHouse creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration", "database"].includes(val)
    });

    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("ClickHouse renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration", "database"].includes(val)
      });
    }

    validateHandlebarTemplate("ClickHouse revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username", "database"].includes(val)
    });

    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretClickhouseSchema> & { hostIp: string }) => {
    let url = `${providerInputs.host}:${providerInputs.port}`;

    if (!url.includes("://")) {
      url = `http${providerInputs.ca ? "s" : ""}://${url}`;
    }

    const client = createClient({
      url,
      username: providerInputs.username,
      password: providerInputs.password,
      database: providerInputs.database,
      request_timeout: EXTERNAL_REQUEST_TIMEOUT,
      ...(providerInputs.ca && {
        tls: { ca_cert: Buffer.from(providerInputs.ca) }
      })
    });

    return client;
  };

  const executeStatements = async (statement: string, client: ReturnType<typeof createClient>) => {
    const queries = statement
      .split(";")
      .map((query) => query.trim())
      .filter(Boolean);

    for (const query of queries) {
      // eslint-disable-next-line no-await-in-loop -- statements must run sequentially (e.g. CREATE USER before GRANT)
      await client.command({ query });
    }
  };

  const gatewayProxyWrapper = async (
    providerInputs: z.infer<typeof DynamicSecretClickhouseSchema>,
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
    await withGatewayProxy(
      async (port) => {
        await gatewayCallback("localhost", port);
      },
      {
        relayDetails,
        protocol: GatewayProxyProtocol.Tcp,
        targetHost: providerInputs.host,
        targetPort: providerInputs.port
      }
    );
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    let isConnected = false;

    const gatewayCallback = async (host = providerInputs.hostIp, port = providerInputs.port) => {
      const client = await $getClient({
        ...providerInputs,
        host,
        port,
        hostIp: providerInputs.hostIp
      });

      try {
        await client.query({ query: "SELECT 1", format: "JSONEachRow" });
        isConnected = true;
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [providerInputs.username]
        });

        throw new BadRequestError({
          message: `Failed to connect with provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await client.close();
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
    const { database } = providerInputs;

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });

    const password = generatePassword(providerInputs.passwordRequirements);

    const gatewayCallback = async (host = providerInputs.hostIp, port = providerInputs.port) => {
      const client = await $getClient({
        ...providerInputs,
        host,
        port,
        hostIp: providerInputs.hostIp
      });

      try {
        const expiration = new Date(expireAt).toISOString();

        const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
          username,
          password,
          expiration,
          database
        });

        await executeStatements(creationStatement.toString(), client);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, password, database]
        });

        throw new BadRequestError({
          message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await client.close();
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

    const gatewayCallback = async (host = providerInputs.hostIp, port = providerInputs.port) => {
      const client = await $getClient({
        ...providerInputs,
        host,
        port,
        hostIp: providerInputs.hostIp
      });

      try {
        const revokeStatement = handlebars.compile(providerInputs.revocationStatement, { noEscape: true })({
          username,
          database
        });

        await executeStatements(revokeStatement.toString(), client);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, database]
        });

        throw new BadRequestError({
          message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await client.close();
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

    const gatewayCallback = async (host = providerInputs.hostIp, port = providerInputs.port) => {
      const client = await $getClient({
        ...providerInputs,
        host,
        port,
        hostIp: providerInputs.hostIp
      });

      const expiration = new Date(expireAt).toISOString();
      const { database } = providerInputs;

      try {
        const renewStatement = handlebars.compile(providerInputs.renewStatement as string, { noEscape: true })({
          username: entityId,
          expiration,
          database
        });

        await executeStatements(renewStatement.toString(), client);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [database]
        });

        throw new BadRequestError({
          message: `Failed to renew lease from provider: ${sanitizedErrorMessage}`
        });
      } finally {
        await client.close();
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
