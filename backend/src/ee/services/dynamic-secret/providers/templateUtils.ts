/* eslint-disable func-names */
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import RE2 from "re2";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretProviders, DynamicSecretSqlDBSchema, SqlProviders } from "./models";

const hbsReplace = (text: string, searchValue: string, replaceValue: string) => {
  // Convert to string if it's not already
  const textStr = String(text || "");
  if (!textStr) {
    return textStr;
  }

  try {
    const re2Pattern = new RE2(searchValue, "g");
    // Replace all occurrences
    return re2Pattern.replace(textStr, replaceValue);
  } catch (error) {
    logger.error(error, "RE2 pattern failed, using original template");
    return textStr;
  }
};

const hbsRandom = (length: number) => {
  if (typeof length !== "number" || length <= 0 || length > 100) {
    return "";
  }
  return alphaNumericNanoId(length);
};

const hbsTruncate = (text: string, length: number) => {
  const textStr = String(text || "");
  if (!textStr) {
    return textStr;
  }

  if (typeof length !== "number" || length <= 0) return textStr;
  return textStr.substring(0, length);
};
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
  // Create isolated handlebars instance
  const hbs = handlebars.create();

  // Register random helper on local instance
  hbs.registerHelper("random", hbsRandom);
  // Register replace helper on local instance
  hbs.registerHelper("replace", hbsReplace);
  // Register truncate helper on local instance
  hbs.registerHelper("truncate", hbsTruncate);

  // Compile template with context using local instance
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
