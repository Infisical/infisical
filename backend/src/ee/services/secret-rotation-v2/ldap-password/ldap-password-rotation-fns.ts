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

    const rotationContext = {
      targetDn: dn,
      connectionDn: credentials.dn,
      originalUrl: credentials.url,
      provider: credentials.provider,
      isConnectionRotation,
      rotationId: secretRotation.id,
      connectionId: connection.id,
      gatewayId: connection.gatewayId ?? null
    };

    logger.info(rotationContext, "LDAP password rotation starting");

    let changes: ldap.Change[] | ldap.Change;
    let rotationStrategy: string;

    switch (credentials.provider) {
      case LdapProvider.ActiveDirectory:
        {
          const encodedPassword = getEncodedPassword(password);

          if (isConnectionRotation || currentPassword) {
            const currentEncodedPassword = getEncodedPassword(currentPassword || credentials.password);
            rotationStrategy = "delete+add (connection principal or current password provided)";

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
            rotationStrategy = "replace (target principal, admin-driven)";
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

    logger.info({ ...rotationContext, rotationStrategy }, "LDAP password rotation — modify strategy determined");

    const connectionCredentials = currentPassword ? { ...credentials, password: currentPassword, dn } : credentials;

    const performModify = async (targetCredentials: typeof connectionCredentials) => {
      const modifyUrl = targetCredentials.url;
      logger.info(
        { targetDn: dn, url: modifyUrl, bindDn: targetCredentials.dn },
        "LDAP password rotation — attempting modify operation"
      );

      await executeWithPotentialGateway(
        { ...connection, credentials: targetCredentials },
        gatewayV2Service,
        async (client) => {
          const userDn = await getDN(dn, client);

          logger.info(
            { inputDn: dn, resolvedDn: userDn, url: modifyUrl },
            "LDAP password rotation — DN resolved, executing modify"
          );

          await new Promise<void>((resolve, reject) => {
            client.modify(userDn, changes, (err) => {
              if (err) {
                logger.debug(
                  { error: err.message, errorCode: (err as { code?: number }).code, targetDn: userDn, url: modifyUrl },
                  "LDAP modify returned an error (may be a referral — handled upstream)"
                );
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      );

      logger.info({ targetDn: dn, url: modifyUrl }, "LDAP password rotation — modify succeeded");
    };

    const MAX_REFERRAL_HOPS = 10;
    let referredUrl: string | undefined;
    let currentCredentials = connectionCredentials;

    for (let hop = 0; hop <= MAX_REFERRAL_HOPS; hop += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await performModify(currentCredentials);
        if (hop > 0) {
          logger.info(
            { ...rotationContext, totalHops: hop, finalUrl: referredUrl },
            "LDAP password rotation — modify succeeded after referral chase"
          );
        }
        break;
      } catch (caughtErr) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        if (!isLdapReferralError(caughtErr)) {
          const errObj = caughtErr instanceof Error ? caughtErr : new Error(String(caughtErr));
          const prefix = referredUrl
            ? `Provider Modify Error: Referral chase to ${referredUrl} failed`
            : "Provider Modify Error";

          logger.error(
            {
              ...rotationContext,
              hop,
              lastUrl: currentCredentials.url,
              referredUrl,
              errorName: errObj.name,
              errorMessage: errObj.message
            },
            "LDAP password rotation — non-referral error during modify"
          );

          throw new Error(`${prefix} — ${errObj.message}`);
        }

        const referralDn = String((caughtErr as { dn: string })?.dn);
        const referralCode = Number((caughtErr as { code: number })?.code);
        const referralName = String((caughtErr as { name: string })?.name);

        if (hop === MAX_REFERRAL_HOPS) {
          logger.error(
            {
              ...rotationContext,
              maxHops: MAX_REFERRAL_HOPS,
              lastReferralDn: referralDn,
              lastUrl: currentCredentials.url
            },
            "LDAP password rotation — maximum referral hops exceeded"
          );

          throw new Error(
            `Provider Modify Error: Maximum referral hops (${MAX_REFERRAL_HOPS}) exceeded — last referral DN: ${referralDn}`
          );
        }

        const referralDomain = extractDomainFromDN(referralDn);

        logger.info(
          {
            ...rotationContext,
            hop: hop + 1,
            rawErrorDn: referralDn,
            rawErrorCode: referralCode,
            rawErrorName: referralName,
            extractedReferralDomain: referralDomain,
            currentUrl: currentCredentials.url
          },
          "LDAP referral received — inspecting error details"
        );

        if (!referralDomain) {
          logger.error(
            { ...rotationContext, rawErrorDn: referralDn },
            "LDAP password rotation — could not extract domain from referral DN (no DC= components found)"
          );
          throw new Error(
            `Provider Modify Error: Referral received but could not determine target domain from DN: ${referralDn}`
          );
        }

        referredUrl = buildReferralUrl(credentials.url, referralDomain);
        logger.info(
          {
            ...rotationContext,
            hop: hop + 1,
            referralDomain,
            referredUrl,
            matchedDn: referralDn,
            originalUrl: credentials.url
          },
          "LDAP referral detected — chasing to referred domain controller"
        );

        currentCredentials = { ...connectionCredentials, url: referredUrl };
      }
    }

    const verifyUrl = referredUrl || credentials.url;
    logger.info(
      { ...rotationContext, verifyUrl, wasReferred: !!referredUrl },
      "LDAP password rotation — verifying new credentials"
    );

    await $verifyCredentials({ dn, password, ...(referredUrl ? { url: referredUrl } : {}) });

    logger.info(
      { ...rotationContext, verifyUrl, wasReferred: !!referredUrl },
      "LDAP password rotation — credential verification succeeded"
    );

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

      logger.info(
        { ...rotationContext },
        "LDAP password rotation — connection credentials updated (connection principal rotation)"
      );
    }

    logger.info(
      { ...rotationContext, wasReferred: !!referredUrl, referredUrl },
      "LDAP password rotation completed successfully"
    );

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
