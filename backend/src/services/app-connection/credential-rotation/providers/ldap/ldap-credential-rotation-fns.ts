/* eslint-disable no-await-in-loop */
import ldap from "@infisical/ldapjs";

import { generatePassword } from "@app/ee/services/secret-rotation-v2/shared/utils";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { DistinguishedNameRegex } from "@app/lib/regex";
import {
  buildReferralUrl,
  executeWithPotentialGateway,
  extractDomainFromDN,
  extractHostFromReferralUrl,
  isLdapReferral,
  isLdapReferralError,
  LdapReferralError,
  normalizeLdapUrl,
  TLdapConnectionConfig
} from "@app/services/app-connection/ldap";
import { LdapConnectionMethod, LdapProvider } from "@app/services/app-connection/ldap/ldap-connection-enums";

import {
  TCredentialRotationCreateCredential,
  TCredentialRotationIssueInitialCredentials,
  TCredentialRotationMergeCredentials,
  TCredentialRotationProviderFactory,
  TCredentialRotationProviderServices,
  TCredentialRotationRevokeCredential,
  TCredentialRotationValidateMethod
} from "../../app-connection-credential-rotation-types";
import {
  TLdapCredentialRotationCredentials,
  TLdapGeneratedCredential,
  TLdapStrategyConfig
} from "./ldap-credential-rotation-types";

const MAX_REFERRAL_HOPS = 10;

const getEncodedPassword = (password: string) => Buffer.from(`"${password}"`, "utf16le");

const getDN = async (dn: string, client: ldap.Client, searchBase: string): Promise<string> => {
  if (DistinguishedNameRegex.test(dn)) return dn;

  const opts: ldap.SearchOptions = {
    filter: `(userPrincipalName=${dn})`,
    scope: "sub",
    attributes: ["dn"]
  };

  return new Promise((resolve, reject) => {
    const handleSearchError = (error: Error) => {
      if (isLdapReferral(error)) {
        const ldapErr = error as Partial<LdapReferralError> & Error;
        if (!ldapErr.dn) {
          (ldapErr as { dn: string }).dn = searchBase;
        }
        if (!Array.isArray((ldapErr as { referrals?: unknown }).referrals)) {
          (ldapErr as { referrals: string[] }).referrals = [];
        }
        (ldapErr as { referralSource: string }).referralSource = "search";
        logger.info(
          {
            searchBase,
            upn: dn,
            referralDn: ldapErr.dn,
            referralUrls: (ldapErr as { referrals?: string[] }).referrals ?? []
          },
          `LDAP DN resolution received referral [searchBase=${searchBase}] [upn=${dn}]`
        );
        reject(error);
        return;
      }

      reject(new Error(`Provider Resolve DN Error: ${error.message}`));
    };

    client.search(searchBase, opts, (err, res) => {
      if (err) {
        handleSearchError(err);
        return;
      }

      let userDn: string | null = null;

      res.on("searchEntry", (entry) => {
        userDn = entry.objectName;
      });

      res.on("error", (error) => {
        handleSearchError(error);
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

const resolveSearchBase = (dn: string): string => {
  return dn
    .split("@")[1]
    .split(".")
    .map((dc) => `dc=${dc}`)
    .join(",");
};

const performModify = async (
  connectionConfig: TLdapConnectionConfig,
  dn: string,
  changes: ldap.Change[],
  services: TCredentialRotationProviderServices
): Promise<void> => {
  let capturedReferralError: LdapReferralError | undefined;
  const searchBase = DistinguishedNameRegex.test(dn) ? dn : resolveSearchBase(dn);

  try {
    await executeWithPotentialGateway(
      connectionConfig,
      services.gatewayV2Service,
      async (client) => {
        let userDn: string;
        try {
          userDn = await getDN(dn, client, searchBase);
        } catch (getDnErr) {
          if (isLdapReferralError(getDnErr)) {
            capturedReferralError = getDnErr;
          }
          throw getDnErr;
        }

        await new Promise<void>((resolve, reject) => {
          client.modify(userDn, changes, (err) => {
            if (err) {
              if (isLdapReferral(err)) {
                const ldapErr = err as Partial<LdapReferralError> & Error;
                if (!Array.isArray((ldapErr as { referrals?: unknown }).referrals)) {
                  (ldapErr as { referrals: string[] }).referrals = [];
                }
                if (typeof ldapErr.dn !== "string") {
                  (ldapErr as { dn: string }).dn = "";
                }
                (ldapErr as { referralSource: string }).referralSource = "modify";
                capturedReferralError = ldapErr as LdapReferralError;
              }
              reject(err);
            } else {
              resolve();
            }
          });
        });
      },
      services.gatewayPoolService
    );
  } catch (proxyErr) {
    if (capturedReferralError) {
      throw capturedReferralError;
    }
    throw proxyErr;
  }
};

const resolveReferralTarget = (referralErr: LdapReferralError): { target: string; source: string } | null => {
  if (referralErr.referrals.length > 0) {
    const target = extractHostFromReferralUrl(referralErr.referrals[0]);
    if (target) return { target, source: "referral URL" };
  }

  const domainFromDn = extractDomainFromDN(referralErr.dn);
  if (domainFromDn) return { target: domainFromDn, source: "matched DN" };

  return null;
};

const modifyLdapPassword = async (
  connectionConfig: TLdapConnectionConfig,
  newPassword: string,
  connectionName: string,
  services: TCredentialRotationProviderServices
): Promise<string | undefined> => {
  const { credentials } = connectionConfig;

  if (!credentials.url.startsWith("ldaps")) {
    throw new BadRequestError({ message: "Credential rotation requires an LDAPS connection" });
  }

  const changes = buildPasswordChanges(credentials.provider, credentials.password, newPassword);

  let referredUrl: string | undefined;
  let currentConfig = connectionConfig;
  const visitedUrls = new Set<string>();

  for (let hop = 0; hop <= MAX_REFERRAL_HOPS; hop += 1) {
    visitedUrls.add(normalizeLdapUrl(currentConfig.credentials.url));
    try {
      await performModify(currentConfig, credentials.dn, changes, services);
      if (hop > 0) {
        logger.info(
          { connectionName, totalHops: hop, finalUrl: referredUrl },
          `credentialRotation: LDAP modify succeeded after referral chase [connection=${connectionName}]`
        );
      }
      return referredUrl;
    } catch (caughtErr) {
      if (!isLdapReferralError(caughtErr)) {
        const errObj = caughtErr instanceof Error ? caughtErr : new Error(String(caughtErr));
        const prefix = referredUrl
          ? `Provider Modify Error: Referral chase to ${referredUrl} failed`
          : "Provider Modify Error";
        throw new Error(`${prefix} -- ${errObj.message}`);
      }

      if (hop === MAX_REFERRAL_HOPS) {
        throw new Error(
          `Provider Modify Error: Maximum referral hops (${MAX_REFERRAL_HOPS}) exceeded -- last referral DN: ${caughtErr.dn}`
        );
      }

      const resolved = resolveReferralTarget(caughtErr);

      logger.info(
        {
          connectionName,
          hop: hop + 1,
          referralSource: caughtErr.referralSource,
          referralDn: caughtErr.dn,
          referralUrls: caughtErr.referrals,
          referralTarget: resolved?.target,
          targetSource: resolved?.source,
          currentUrl: currentConfig.credentials.url
        },
        `credentialRotation: LDAP referral received [connection=${connectionName}]`
      );

      if (!resolved) {
        throw new Error(
          `Provider Modify Error: Referral received but could not determine target -- referralUrls: [${caughtErr.referrals.join(", ")}], matchedDN: ${caughtErr.dn}`
        );
      }

      referredUrl = buildReferralUrl(credentials.url, resolved.target);

      if (visitedUrls.has(referredUrl)) {
        throw new Error(
          `Provider Modify Error: Referral chase loop detected -- referred URL ${referredUrl} was already visited`
        );
      }

      currentConfig = { ...connectionConfig, credentials: { ...credentials, url: referredUrl } };
    }
  }

  return referredUrl;
};

const verifyLdapCredentials = async (
  connectionConfig: TLdapConnectionConfig,
  services: TCredentialRotationProviderServices,
  urlOverride?: string
): Promise<void> => {
  const config = urlOverride
    ? { ...connectionConfig, credentials: { ...connectionConfig.credentials, url: urlOverride } }
    : connectionConfig;

  await executeWithPotentialGateway(config, services.gatewayV2Service, async () => {}, services.gatewayPoolService);
};

export const ldapCredentialRotationProviderFactory: TCredentialRotationProviderFactory<
  TLdapStrategyConfig,
  TLdapGeneratedCredential
> = (connection, services) => {
  const buildConnectionConfig = (credentials: TLdapCredentialRotationCredentials): TLdapConnectionConfig => ({
    method: LdapConnectionMethod.SimpleBind as const,
    app: connection.app as TLdapConnectionConfig["app"],
    credentials,
    gatewayId: connection.gatewayId ?? null,
    gatewayPoolId: connection.gatewayPoolId ?? null,
    orgId: connection.orgId
  });

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
    const connectionConfig = buildConnectionConfig(ldapCredentials);

    const strategyConfig: TLdapStrategyConfig = { provider: ldapCredentials.provider };

    const newPassword = generatePassword();

    const referredUrl = await modifyLdapPassword(connectionConfig, newPassword, connection.name, services);

    const updatedCredentials = {
      ...ldapCredentials,
      password: newPassword
    };

    const verifyConfig = buildConnectionConfig(updatedCredentials);

    try {
      await verifyLdapCredentials(verifyConfig, services, referredUrl);
    } catch (verifyError) {
      logger.error(
        verifyError,
        `credentialRotation: LDAP verification failed after password change, attempting revert [connection=${connection.name}]`
      );
      try {
        const revertConfig = buildConnectionConfig(updatedCredentials);
        await modifyLdapPassword(revertConfig, ldapCredentials.password, connection.name, services);
        logger.info(`credentialRotation: LDAP password reverted successfully [connection=${connection.name}]`);
      } catch (revertError) {
        logger.error(
          revertError,
          `credentialRotation: LDAP password revert failed -- connection may require manual repair [connection=${connection.name}]`
        );
      }
      throw verifyError;
    }

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
    const connectionConfig = buildConnectionConfig(ldapCredentials);

    const newPassword = generatePassword();

    const referredUrl = await modifyLdapPassword(connectionConfig, newPassword, connection.name, services);

    const updatedCredentials = { ...ldapCredentials, password: newPassword };
    const verifyConfig = buildConnectionConfig(updatedCredentials);

    try {
      await verifyLdapCredentials(verifyConfig, services, referredUrl);
    } catch (verifyError) {
      logger.error(
        verifyError,
        `credentialRotation: LDAP verification failed after password change, attempting revert [connection=${connection.name}]`
      );
      try {
        const revertConfig = buildConnectionConfig(updatedCredentials);
        await modifyLdapPassword(revertConfig, ldapCredentials.password, connection.name, services);
        logger.info(`credentialRotation: LDAP password reverted successfully [connection=${connection.name}]`);
      } catch (revertError) {
        logger.error(
          revertError,
          `credentialRotation: LDAP password revert failed -- connection may require manual repair [connection=${connection.name}]`
        );
      }
      throw verifyError;
    }

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
