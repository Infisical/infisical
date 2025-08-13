import crypto from "node:crypto";

import axios from "axios";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";

import { DynamicSecretCouchbaseSchema, PasswordRequirements, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

type TCreateCouchbaseUser = {
  name: string;
  password: string;
  access: {
    privileges: string[];
    resources: {
      buckets: {
        name: string;
        scopes?: {
          name: string;
          collections?: string[];
        }[];
      }[];
    };
  }[];
};

type CouchbaseUserResponse = {
  id: string;
  uuid?: string;
};

const sanitizeCouchbaseUsername = (username: string): string => {
  // Couchbase username restrictions:
  // - Cannot contain: ) ( > < , ; : " \ / ] [ ? = } {
  // - Cannot begin with @ character

  const forbiddenCharsPattern = new RE2('[\\)\\(><,;:"\\\\\\[\\]\\?=\\}\\{]', "g");
  let sanitized = forbiddenCharsPattern.replace(username, "-");

  const leadingAtPattern = new RE2("^@+");
  sanitized = leadingAtPattern.replace(sanitized, "");

  if (!sanitized || sanitized.length === 0) {
    return alphaNumericNanoId(12);
  }

  return sanitized;
};

const generateUsername = (usernameTemplate?: string | null, identity?: { name: string }) => {
  const randomUsername = alphaNumericNanoId(12);
  if (!usernameTemplate) return sanitizeCouchbaseUsername(randomUsername);

  const compiledUsername = compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity
  });

  return sanitizeCouchbaseUsername(compiledUsername);
};

const generatePassword = (requirements?: PasswordRequirements): string => {
  const {
    length = 12,
    required = { lowercase: 1, uppercase: 1, digits: 1, symbols: 1 },
    allowedSymbols = "!@#$%^()_+-=[]{}:,?/~`"
  } = requirements || {};

  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = allowedSymbols;

  let password = "";
  let remaining = length;

  // Add required characters
  for (let i = 0; i < required.lowercase; i += 1) {
    password += lowercase[crypto.randomInt(lowercase.length)];
    remaining -= 1;
  }
  for (let i = 0; i < required.uppercase; i += 1) {
    password += uppercase[crypto.randomInt(uppercase.length)];
    remaining -= 1;
  }
  for (let i = 0; i < required.digits; i += 1) {
    password += digits[crypto.randomInt(digits.length)];
    remaining -= 1;
  }
  for (let i = 0; i < required.symbols; i += 1) {
    password += symbols[crypto.randomInt(symbols.length)];
    remaining -= 1;
  }

  // Fill remaining with random characters from all sets
  const allChars = lowercase + uppercase + digits + symbols;
  for (let i = 0; i < remaining; i += 1) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => crypto.randomInt(3) - 1)
    .join("");
};

const couchbaseApiRequest = async (
  method: string,
  url: string,
  apiKey: string,
  data?: unknown
): Promise<CouchbaseUserResponse> => {
  await blockLocalAndPrivateIpAddresses(url);

  try {
    const response = await axios({
      method: method.toLowerCase() as "get" | "post" | "put" | "delete",
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      data: data || undefined,
      timeout: 30000
    });

    return response.data as CouchbaseUserResponse;
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: [apiKey]
    });
    throw new BadRequestError({
      message: `Failed to connect with provider: ${sanitizedErrorMessage}`
    });
  }
};

export const CouchbaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: object) => {
    const providerInputs = DynamicSecretCouchbaseSchema.parse(inputs);

    await blockLocalAndPrivateIpAddresses(providerInputs.url);

    return providerInputs;
  };

  const validateConnection = async (inputs: unknown): Promise<boolean> => {
    try {
      const providerInputs = await validateProviderInputs(inputs as object);

      // Test connection by trying to get organization info
      const url = `${providerInputs.url}/v4/organizations/${providerInputs.orgId}`;
      await couchbaseApiRequest("GET", url, providerInputs.auth.apiKey);

      return true;
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to connect to Couchbase: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  const create = async ({
    inputs,
    usernameTemplate,
    identity
  }: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity?: { name: string };
  }) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    const username = generateUsername(usernameTemplate, identity);

    const password = generatePassword(providerInputs.passwordRequirements);

    const createUserUrl = `${providerInputs.url}/v4/organizations/${providerInputs.orgId}/projects/${providerInputs.projectId}/clusters/${providerInputs.clusterId}/users`;

    let bucketResources;

    if (typeof providerInputs.buckets === "string") {
      // Simple string format - either "*" or comma-separated bucket names
      const bucketNames =
        providerInputs.buckets === "*"
          ? ["*"]
          : providerInputs.buckets
              .split(",")
              .map((bucket) => bucket.trim())
              .filter((bucket) => bucket.length > 0);
      bucketResources = bucketNames.map((bucketName) => ({ name: bucketName }));
    } else {
      // Array of bucket objects with scopes and collections
      bucketResources = providerInputs.buckets.map((bucket) => ({
        name: bucket.name,
        scopes: bucket.scopes?.map((scope) => ({
          name: scope.name,
          collections: scope.collections || []
        }))
      }));
    }

    const userData: TCreateCouchbaseUser = {
      name: username,
      password,
      access: [
        {
          privileges: providerInputs.roles,
          resources: {
            buckets: bucketResources
          }
        }
      ]
    };

    const response = await couchbaseApiRequest("POST", createUserUrl, providerInputs.auth.apiKey, userData);

    const userUuid = response?.id || response?.uuid || username;

    return {
      entityId: userUuid,
      data: {
        username,
        password
      }
    };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    const deleteUserUrl = `${providerInputs.url}/v4/organizations/${providerInputs.orgId}/projects/${providerInputs.projectId}/clusters/${providerInputs.clusterId}/users/${encodeURIComponent(entityId)}`;

    await couchbaseApiRequest("DELETE", deleteUserUrl, providerInputs.auth.apiKey);

    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // Couchbase Cloud API doesn't support renewing user credentials
    // The user remains valid until explicitly deleted
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
