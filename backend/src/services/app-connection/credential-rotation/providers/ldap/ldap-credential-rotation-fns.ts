import ldap from "@infisical/ldapjs";

import { generatePassword } from "@app/ee/services/secret-rotation-v2/shared/utils";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { DistinguishedNameRegex } from "@app/lib/regex";
import { getLdapConnectionClient } from "@app/services/app-connection/ldap";
import { LdapConnectionMethod, LdapProvider } from "@app/services/app-connection/ldap/ldap-connection-enums";

import {
  TCredentialRotationCreateCredential,
  TCredentialRotationIssueInitialCredentials,
  TCredentialRotationMergeCredentials,
  TCredentialRotationProviderFactory,
  TCredentialRotationRevokeCredential,
  TCredentialRotationValidateMethod
} from "../../app-connection-credential-rotation-types";
import {
  TLdapCredentialRotationCredentials,
  TLdapGeneratedCredential,
  TLdapStrategyConfig
} from "./ldap-credential-rotation-types";

const getEncodedPassword = (password: string) => Buffer.from(`"${password}"`, "utf16le");

const getDN = async (dn: string, client: ldap.Client): Promise<string> => {
  if (DistinguishedNameRegex.test(dn)) return dn;

  const opts: ldap.SearchOptions = {
    filter: `(userPrincipalName=${dn})`,
    scope: "sub",
    attributes: ["dn"]
  };

  const base = dn
    .split("@")[1]
    .split(".")
    .map((dc) => `dc=${dc}`)
    .join(",");

  return new Promise((resolve, reject) => {
    client.search(base, opts, (err, res) => {
      if (err) {
        reject(new Error(`Provider Resolve DN Error: ${err.message}`));
        return;
      }

      let userDn: string | null = null;

      res.on("searchEntry", (entry) => {
        userDn = entry.objectName;
      });

      res.on("error", (error) => {
        reject(new Error(`Provider Resolve DN Error: ${error.message}`));
      });

      res.on("end", () => {
        if (userDn) {
          resolve(userDn);
        } else {
          reject(new Error(`Unable to resolve DN for ${dn}.`));
        }
      });
    });
  });
};

const buildPasswordChanges = (provider: LdapProvider, currentPassword: string, newPassword: string): ldap.Change[] => {
  switch (provider) {
    case LdapProvider.ActiveDirectory: {
      const currentEncoded = getEncodedPassword(currentPassword);
      const newEncoded = getEncodedPassword(newPassword);

      return [
        new ldap.Change({
          operation: "delete",
          modification: {
            type: "unicodePwd",
            values: [currentEncoded]
          }
        }),
        new ldap.Change({
          operation: "add",
          modification: {
            type: "unicodePwd",
            values: [newEncoded]
          }
        })
      ];
    }
    default:
      throw new BadRequestError({ message: `Unsupported LDAP provider: ${provider as string}` });
  }
};

const modifyLdapPassword = async (
  credentials: TLdapCredentialRotationCredentials,
  newPassword: string
): Promise<void> => {
  if (!credentials.url.startsWith("ldaps")) {
    throw new BadRequestError({ message: "Credential rotation requires an LDAPS connection" });
  }

  const client = await getLdapConnectionClient(credentials);

  try {
    const userDn = await getDN(credentials.dn, client);

    const changes = buildPasswordChanges(credentials.provider, credentials.password, newPassword);

    await new Promise<void>((resolve, reject) => {
      client.modify(userDn, changes, (err) => {
        if (err) {
          reject(new Error(`Provider Modify Error: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  } finally {
    client.destroy();
  }
};

const verifyLdapCredentials = async (credentials: TLdapCredentialRotationCredentials): Promise<void> => {
  const client = await getLdapConnectionClient(credentials);
  client.destroy();
};

export const ldapCredentialRotationProviderFactory: TCredentialRotationProviderFactory<
  TLdapStrategyConfig,
  TLdapGeneratedCredential
> = (connection) => {
  const validateConnectionMethod: TCredentialRotationValidateMethod = (method) => {
    if (method !== LdapConnectionMethod.SimpleBind) {
      throw new BadRequestError({
        message: "Credential rotation is only supported for Simple Bind auth method"
      });
    }
  };

  const issueInitialCredentials: TCredentialRotationIssueInitialCredentials<
    TLdapStrategyConfig,
    TLdapGeneratedCredential
  > = async (credentials) => {
    const ldapCredentials = credentials as TLdapCredentialRotationCredentials;

    const strategyConfig: TLdapStrategyConfig = { provider: ldapCredentials.provider };

    const newPassword = generatePassword();

    await modifyLdapPassword(ldapCredentials, newPassword);

    const updatedCredentials = {
      ...ldapCredentials,
      password: newPassword
    };

    await verifyLdapCredentials(updatedCredentials);

    logger.info(`credentialRotation: LDAP initial credential rotation succeeded [connection=${connection.name}]`);

    const now = new Date().toISOString();
    const generatedCredential: TLdapGeneratedCredential = {
      dn: ldapCredentials.dn,
      password: newPassword,
      createdAt: now
    };

    return {
      strategyConfig,
      generatedCredentials: [generatedCredential, null],
      updatedCredentials
    };
  };

  const createCredential: TCredentialRotationCreateCredential<TLdapStrategyConfig, TLdapGeneratedCredential> = async (
    _strategyConfig,
    credentials
  ) => {
    const ldapCredentials = credentials as TLdapCredentialRotationCredentials;

    const newPassword = generatePassword();

    await modifyLdapPassword(ldapCredentials, newPassword);

    const updatedCredentials = { ...ldapCredentials, password: newPassword };
    await verifyLdapCredentials(updatedCredentials);

    logger.info(`credentialRotation: LDAP credential rotation succeeded [connection=${connection.name}]`);

    return {
      dn: ldapCredentials.dn,
      password: newPassword,
      createdAt: new Date().toISOString()
    };
  };

  const mergeCredentials: TCredentialRotationMergeCredentials<TLdapGeneratedCredential> = (
    currentCredentials,
    newCredential
  ) => {
    return { ...currentCredentials, password: newCredential.password };
  };

  const revokeCredential: TCredentialRotationRevokeCredential<
    TLdapStrategyConfig,
    TLdapGeneratedCredential
  > = async () => {
    // LDAP accounts have a single password. When a new password is set,
    // the old one is immediately invalid. No explicit revocation needed.
  };

  return {
    validateConnectionMethod,
    issueInitialCredentials,
    createCredential,
    mergeCredentials,
    revokeCredential
  };
};
