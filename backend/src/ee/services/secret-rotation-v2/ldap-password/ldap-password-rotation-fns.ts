import ldap from "ldapjs";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { logger } from "@app/lib/logger";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { getLdapConnectionClient, LdapProvider, TLdapConnection } from "@app/services/app-connection/ldap";

import { generatePassword } from "../shared/utils";
import {
  TLdapPasswordRotationGeneratedCredentials,
  TLdapPasswordRotationWithConnection
} from "./ldap-password-rotation-types";

const getEncodedPassword = (password: string) => Buffer.from(`"${password}"`, "utf16le");

export const ldapPasswordRotationFactory: TRotationFactory<
  TLdapPasswordRotationWithConnection,
  TLdapPasswordRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { dn, passwordRequirements },
    secretsMapping
  } = secretRotation;

  const $verifyCredentials = async (credentials: Pick<TLdapConnection["credentials"], "dn" | "password">) => {
    try {
      const client = await getLdapConnectionClient({ ...connection.credentials, ...credentials });

      client.unbind();
      client.destroy();
    } catch (error) {
      throw new Error(`Failed to verify credentials - ${(error as Error).message}`);
    }
  };

  const $rotatePassword = async () => {
    const { credentials, orgId } = connection;

    if (!credentials.url.startsWith("ldaps")) throw new Error("Password Rotation requires an LDAPS connection");

    const client = await getLdapConnectionClient(credentials);
    const isPersonalRotation = credentials.dn === dn;

    const password = generatePassword(passwordRequirements);

    let changes: ldap.Change[] | ldap.Change;

    switch (credentials.provider) {
      case LdapProvider.ActiveDirectory:
        {
          const encodedPassword = getEncodedPassword(password);

          // service account vs personal password rotation require different changes
          if (isPersonalRotation) {
            const currentEncodedPassword = getEncodedPassword(credentials.password);

            changes = [
              new ldap.Change({
                operation: "delete",
                modification: {
                  type: "unicodePwd",
                  values: [currentEncodedPassword]
                }
              }),
              new ldap.Change({
                operation: "add",
                modification: {
                  type: "unicodePwd",
                  values: [encodedPassword]
                }
              })
            ];
          } else {
            changes = new ldap.Change({
              operation: "replace",
              modification: {
                type: "unicodePwd",
                values: [encodedPassword]
              }
            });
          }
        }
        break;
      default:
        throw new Error(`Unhandled provider: ${credentials.provider as LdapProvider}`);
    }

    try {
      await new Promise((resolve, reject) => {
        client.modify(dn, changes, (err) => {
          if (err) {
            logger.error(err, "LDAP Password Rotation Failed");
            reject(new Error(`Provider Modify Error: ${err.message}`));
          } else {
            resolve(true);
          }
        });
      });
    } finally {
      client.unbind();
      client.destroy();
    }

    await $verifyCredentials({ dn, password });

    if (isPersonalRotation) {
      const updatedCredentials: TLdapConnection["credentials"] = {
        ...credentials,
        password
      };

      const encryptedCredentials = await encryptAppConnectionCredentials({
        credentials: updatedCredentials,
        orgId,
        kmsService
      });

      await appConnectionDAL.updateById(connection.id, { encryptedCredentials });
    }

    return { dn, password };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TLdapPasswordRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotatePassword();

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TLdapPasswordRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    // we just rotate to a new password, essentially revoking old credentials
    await $rotatePassword();

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TLdapPasswordRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const credentials = await $rotatePassword();

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TLdapPasswordRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    const secrets = [
      {
        key: secretsMapping.dn,
        value: generatedCredentials.dn
      },
      {
        key: secretsMapping.password,
        value: generatedCredentials.password
      }
    ];

    return secrets;
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
