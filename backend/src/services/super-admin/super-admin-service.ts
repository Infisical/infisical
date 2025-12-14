import { CronJob } from "cron";

import {
  AccessScope,
  IdentityAuthMethod,
  OrgMembershipRole,
  OrgMembershipStatus,
  TSuperAdmin,
  TSuperAdminUpdate,
  TUsers
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import {
  getConfig,
  getOriginalConfig,
  overrideEnvConfig,
  overwriteSchema,
  validateOverrides
} from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { isDisposableEmail } from "@app/lib/validator";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { ActorType, AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityTokenAuthDALFactory } from "../identity-token-auth/identity-token-auth-dal";
import { KMS_ROOT_CONFIG_UUID } from "../kms/kms-fns";
import { TKmsRootConfigDALFactory } from "../kms/kms-root-config-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { RootKeyEncryptionStrategy } from "../kms/kms-types";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TMicrosoftTeamsServiceFactory } from "../microsoft-teams/microsoft-teams-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { TInvalidateCacheQueueFactory } from "./invalidate-cache-queue";
import { TSuperAdminDALFactory } from "./super-admin-dal";
import {
  CacheType,
  EnvOverrides,
  LoginMethod,
  TAdminBootstrapInstanceDTO,
  TAdminGetIdentitiesDTO,
  TAdminGetUsersDTO,
  TAdminIntegrationConfig,
  TAdminSignUpDTO,
  TCreateOrganizationDTO,
  TGetOrganizationsDTO,
  TResendOrgInviteDTO
} from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityTokenAuthDAL: TIdentityTokenAuthDALFactory;
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  orgDAL: TOrgDALFactory;
  serverCfgDAL: TSuperAdminDALFactory;
  userDAL: TUserDALFactory;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne">;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey" | "updateEncryptionStrategy">;
  kmsRootConfigDAL: TKmsRootConfigDALFactory;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem" | "deleteItems">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures" | "updateSubscriptionOrgMemberCount">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "initializeTeamsBot">;
  invalidateCacheQueue: TInvalidateCacheQueueFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  tokenService: TAuthTokenServiceFactory;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

// eslint-disable-next-line
export let getServerCfg: () => Promise<
  TSuperAdmin & {
    defaultAuthOrgSlug: string | null;
    defaultAuthOrgAuthEnforced?: boolean | null;
    defaultAuthOrgAuthMethod?: string | null;
  }
>;

let adminIntegrationsConfig: TAdminIntegrationConfig = {
  slack: {
    clientSecret: "",
    clientId: ""
  },
  microsoftTeams: {
    appId: "",
    clientSecret: "",
    botId: ""
  },
  gitHubAppConnection: {
    clientId: "",
    clientSecret: "",
    appSlug: "",
    appId: "",
    privateKey: ""
  }
};

Object.freeze(adminIntegrationsConfig);

export const getInstanceIntegrationsConfig = () => {
  return adminIntegrationsConfig;
};

const ADMIN_CONFIG_KEY = "infisical-admin-cfg";
const ADMIN_CONFIG_KEY_EXP = 60; // 60s
export const ADMIN_CONFIG_DB_UUID = "00000000-0000-0000-0000-000000000000";

export const superAdminServiceFactory = ({
  serverCfgDAL,
  userDAL,
  identityDAL,
  orgDAL,
  userAliasDAL,
  authService,
  orgService,
  keyStore,
  kmsRootConfigDAL,
  kmsService,
  licenseService,
  identityAccessTokenDAL,
  identityTokenAuthDAL,
  microsoftTeamsService,
  invalidateCacheQueue,
  smtpService,
  tokenService,
  membershipIdentityDAL,
  membershipUserDAL,
  membershipRoleDAL
}: TSuperAdminServiceFactoryDep) => {
  const initServerCfg = async () => {
    // TODO(akhilmhdh): bad  pattern time less change this later to me itself
    getServerCfg = async () => {
      const config = await keyStore.getItem(ADMIN_CONFIG_KEY);

      // missing in keystore means fetch from db
      if (!config) {
        const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

        if (!serverCfg) {
          throw new NotFoundError({ message: "Admin config not found" });
        }

        await keyStore.setItemWithExpiry(ADMIN_CONFIG_KEY, ADMIN_CONFIG_KEY_EXP, JSON.stringify(serverCfg)); // insert it back to keystore
        return serverCfg;
      }

      const keyStoreServerCfg = JSON.parse(config) as TSuperAdmin & { defaultAuthOrgSlug: string | null };
      return {
        ...keyStoreServerCfg,
        // this is to allow admin router to work
        createdAt: new Date(keyStoreServerCfg.createdAt),
        updatedAt: new Date(keyStoreServerCfg.updatedAt)
      };
    };

    // reset on initialized
    await keyStore.deleteItem(ADMIN_CONFIG_KEY);
    const serverCfg = await serverCfgDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SuperAdminInit]);
      const serverCfgInDB = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
      if (serverCfgInDB) return serverCfgInDB;

      const newCfg = await serverCfgDAL.create({
        // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
        id: ADMIN_CONFIG_DB_UUID,
        fipsEnabled: crypto.isFipsModeEnabled(),
        initialized: false,
        allowSignUp: true,
        defaultAuthOrgId: null
      });
      return newCfg;
    });
    return serverCfg;
  };

  const getAdminIntegrationsConfig = async () => {
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

    if (!serverCfg) {
      throw new NotFoundError({ name: "AdminConfig", message: "Admin config not found" });
    }

    const decrypt = kmsService.decryptWithRootKey();

    const slackClientId = serverCfg.encryptedSlackClientId ? decrypt(serverCfg.encryptedSlackClientId).toString() : "";
    const slackClientSecret = serverCfg.encryptedSlackClientSecret
      ? decrypt(serverCfg.encryptedSlackClientSecret).toString()
      : "";

    const microsoftAppId = serverCfg.encryptedMicrosoftTeamsAppId
      ? decrypt(serverCfg.encryptedMicrosoftTeamsAppId).toString()
      : "";
    const microsoftClientSecret = serverCfg.encryptedMicrosoftTeamsClientSecret
      ? decrypt(serverCfg.encryptedMicrosoftTeamsClientSecret).toString()
      : "";
    const microsoftBotId = serverCfg.encryptedMicrosoftTeamsBotId
      ? decrypt(serverCfg.encryptedMicrosoftTeamsBotId).toString()
      : "";

    const gitHubAppConnectionClientId = serverCfg.encryptedGitHubAppConnectionClientId
      ? decrypt(serverCfg.encryptedGitHubAppConnectionClientId).toString()
      : "";
    const gitHubAppConnectionClientSecret = serverCfg.encryptedGitHubAppConnectionClientSecret
      ? decrypt(serverCfg.encryptedGitHubAppConnectionClientSecret).toString()
      : "";

    const gitHubAppConnectionAppSlug = serverCfg.encryptedGitHubAppConnectionSlug
      ? decrypt(serverCfg.encryptedGitHubAppConnectionSlug).toString()
      : "";

    const gitHubAppConnectionAppId = serverCfg.encryptedGitHubAppConnectionId
      ? decrypt(serverCfg.encryptedGitHubAppConnectionId).toString()
      : "";
    const gitHubAppConnectionAppPrivateKey = serverCfg.encryptedGitHubAppConnectionPrivateKey
      ? decrypt(serverCfg.encryptedGitHubAppConnectionPrivateKey).toString()
      : "";

    const appCfg = getConfig();

    return {
      slack: {
        clientSecret: slackClientSecret,
        clientId: slackClientId,
        govEnabled: appCfg.WORKFLOW_SLACK_GOV_ENABLED
      },
      microsoftTeams: {
        appId: microsoftAppId,
        clientSecret: microsoftClientSecret,
        botId: microsoftBotId
      },
      gitHubAppConnection: {
        clientId: gitHubAppConnectionClientId,
        clientSecret: gitHubAppConnectionClientSecret,
        appSlug: gitHubAppConnectionAppSlug,
        appId: gitHubAppConnectionAppId,
        privateKey: gitHubAppConnectionAppPrivateKey
      }
    };
  };

  const $syncAdminIntegrationConfig = async () => {
    const config = await getAdminIntegrationsConfig();
    Object.freeze(config);
    adminIntegrationsConfig = config;
  };

  const getEnvOverrides = async () => {
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

    if (!serverCfg || !serverCfg.encryptedEnvOverrides) {
      return {};
    }

    const decrypt = kmsService.decryptWithRootKey();

    const overrides = JSON.parse(decrypt(serverCfg.encryptedEnvOverrides).toString()) as Record<string, string>;

    return overrides;
  };

  const getEnvOverridesOrganized = async (): Promise<EnvOverrides> => {
    const overrides = await getEnvOverrides();
    const ogConfig = getOriginalConfig();

    return Object.fromEntries(
      Object.entries(overwriteSchema).map(([groupKey, groupDef]) => [
        groupKey,
        {
          name: groupDef.name,
          fields: groupDef.fields.map(({ key, description }) => ({
            key,
            description,
            value: overrides[key] || "",
            hasEnvEntry: !!(ogConfig as unknown as Record<string, string | undefined>)[key]
          }))
        }
      ])
    );
  };

  const $syncEnvConfig = async () => {
    const config = await getEnvOverrides();

    overrideEnvConfig(config);
  };

  const updateServerCfg = async (
    data: TSuperAdminUpdate & {
      slackClientId?: string;
      slackClientSecret?: string;
      microsoftTeamsAppId?: string;
      microsoftTeamsClientSecret?: string;
      microsoftTeamsBotId?: string;
      gitHubAppConnectionClientId?: string;
      gitHubAppConnectionClientSecret?: string;
      gitHubAppConnectionSlug?: string;
      gitHubAppConnectionId?: string;
      gitHubAppConnectionPrivateKey?: string;
      envOverrides?: Record<string, string>;
    },
    userId: string
  ) => {
    const updatedData = data;

    if (data.enabledLoginMethods) {
      const superAdminUser = await userDAL.findById(userId);
      const isSamlConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.SAML
        })
      );

      // We do not store SAML and OIDC auth values in the user authMethods field
      // and so we infer its usage from the user's aliases
      const isUserSamlAccessEnabled = isSamlConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.SAML);
      const isOidcConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.OIDC
        })
      );

      const isUserOidcAccessEnabled = isOidcConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.OIDC);

      const loginMethodToAuthMethod = {
        [LoginMethod.EMAIL]: [AuthMethod.EMAIL],
        [LoginMethod.GOOGLE]: [AuthMethod.GOOGLE],
        [LoginMethod.GITLAB]: [AuthMethod.GITLAB],
        [LoginMethod.GITHUB]: [AuthMethod.GITHUB],
        [LoginMethod.LDAP]: [AuthMethod.LDAP],
        [LoginMethod.SAML]: [],
        [LoginMethod.OIDC]: []
      };

      const canServerAdminAccessAfterApply =
        data.enabledLoginMethods.some((loginMethod) =>
          loginMethodToAuthMethod[loginMethod as LoginMethod].some((authMethod) =>
            superAdminUser.authMethods?.includes(authMethod)
          )
        ) ||
        isUserSamlAccessEnabled ||
        isUserOidcAccessEnabled;

      if (!canServerAdminAccessAfterApply) {
        throw new BadRequestError({
          message: "You must configure at least one auth method to prevent account lockout"
        });
      }
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    if (data.slackClientId) {
      const encryptedClientId = encryptWithRoot(Buffer.from(data.slackClientId));

      updatedData.encryptedSlackClientId = encryptedClientId;
      updatedData.slackClientId = undefined;
    }

    if (data.slackClientSecret) {
      const encryptedClientSecret = encryptWithRoot(Buffer.from(data.slackClientSecret));

      updatedData.encryptedSlackClientSecret = encryptedClientSecret;
      updatedData.slackClientSecret = undefined;
    }

    let microsoftTeamsSettingsUpdated = false;
    if (data.microsoftTeamsAppId) {
      const encryptedClientId = encryptWithRoot(Buffer.from(data.microsoftTeamsAppId));

      updatedData.encryptedMicrosoftTeamsAppId = encryptedClientId;
      updatedData.microsoftTeamsAppId = undefined;
      microsoftTeamsSettingsUpdated = true;
    }

    if (data.microsoftTeamsClientSecret) {
      const encryptedClientSecret = encryptWithRoot(Buffer.from(data.microsoftTeamsClientSecret));

      updatedData.encryptedMicrosoftTeamsClientSecret = encryptedClientSecret;
      updatedData.microsoftTeamsClientSecret = undefined;
      microsoftTeamsSettingsUpdated = true;
    }

    if (data.microsoftTeamsBotId) {
      const encryptedBotId = encryptWithRoot(Buffer.from(data.microsoftTeamsBotId));

      updatedData.encryptedMicrosoftTeamsBotId = encryptedBotId;
      updatedData.microsoftTeamsBotId = undefined;
      microsoftTeamsSettingsUpdated = true;
    }

    let gitHubAppConnectionSettingsUpdated = false;
    if (data.gitHubAppConnectionClientId !== undefined) {
      const encryptedClientId = encryptWithRoot(Buffer.from(data.gitHubAppConnectionClientId));
      updatedData.encryptedGitHubAppConnectionClientId = encryptedClientId;
      updatedData.gitHubAppConnectionClientId = undefined;
      gitHubAppConnectionSettingsUpdated = true;
    }

    if (data.gitHubAppConnectionClientSecret !== undefined) {
      const encryptedClientSecret = encryptWithRoot(Buffer.from(data.gitHubAppConnectionClientSecret));
      updatedData.encryptedGitHubAppConnectionClientSecret = encryptedClientSecret;
      updatedData.gitHubAppConnectionClientSecret = undefined;
      gitHubAppConnectionSettingsUpdated = true;
    }

    if (data.gitHubAppConnectionSlug !== undefined) {
      const encryptedAppSlug = encryptWithRoot(Buffer.from(data.gitHubAppConnectionSlug));
      updatedData.encryptedGitHubAppConnectionSlug = encryptedAppSlug;
      updatedData.gitHubAppConnectionSlug = undefined;
      gitHubAppConnectionSettingsUpdated = true;
    }

    if (data.gitHubAppConnectionId !== undefined) {
      const encryptedAppId = encryptWithRoot(Buffer.from(data.gitHubAppConnectionId));
      updatedData.encryptedGitHubAppConnectionId = encryptedAppId;
      updatedData.gitHubAppConnectionId = undefined;
      gitHubAppConnectionSettingsUpdated = true;
    }

    if (data.gitHubAppConnectionPrivateKey !== undefined) {
      const encryptedAppPrivateKey = encryptWithRoot(Buffer.from(data.gitHubAppConnectionPrivateKey));
      updatedData.encryptedGitHubAppConnectionPrivateKey = encryptedAppPrivateKey;
      updatedData.gitHubAppConnectionPrivateKey = undefined;
      gitHubAppConnectionSettingsUpdated = true;
    }

    let envOverridesUpdated = false;
    if (data.envOverrides !== undefined) {
      // Verify input format
      validateOverrides(data.envOverrides);

      const encryptedEnvOverrides = encryptWithRoot(Buffer.from(JSON.stringify(data.envOverrides)));
      updatedData.encryptedEnvOverrides = encryptedEnvOverrides;
      updatedData.envOverrides = undefined;
      envOverridesUpdated = true;
    }

    const updatedServerCfg = await serverCfgDAL.updateById(ADMIN_CONFIG_DB_UUID, updatedData);

    await keyStore.setItemWithExpiry(ADMIN_CONFIG_KEY, ADMIN_CONFIG_KEY_EXP, JSON.stringify(updatedServerCfg));

    if (gitHubAppConnectionSettingsUpdated) {
      await $syncAdminIntegrationConfig();
    }

    if (envOverridesUpdated) {
      await $syncEnvConfig();
    }

    if (
      updatedServerCfg.encryptedMicrosoftTeamsAppId &&
      updatedServerCfg.encryptedMicrosoftTeamsClientSecret &&
      updatedServerCfg.encryptedMicrosoftTeamsBotId &&
      microsoftTeamsSettingsUpdated
    ) {
      const decryptWithRoot = kmsService.decryptWithRootKey();
      decryptWithRoot(updatedServerCfg.encryptedMicrosoftTeamsBotId); // validate that we're able to decrypt the bot ID
      const decryptedAppId = decryptWithRoot(updatedServerCfg.encryptedMicrosoftTeamsAppId);
      const decryptedAppPassword = decryptWithRoot(updatedServerCfg.encryptedMicrosoftTeamsClientSecret);

      await microsoftTeamsService.initializeTeamsBot({
        botAppId: decryptedAppId.toString(),
        botAppPassword: decryptedAppPassword.toString(),
        lastUpdatedAt: updatedServerCfg.updatedAt
      });
    }

    return updatedServerCfg;
  };

  const adminSignUp = async ({ lastName, firstName, email, password, ip, userAgent }: TAdminSignUpDTO) => {
    const appCfg = getConfig();

    const sanitizedEmail = email.trim().toLowerCase();
    const existingUser = await userDAL.findOne({ username: sanitizedEmail });
    if (existingUser) throw new BadRequestError({ name: "Admin sign up", message: "User already exists" });

    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);

    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName,
          lastName,
          username: sanitizedEmail,
          email: sanitizedEmail,
          superAdmin: true,
          isGhost: false,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL],
          isEmailVerified: true
        },
        tx
      );
      const userEnc = await userDAL.createUserEncryption(
        {
          encryptionVersion: 2,
          userId: newUser.id,
          hashedPassword
        },
        tx
      );

      return { user: newUser, enc: userEnc };
    });

    const initialOrganizationName = appCfg.INITIAL_ORGANIZATION_NAME ?? "Admin Org";

    const organization = await orgService.createOrganization({
      userId: userInfo.user.id,
      userEmail: userInfo.user.email,
      orgName: initialOrganizationName
    });

    await updateServerCfg({ initialized: true }, userInfo.user.id);
    const token = await authService.generateUserTokens({
      user: userInfo.user,
      authMethod: AuthMethod.EMAIL,
      ip,
      userAgent,
      organizationId: undefined
    });
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo, organization };
  };

  const bootstrapInstance = async ({ email, password, organizationName }: TAdminBootstrapInstanceDTO) => {
    const appCfg = getConfig();
    const sanitizedEmail = email.trim().toLowerCase();
    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (serverCfg?.initialized) {
      throw new BadRequestError({ message: "Instance has already been set up" });
    }

    const existingUser = await userDAL.findOne({ email: sanitizedEmail });
    if (existingUser) throw new BadRequestError({ name: "Instance initialization", message: "User already exists" });

    const userInfo = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          firstName: "Admin",
          lastName: "User",
          username: sanitizedEmail,
          email: sanitizedEmail,
          superAdmin: true,
          isGhost: false,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL],
          isEmailVerified: true
        },
        tx
      );

      const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);

      const userEnc = await userDAL.createUserEncryption(
        {
          userId: newUser.id,
          encryptionVersion: 2,
          hashedPassword
        },
        tx
      );

      return { user: newUser, enc: userEnc };
    });

    const initialOrganizationName = organizationName ?? "Admin Org";

    const organization = await orgService.createOrganization({
      userId: userInfo.user.id,
      userEmail: userInfo.user.email,
      orgName: initialOrganizationName
    });

    const { identity, credentials } = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name: "Instance Admin Identity", orgId: organization.id }, tx);
      const membership = await membershipIdentityDAL.create(
        {
          actorIdentityId: newIdentity.id,
          scopeOrgId: organization.id,
          scope: AccessScope.Organization
        },
        tx
      );
      await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );

      const tokenAuth = await identityTokenAuthDAL.create(
        {
          identityId: newIdentity.id,
          accessTokenMaxTTL: 0,
          accessTokenTTL: 0,
          accessTokenNumUsesLimit: 0,
          accessTokenTrustedIps: JSON.stringify([
            {
              type: "ipv4",
              prefix: 0,
              ipAddress: "0.0.0.0"
            },
            {
              type: "ipv6",
              prefix: 0,
              ipAddress: "::"
            }
          ])
        },
        tx
      );

      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: newIdentity.id,
          isAccessTokenRevoked: false,
          accessTokenTTL: tokenAuth.accessTokenTTL,
          accessTokenMaxTTL: tokenAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: tokenAuth.accessTokenNumUsesLimit,
          name: "Instance Admin Token",
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          subOrganizationId: organization.id
        },
        tx
      );

      const generatedAccessToken = crypto.jwt().sign(
        {
          identityId: newIdentity.id,
          identityAccessTokenId: newToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET
      );

      return { identity: newIdentity, auth: tokenAuth, credentials: { token: generatedAccessToken } };
    });

    await updateServerCfg({ initialized: true, adminIdentityIds: [identity.id] }, userInfo.user.id);

    return {
      user: userInfo,
      organization,
      machineIdentity: {
        ...identity,
        credentials
      }
    };
  };

  const getUsers = ({ offset, limit, searchTerm, adminsOnly }: TAdminGetUsersDTO) => {
    return userDAL.getUsersByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "username",
      adminsOnly
    });
  };

  const deleteUser = async (userId: string) => {
    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.length === 1 && superAdmins[0].id === userId) {
      throw new BadRequestError({
        message: "Cannot delete the only server admin on this instance. Add another server admin to delete this user."
      });
    }

    const user = await userDAL.deleteById(userId);
    return user;
  };

  const deleteUsers = async (userIds: string[]) => {
    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.every((superAdmin) => userIds.includes(superAdmin.id))) {
      throw new BadRequestError({
        message: "Instance must have at least one server admin. Add another server admin to delete these users."
      });
    }

    const users = await userDAL.delete({
      $in: {
        id: userIds
      }
    });
    return users;
  };

  const deleteIdentitySuperAdminAccess = async (identityId: string, actorId: string) => {
    const identity = await identityDAL.findById(identityId);
    if (!identity) {
      throw new NotFoundError({ name: "Identity", message: "Identity not found" });
    }

    const currentAdminIdentityIds = (await getServerCfg()).adminIdentityIds ?? [];
    if (!currentAdminIdentityIds?.includes(identityId)) {
      throw new BadRequestError({ name: "Identity", message: "Identity does not have super admin access" });
    }

    await updateServerCfg({ adminIdentityIds: currentAdminIdentityIds.filter((id) => id !== identityId) }, actorId);

    return identity;
  };

  const deleteUserSuperAdminAccess = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) {
      throw new NotFoundError({ name: "User", message: "User not found" });
    }

    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.length === 1 && superAdmins[0].id === userId) {
      throw new BadRequestError({
        message:
          "Cannot remove the only server admin on this instance. Add another server admin to remove status for this user."
      });
    }

    const updatedUser = userDAL.updateById(userId, { superAdmin: false });

    return updatedUser;
  };

  const getOrganizations = async ({ offset, limit, searchTerm }: TGetOrganizationsDTO) => {
    return orgDAL.findOrganizationsByFilter({
      offset,
      searchTerm,
      sortBy: "name",
      limit
    });
  };

  const createOrganization = async (
    { name, inviteAdminEmails: emails }: TCreateOrganizationDTO,
    actor: OrgServiceActor
  ) => {
    const appCfg = getConfig();

    const inviteAdminEmails = [...new Set(emails)];

    if (!appCfg.isDevelopmentMode && appCfg.isCloud)
      throw new BadRequestError({ message: "This endpoint is not supported for cloud instances" });

    const serverAdmin = await userDAL.findById(actor.id);
    const plan = licenseService.onPremFeatures;

    const isEmailInvalid = await isDisposableEmail(inviteAdminEmails);
    if (isEmailInvalid) {
      throw new BadRequestError({
        message: "Disposable emails are not allowed",
        name: "InviteUser"
      });
    }

    const { organization, users: usersToEmail } = await orgDAL.transaction(async (tx) => {
      const org = await orgService.createOrganization(
        {
          orgName: name,
          userEmail: serverAdmin?.email ?? serverAdmin?.username // identities can be server admins so we can't require this
        },
        tx
      );

      const users: Pick<TUsers, "id" | "firstName" | "lastName" | "email" | "username" | "isAccepted">[] = [];

      for await (const inviteeEmail of inviteAdminEmails) {
        const usersByUsername = await userDAL.findUserByUsername(inviteeEmail, tx);
        let inviteeUser =
          usersByUsername?.length > 1
            ? usersByUsername.find((el) => el.username === inviteeEmail)
            : usersByUsername?.[0];

        // if the user doesn't exist we create the user with the email
        if (!inviteeUser) {
          // TODO(carlos): will be removed once the function receives usernames instead of emails
          const usersByEmail = await userDAL.findUserByEmail(inviteeEmail, tx);
          if (usersByEmail?.length === 1) {
            [inviteeUser] = usersByEmail;
          } else {
            inviteeUser = await userDAL.create(
              {
                isAccepted: false,
                email: inviteeEmail,
                username: inviteeEmail,
                authMethods: [AuthMethod.EMAIL],
                isGhost: false
              },
              tx
            );
          }
        }

        const inviteeUserId = inviteeUser?.id;
        const existingEncryptionKey = await userDAL.findUserEncKeyByUserId(inviteeUserId, tx);

        // when user is missing the encrytion keys
        // this could happen either if user doesn't exist or user didn't find step 3 of generating the encryption keys of srp
        // So what we do is we generate a random secure password and then encrypt it with a random pub-private key
        // Then when user sign in (as login is not possible as isAccepted is false) we rencrypt the private key with the user password
        if (!inviteeUser || (inviteeUser && !inviteeUser?.isAccepted && !existingEncryptionKey)) {
          await userDAL.createUserEncryption(
            {
              userId: inviteeUserId,
              encryptionVersion: 2
            },
            tx
          );
        }

        if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
          // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
          throw new BadRequestError({
            name: "InviteUser",
            message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
          });
        }

        const membership = await orgDAL.createMembership(
          {
            actorUserId: inviteeUser.id,
            scope: AccessScope.Organization,
            inviteEmail: inviteeEmail,
            scopeOrgId: org.id,
            status: inviteeUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited,
            isActive: true
          },
          tx
        );

        await membershipRoleDAL.create(
          {
            membershipId: membership.id,
            role: OrgMembershipRole.Admin
          },
          tx
        );

        users.push(inviteeUser);
      }

      return { organization: org, users };
    });

    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

    await Promise.allSettled(
      usersToEmail.map(async (user) => {
        if (!user.email) return;

        if (user.isAccepted) {
          return smtpService.sendMail({
            template: SmtpTemplates.OrgAssignment,
            subjectLine: "You've been added to an Infisical organization",
            recipients: [user.email],
            substitutions: {
              inviterFirstName: serverAdmin?.firstName,
              inviterUsername: serverAdmin?.email,
              organizationName: organization.name,
              email: user.email,
              organizationId: organization.id,
              callback_url: `${appCfg.SITE_URL}/login?org_id=${organization.id}`
            }
          });
        }

        // new user, send regular invite

        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: user.id,
          orgId: organization.id
        });

        return smtpService.sendMail({
          template: SmtpTemplates.OrgInvite,
          subjectLine: "Infisical organization invitation",
          recipients: [user.email],
          substitutions: {
            inviterFirstName: serverAdmin?.firstName,
            inviterUsername: serverAdmin?.email,
            organizationName: organization.name,
            email: user.email,
            organizationId: organization.id,
            token,
            callback_url: `${appCfg.SITE_URL}/signupinvite`
          }
        });
      })
    );

    return organization;
  };

  const deleteOrganization = async (organizationId: string) => {
    const organization = await orgDAL.deleteById(organizationId);
    return organization;
  };

  const deleteOrganizationMembership = async (
    organizationId: string,
    membershipId: string,
    actorId: string,
    actorType: ActorType
  ) => {
    if (actorType === ActorType.USER) {
      const orgMembership = await membershipUserDAL.findOne({
        scope: AccessScope.Organization,
        id: membershipId,
        scopeOrgId: organizationId
      });
      if (!orgMembership) {
        throw new NotFoundError({ name: "Organization Membership", message: "Organization membership not found" });
      }

      if (orgMembership.actorUserId === actorId) {
        throw new BadRequestError({
          message: "You cannot remove yourself from the organization from the instance management panel."
        });
      }
    }

    const membershipRole = await membershipRoleDAL.findOne({ membershipId });
    if (!membershipRole) {
      throw new NotFoundError({ name: "Membership Role", message: "Membership role not found" });
    }
    const [organizationMembership] = await membershipUserDAL.delete({
      scopeOrgId: organizationId,
      scope: AccessScope.Organization,
      id: membershipId
    });
    return { ...organizationMembership, role: membershipRole.role, orgId: organizationId };
  };

  const joinOrganization = async (orgId: string, actor: OrgServiceActor) => {
    const serverAdmin = await userDAL.findById(actor.id);

    if (!serverAdmin) {
      throw new NotFoundError({ message: "Could not find server admin user" });
    }

    const org = await orgDAL.findById(orgId);

    if (!org) {
      throw new NotFoundError({ message: `Could not organization with ID "${orgId}"` });
    }

    const existingOrgMembership = await membershipUserDAL.findOne({
      actorUserId: serverAdmin.id,
      scopeOrgId: org.id,
      scope: AccessScope.Organization
    });

    if (existingOrgMembership) {
      throw new BadRequestError({ message: `You are already a part of the organization with ID ${orgId}` });
    }

    const orgMembership = await orgDAL.transaction(async (tx) => {
      const membership = await orgDAL.createMembership(
        {
          actorUserId: serverAdmin.id,
          scopeOrgId: org.id,
          status: OrgMembershipStatus.Accepted,
          isActive: true,
          scope: AccessScope.Organization
        },
        tx
      );
      const membershipRole = await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );
      return { ...membership, role: membershipRole.role, orgId: org.id };
    });

    return orgMembership;
  };

  const resendOrgInvite = async ({ organizationId, membershipId }: TResendOrgInviteDTO, actor: OrgServiceActor) => {
    const orgMembership = await membershipUserDAL.findOne({
      id: membershipId,
      scopeOrgId: organizationId,
      scope: AccessScope.Organization
    });

    if (!orgMembership) {
      throw new NotFoundError({ name: "Organization Membership", message: "Organization membership not found" });
    }

    if (orgMembership.status === OrgMembershipStatus.Accepted) {
      throw new BadRequestError({
        message: "This user has already accepted their invitation."
      });
    }

    if (!orgMembership.actorUserId) {
      throw new NotFoundError({ message: "Cannot find user associated with Org Membership." });
    }

    if (!orgMembership.inviteEmail) {
      throw new BadRequestError({ message: "No invite email associated with user." });
    }

    const org = await orgDAL.findOrgById(orgMembership.scopeOrgId);

    const appCfg = getConfig();
    const serverAdmin = await userDAL.findById(actor.id);

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: orgMembership.actorUserId,
      orgId: orgMembership.scopeOrgId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.OrgInvite,
      subjectLine: "Infisical organization invitation",
      recipients: [orgMembership.inviteEmail],
      substitutions: {
        inviterFirstName: serverAdmin?.firstName,
        inviterUsername: serverAdmin?.email,
        organizationName: org?.name,
        email: orgMembership.inviteEmail,
        organizationId: orgMembership.scopeOrgId,
        token,
        callback_url: `${appCfg.SITE_URL}/signupinvite`
      }
    });

    return { ...orgMembership, orgId: organizationId, role: "" };
  };

  const getIdentities = async ({ offset, limit, searchTerm }: TAdminGetIdentitiesDTO) => {
    const result = await identityDAL.getIdentitiesByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "name"
    });
    const serverCfg = await getServerCfg();

    return {
      identities: result.identities.map((identity) => ({
        ...identity,
        isInstanceAdmin: Boolean(serverCfg?.adminIdentityIds?.includes(identity.id))
      })),
      total: result.total
    };
  };

  const grantServerAdminAccessToUser = async (userId: string) => {
    if (!licenseService.onPremFeatures?.instanceUserManagement) {
      throw new BadRequestError({
        message: "Failed to grant server admin access to user due to plan restriction. Upgrade to Infisical's Pro plan."
      });
    }
    await userDAL.updateById(userId, { superAdmin: true });
  };

  const getConfiguredEncryptionStrategies = async () => {
    const appCfg = getConfig();

    const kmsRootCfg = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);

    if (!kmsRootCfg) {
      throw new NotFoundError({ name: "KmsRootConfig", message: "KMS root configuration not found" });
    }

    const selectedStrategy = kmsRootCfg.encryptionStrategy;
    const enabledStrategies: { enabled: boolean; strategy: RootKeyEncryptionStrategy }[] = [];

    if (appCfg.ROOT_ENCRYPTION_KEY || appCfg.ENCRYPTION_KEY) {
      const basicStrategy = RootKeyEncryptionStrategy.Software;

      enabledStrategies.push({
        enabled: selectedStrategy === basicStrategy,
        strategy: basicStrategy
      });
    }
    if (appCfg.isHsmConfigured) {
      const hsmStrategy = RootKeyEncryptionStrategy.HSM;

      enabledStrategies.push({
        enabled: selectedStrategy === hsmStrategy,
        strategy: hsmStrategy
      });
    }

    return {
      strategies: enabledStrategies
    };
  };

  const updateRootEncryptionStrategy = async (strategy: RootKeyEncryptionStrategy) => {
    if (!licenseService.onPremFeatures.hsm) {
      throw new BadRequestError({
        message: "Failed to update encryption strategy due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const configuredStrategies = await getConfiguredEncryptionStrategies();

    const foundStrategy = configuredStrategies.strategies.find((s) => s.strategy === strategy);

    if (!foundStrategy) {
      throw new BadRequestError({ message: "Invalid encryption strategy" });
    }

    if (foundStrategy.enabled) {
      throw new BadRequestError({ message: "The selected encryption strategy is already enabled" });
    }

    await kmsService.updateEncryptionStrategy(strategy);
  };

  const invalidateCache = async (type: CacheType) => {
    await invalidateCacheQueue.startInvalidate({
      data: { type }
    });
  };

  const checkIfInvalidatingCache = async () => {
    return (await keyStore.getItem("invalidating-cache")) !== null;
  };

  const initializeAdminIntegrationConfigSync = async () => {
    logger.info("Setting up background sync process for admin integrations config");

    // initial sync upon startup
    await $syncAdminIntegrationConfig();

    // sync admin integrations config every 5 minutes
    const job = new CronJob("*/5 * * * *", $syncAdminIntegrationConfig);
    job.start();

    return job;
  };

  const initializeEnvConfigSync = async () => {
    logger.info("Setting up background sync process for environment overrides");

    await $syncEnvConfig();

    // sync every 5 minutes
    const job = new CronJob("*/5 * * * *", $syncEnvConfig);
    job.start();

    return job;
  };

  return {
    initServerCfg,
    updateServerCfg,
    adminSignUp,
    bootstrapInstance,
    getUsers,
    deleteUser,
    getIdentities,
    getAdminIntegrationsConfig,
    updateRootEncryptionStrategy,
    getConfiguredEncryptionStrategies,
    grantServerAdminAccessToUser,
    deleteIdentitySuperAdminAccess,
    deleteUserSuperAdminAccess,
    invalidateCache,
    checkIfInvalidatingCache,
    getOrganizations,
    deleteOrganization,
    deleteOrganizationMembership,
    initializeAdminIntegrationConfigSync,
    initializeEnvConfigSync,
    getEnvOverrides,
    getEnvOverridesOrganized,
    deleteUsers,
    createOrganization,
    joinOrganization,
    resendOrgInvite
  };
};
