import { randomInt } from "crypto";
import handlebars from "handlebars";
import knex, { Knex } from "knex";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretVerticaSchema, PasswordRequirements, TDynamicProviderFns } from "./models";

interface VersionResult {
  version: string;
}

interface SessionResult {
  session_id?: string;
}

interface DatabaseQueryResult {
  rows?: Array<Record<string, unknown>>;
}

// Extended Knex client interface to handle Vertica-specific overrides
interface VerticaKnexClient extends Knex {
  client: {
    parseVersion?: () => string;
  };
}

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

const generateUsername = (usernameTemplate?: string | null) => {
  const randomUsername = `inf_${alphaNumericNanoId(25)}`; // Username must start with an ascii letter, so we prepend the username with "inf-"
  if (!usernameTemplate) return randomUsername;

  return handlebars.compile(usernameTemplate)({
    randomUsername,
    unixTimestamp: Math.floor(Date.now() / 100)
  });
};

export const VerticaProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretVerticaSchema.parseAsync(inputs);

    const [hostIp] = await verifyHostInputValidity(providerInputs.host);
    validateHandlebarTemplate("Vertica creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password"].includes(val)
    });
    if (providerInputs.revocationStatement) {
      validateHandlebarTemplate("Vertica revoke", providerInputs.revocationStatement, {
        allowedExpressions: (val) => ["username"].includes(val)
      });
    }
    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretVerticaSchema> & { hostIp: string }) => {
    const config = {
      client: "pg",
      connection: {
        host: providerInputs.hostIp,
        port: providerInputs.port,
        database: providerInputs.database,
        user: providerInputs.username,
        password: providerInputs.password,
        ssl: false
      },
      pool: {
        min: 0,
        max: 1,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100
      },
      // Disable version checking for Vertica compatibility
      version: "9.6.0" // Fake a compatible PostgreSQL version
    };

    const client = knex(config) as VerticaKnexClient;

    // Override the version parsing to prevent errors with Vertica
    if (client.client && typeof client.client.parseVersion !== "undefined") {
      client.client.parseVersion = () => "9.6.0";
    }

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    let client: VerticaKnexClient | null = null;

    try {
      client = await $getClient(providerInputs);

      const clientResult: DatabaseQueryResult = await client.raw("SELECT version() AS version");

      const resultFromSelectedDatabase = clientResult.rows?.[0] as VersionResult | undefined;

      if (!resultFromSelectedDatabase?.version) {
        throw new BadRequestError({
          message: "Failed to validate Vertica connection, version query failed"
        });
      }

      return true;
    } finally {
      if (client) await client.destroy();
    }
  };

  const create = async (data: { inputs: unknown; usernameTemplate?: string | null }) => {
    const { inputs, usernameTemplate } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const username = generateUsername(usernameTemplate);
    const password = generatePassword(providerInputs.passwordRequirements);

    let client: VerticaKnexClient | null = null;

    try {
      client = await $getClient(providerInputs);

      const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
        username,
        password
      });

      const queries = creationStatement.trim().replaceAll("\n", "").split(";").filter(Boolean);

      // Execute queries sequentially to maintain transaction integrity
      for (const query of queries) {
        const trimmedQuery = query.trim();
        if (trimmedQuery) {
          // eslint-disable-next-line no-await-in-loop
          await client.raw(trimmedQuery);
        }
      }

      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } finally {
      if (client) await client.destroy();
    }
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await validateProviderInputs(inputs);

    let client: VerticaKnexClient | null = null;

    try {
      client = await $getClient(providerInputs);

      const revokeStatement = handlebars.compile(providerInputs.revocationStatement, { noEscape: true })({
        username
      });

      const queries = revokeStatement.trim().replaceAll("\n", "").split(";").filter(Boolean);

      // Check for active sessions and close them
      try {
        const sessionResult: DatabaseQueryResult = await client.raw(
          "SELECT session_id FROM sessions WHERE user_name = ?",
          [username]
        );

        const activeSessions = (sessionResult.rows || []) as SessionResult[];

        // Close all sessions in parallel since they're independent operations
        if (activeSessions.length > 0) {
          const sessionClosePromises = activeSessions.map(async (session) => {
            try {
              await client!.raw("SELECT close_session(?)", [session.session_id]);
            } catch (error) {
              // Continue if session is already closed
              logger.error(error, `Failed to close session ${session.session_id}`);
            }
          });

          await Promise.allSettled(sessionClosePromises);
        }
      } catch (error) {
        // Continue if we can't query sessions (permissions, etc.)
        logger.error(error, "Could not query/close active sessions");
      }

      // Execute revocation queries sequentially to maintain transaction integrity
      for (const query of queries) {
        const trimmedQuery = query.trim();
        if (trimmedQuery) {
          // eslint-disable-next-line no-await-in-loop
          await client.raw(trimmedQuery);
        }
      }

      return { entityId: username };
    } finally {
      if (client) await client.destroy();
    }
  };

  const renew = async (_: unknown, username: string) => {
    // No need for renewal
    return { entityId: username };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
