import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import odbc from "odbc";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSapAseSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return customAlphabet(charset, 48)(size);
};

enum SapCommands {
  CreateLogin = "sp_addlogin",
  DropLogin = "sp_droplogin"
}

export const SapAseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSapAseSchema.parseAsync(inputs);

    await verifyHostInputValidity({ host: providerInputs.host, isDynamicSecret: true });
    validateHandlebarTemplate("SAP ASE creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password"].includes(val)
    });
    if (providerInputs.revocationStatement) {
      validateHandlebarTemplate("SAP ASE revoke", providerInputs.revocationStatement, {
        allowedExpressions: (val) => ["username"].includes(val)
      });
    }
    return { ...providerInputs };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSapAseSchema>, useMaster?: boolean) => {
    const connectionString =
      `DRIVER={FreeTDS};` +
      `SERVER=${providerInputs.host};` +
      `PORT=${providerInputs.port};` +
      `DATABASE=${useMaster ? "master" : providerInputs.database};` +
      `UID=${providerInputs.username};` +
      `PWD=${providerInputs.password};` +
      `TDS_VERSION=5.0`;

    const client = await odbc.connect(connectionString);

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    let masterClient;
    let client;
    try {
      masterClient = await $getClient(providerInputs, true);
      client = await $getClient(providerInputs);

      const [resultFromMasterDatabase] = await masterClient.query<{ version: string }>("SELECT @@VERSION AS version");
      const [resultFromSelectedDatabase] = await client.query<{ version: string }>("SELECT @@VERSION AS version");

      if (!resultFromSelectedDatabase.version) {
        throw new BadRequestError({
          message: "Failed to validate SAP ASE connection, version query failed"
        });
      }

      if (resultFromMasterDatabase.version !== resultFromSelectedDatabase.version) {
        throw new BadRequestError({
          message: "Failed to validate SAP ASE connection (master), version mismatch"
        });
      }

      await masterClient.close();
      await client.close();
      return true;
    } catch (err) {
      if (masterClient) await masterClient.close();
      if (client) await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.password, providerInputs.username, providerInputs.host, providerInputs.database]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,

      // Username must start with an ascii letter, so we prepend the username with "inf_"
      usernamePrefix: "inf_",
      usernameLength: 25
    });
    const password = generatePassword();

    const client = await $getClient(providerInputs);
    const masterClient = await $getClient(providerInputs, true);

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password
    });

    const queries = creationStatement.trim().replaceAll("\n", "").split(";").filter(Boolean);

    try {
      for await (const query of queries) {
        // If it's an adduser query, we need to first call sp_addlogin on the MASTER database.
        // If not done, then the newly created user won't be able to authenticate.
        await (query.startsWith(SapCommands.CreateLogin) ? masterClient : client).query(query);
      }
      await masterClient.close();
      await client.close();
      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } catch (err) {
      await masterClient.close();
      await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, password, providerInputs.password, providerInputs.username, providerInputs.database]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await validateProviderInputs(inputs);

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement, { noEscape: true })({
      username
    });

    const queries = revokeStatement.trim().replaceAll("\n", "").split(";").filter(Boolean);

    const client = await $getClient(providerInputs);
    const masterClient = await $getClient(providerInputs, true);

    // Get all processes for this login and kill them. If there are active connections to the database when drop login happens, it will throw an error.
    const result = await masterClient.query<{ spid?: string }>(`sp_who '${username}'`);

    if (result && result.length > 0) {
      for await (const row of result) {
        if (row.spid) {
          await masterClient.query(`KILL ${row.spid.trim()}`);
        }
      }
    }

    try {
      for await (const query of queries) {
        await (query.startsWith(SapCommands.DropLogin) ? masterClient : client).query(query);
      }
      await masterClient.close();
      await client.close();
      return { entityId: username };
    } catch (err) {
      await masterClient.close();
      await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, providerInputs.password, providerInputs.username, providerInputs.database]
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
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
