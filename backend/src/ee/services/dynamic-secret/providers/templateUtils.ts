/* eslint-disable func-names */
import { customAlphabet } from "nanoid";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { createHandlebarsClient } from "@app/lib/template/handlebars-client";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretProviders, DynamicSecretSqlDBSchema, SqlProviders } from "./models";

const compileUsernameTemplate = ({
  usernameTemplate,
  randomUsername,
  identity,
  unixTimestamp,
  dynamicSecret,
  options
}: {
  usernameTemplate: string;
  randomUsername: string;
  identity: ActorIdentityAttributes | null;
  dynamicSecret: TDynamicSecrets | null;
  unixTimestamp: number;
  options?: {
    toUpperCase?: boolean;
  };
}): string => {
  const hbs = createHandlebarsClient();

  const context = {
    randomUsername,
    unixTimestamp,

    ...(dynamicSecret
      ? {
          dynamicSecret: {
            name: dynamicSecret.name,
            type: dynamicSecret.type
          }
        }
      : {}),
    ...(identity
      ? {
          identity: {
            name: identity.name
          }
        }
      : {})
  };

  const result = hbs.compile(usernameTemplate)(context);

  if (options?.toUpperCase) {
    return result.toUpperCase();
  }

  return result;
};

export const generateUsername = async (
  usernameTemplate: string | null | undefined,
  options: {
    decryptedDynamicSecretInputs: unknown;
    dynamicSecret: TDynamicSecrets | null;
    identity: ActorIdentityAttributes | null;

    usernamePrefix?: string;
    usernameLowercase?: boolean;
    usernameCharset?: string;
    /*
     Optionally define the length of the randomly generated username. Only applies to the {{randomUsername}} variable. Defaults to 32.
    */
    usernameLength?: number;
  },
  sanitizeUsernameFunc?: (username: string) => string
) => {
  const generateRandomUsername = () => {
    if (options.usernameCharset) {
      return customAlphabet(options.usernameCharset, options.usernameLength || 32)();
    }

    return alphaNumericNanoId(options.usernameLength || 32);
  };

  const unixTimestamp = Math.floor(Date.now() / 1000);
  let randomUsername = `${options.usernamePrefix || ""}${generateRandomUsername()}`;

  let useUpperCase = false;

  if (
    options.dynamicSecret?.type === DynamicSecretProviders.SqlDatabase &&
    options.decryptedDynamicSecretInputs !== null
  ) {
    const { data, success } = await DynamicSecretSqlDBSchema.safeParseAsync(options.decryptedDynamicSecretInputs);
    if (!success) {
      throw new BadRequestError({
        message: "Failed to parse SQL database dynamic secret inputs"
      });
    }

    if (data.client === SqlProviders.Oracle) {
      useUpperCase = true;
      randomUsername = `${options.usernamePrefix || ""}${generateRandomUsername().toUpperCase()}`;
    }
  }

  if (options.usernameLowercase) {
    randomUsername = randomUsername.toLowerCase();
  }

  if (!usernameTemplate) return sanitizeUsernameFunc ? sanitizeUsernameFunc(randomUsername) : randomUsername;
  const compiledUsername = compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity: options.identity,
    unixTimestamp,
    dynamicSecret: options.dynamicSecret,
    options: {
      // For oracle, the client assumes everything is upper case when not using quotes around the password
      toUpperCase: useUpperCase
    }
  });

  return sanitizeUsernameFunc ? sanitizeUsernameFunc(compiledUsername) : compiledUsername;
};
