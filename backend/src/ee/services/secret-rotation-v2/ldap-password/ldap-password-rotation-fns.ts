import ldap, { Client, SearchOptions } from "ldapjs";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { logger } from "@app/lib/logger";
import { DistinguishedNameRegex } from "@app/lib/regex";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import {
  buildReferralUrl,
  executeWithPotentialGateway,
  extractDomainFromDN,
  isLdapReferralError,
  LdapProvider,
  TLdapConnection
} from "@app/services/app-connection/ldap";

import { generatePassword } from "../shared/utils";
import {
  LdapPasswordRotationMethod,
  TLdapPasswordRotationGeneratedCredentials,
  TLdapPasswordRotationInput,
  TLdapPasswordRotationWithConnection
} from "./ldap-password-rotation-types";

const getEncodedPassword = (password: string) => Buffer.from(`"${password}"`, "utf16le");

const getDN = async (dn: string, client: Client): Promise<string> => {
  if (DistinguishedNameRegex.test(dn)) return dn;

  const opts: SearchOptions = {
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
    // Perform the search
    client.search(base, opts, (err, res) => {
      if (err) {
        logger.error(err, "LDAP Failed to get DN");
        reject(new Error(`Provider Resolve DN Error: ${err.message}`));
      }

      let userDn: string | null;

      res.on("searchEntry", (entry) => {
        userDn = entry.objectName;
      });

      res.on("error", (error) => {
        logger.error(error, "LDAP Failed to get DN");
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

export const ldapPasswordRotationFactory: TRotationFactory<
  TLdapPasswordRotationWithConnection,
  TLdapPasswordRotationGeneratedCredentials,
  TLdapPasswordRotationInput["temporaryParameters"]
> = (secretRotation, appConnectionDAL, kmsService, gatewayService, gatewayV2Service) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;

  const { dn, passwordRequirements } = parameters;

  const $verifyCredentials = async (
    verifyOpts: Pick<TLdapConnection["credentials"], "dn" | "password"> & { url?: string }
  ) => {
    try {
      await executeWithPotentialGateway(
        { ...connection, credentials: { ...connection.credentials, ...verifyOpts } },
        gatewayV2Service,
        async () => {}
      );
    } catch (error) {
      throw new Error(`Failed to verify credentials - ${(error as Error).message}`);
    }
  };

  const $rotatePassword = async (currentPassword?: string) => {
    const { credentials, orgId } = connection;

    if (!credentials.url.startsWith("ldaps")) throw new Error("Password Rotation requires an LDAPS connection");

    const isConnectionRotation = credentials.dn === dn;
    const password = generatePassword(passwordRequirements);

    let changes: ldap.Change[] | ldap.Change;

    switch (credentials.provider) {
      case LdapProvider.ActiveDirectory:
        {
          const encodedPassword = getEncodedPassword(password);

          if (isConnectionRotation || currentPassword) {
            const currentEncodedPassword = getEncodedPassword(currentPassword || credentials.password);

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

    const connectionCredentials = currentPassword ? { ...credentials, password: currentPassword, dn } : credentials;

    const performModify = async (targetCredentials: typeof connectionCredentials) => {
      await executeWithPotentialGateway(
        { ...connection, credentials: targetCredentials },
        gatewayV2Service,
        async (client) => {
          const userDn = await getDN(dn, client);
          await new Promise<void>((resolve, reject) => {
            client.modify(userDn, changes, (err) => {
              if (err) {
                logger.error(err, "LDAP Password Rotation Failed");
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      );
    };

    let referredUrl: string | undefined;

    try {
      await performModify(connectionCredentials);
    } catch (err) {
      if (!isLdapReferralError(err)) {
        throw new Error(`Provider Modify Error: ${(err as Error).message}`);
      }

      const referralDomain = extractDomainFromDN(err.dn);
      if (!referralDomain) {
        throw new Error("Provider Modify Error: Referral received but could not determine target domain");
      }

      referredUrl = buildReferralUrl(credentials.url, referralDomain);
      logger.info({ referralDomain, referredUrl }, "LDAP referral detected — chasing to referred domain controller");

      try {
        await performModify({ ...connectionCredentials, url: referredUrl });
      } catch (retryErr) {
        throw new Error(
          `Provider Modify Error: Referral chase to ${referralDomain} failed — ${(retryErr as Error).message}`
        );
      }
    }

    await $verifyCredentials({ dn, password, ...(referredUrl ? { url: referredUrl } : {}) });

    if (isConnectionRotation) {
      const updatedCredentials: TLdapConnection["credentials"] = {
        ...credentials,
        password
      };

      const encryptedCredentials = await encryptAppConnectionCredentials({
        credentials: updatedCredentials,
        orgId,
        kmsService,
        projectId: connection.projectId
      });

      await appConnectionDAL.updateById(connection.id, { encryptedCredentials });
    }

    return { dn, password };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TLdapPasswordRotationGeneratedCredentials,
    TLdapPasswordRotationInput["temporaryParameters"]
  > = async (callback, temporaryParameters) => {
    const credentials = await $rotatePassword(
      parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal
        ? temporaryParameters?.password
        : undefined
    );

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TLdapPasswordRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const currentPassword = credentialsToRevoke[activeIndex].password;

    // we just rotate to a new password, essentially revoking old credentials
    await $rotatePassword(
      parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal ? currentPassword : undefined
    );

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TLdapPasswordRotationGeneratedCredentials> = async (
    _,
    callback,
    activeCredentials
  ) => {
    const credentials = await $rotatePassword(
      parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal ? activeCredentials.password : undefined
    );

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
