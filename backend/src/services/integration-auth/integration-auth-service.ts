import { ForbiddenError } from "@casl/ability";
import { Octokit } from "@octokit/rest";
import AWS from "aws-sdk";

import { SecretEncryptionAlgo, SecretKeyEncoding, TIntegrationAuths, TIntegrationAuthsInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { request } from "@app/lib/config/request";
import { decryptSymmetric128BitHexKeyUTF8, encryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TIntegrationDALFactory } from "../integration/integration-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { getApps } from "./integration-app-list";
import { TIntegrationAuthDALFactory } from "./integration-auth-dal";
import {
  TBitbucketWorkspace,
  TChecklyGroups,
  TDeleteIntegrationAuthByIdDTO,
  TDeleteIntegrationAuthsDTO,
  TGetIntegrationAuthDTO,
  TGetIntegrationAuthTeamCityBuildConfigDTO,
  THerokuPipelineCoupling,
  TIntegrationAuthAppsDTO,
  TIntegrationAuthAwsKmsKeyDTO,
  TIntegrationAuthBitbucketWorkspaceDTO,
  TIntegrationAuthChecklyGroupsDTO,
  TIntegrationAuthGithubEnvsDTO,
  TIntegrationAuthGithubOrgsDTO,
  TIntegrationAuthHerokuPipelinesDTO,
  TIntegrationAuthNorthflankSecretGroupDTO,
  TIntegrationAuthQoveryEnvironmentsDTO,
  TIntegrationAuthQoveryOrgsDTO,
  TIntegrationAuthQoveryProjectDTO,
  TIntegrationAuthQoveryScopesDTO,
  TIntegrationAuthRailwayEnvDTO,
  TIntegrationAuthRailwayServicesDTO,
  TIntegrationAuthTeamsDTO,
  TIntegrationAuthVercelBranchesDTO,
  TNorthflankSecretGroup,
  TOauthExchangeDTO,
  TSaveIntegrationAccessTokenDTO,
  TTeamCityBuildConfig,
  TVercelBranches
} from "./integration-auth-types";
import { getIntegrationOptions, Integrations, IntegrationUrls } from "./integration-list";
import { getTeams } from "./integration-team";
import { exchangeCode, exchangeRefresh } from "./integration-token";

type TIntegrationAuthServiceFactoryDep = {
  integrationAuthDAL: TIntegrationAuthDALFactory;
  integrationDAL: Pick<TIntegrationDALFactory, "delete">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TIntegrationAuthServiceFactory = ReturnType<typeof integrationAuthServiceFactory>;

export const integrationAuthServiceFactory = ({
  permissionService,
  integrationAuthDAL,
  integrationDAL,
  projectBotService,
  kmsService
}: TIntegrationAuthServiceFactoryDep) => {
  const listIntegrationAuthByProjectId = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const authorizations = await integrationAuthDAL.find({ projectId });
    return authorizations;
  };

  const getIntegrationAuth = async ({ actor, id, actorId, actorAuthMethod, actorOrgId }: TGetIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    return integrationAuth;
  };

  const oauthExchange = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    integration,
    url,
    code
  }: TOauthExchangeDTO) => {
    if (!Object.values(Integrations).includes(integration as Integrations))
      throw new BadRequestError({ message: "Invalid integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);

    const tokenExchange = await exchangeCode({ integration, code, url });
    const updateDoc: TIntegrationAuthsInsert = {
      projectId,
      integration,
      url: tokenExchange?.url,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.UTF8,
      accessExpiresAt: tokenExchange.accessExpiresAt
    };

    if (integration === Integrations.VERCEL) {
      updateDoc.teamId = tokenExchange.teamId;
    } else if (integration === Integrations.NETLIFY) {
      updateDoc.accountId = tokenExchange.accountId;
    } else if (integration === Integrations.GCP_SECRET_MANAGER) {
      updateDoc.metadata = {
        authMethod: "oauth2"
      };
    }

    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      if (tokenExchange.refreshToken) {
        const refreshEncToken = secretManagerEncryptor({
          plainText: Buffer.from(tokenExchange.refreshToken)
        }).cipherTextBlob;
        updateDoc.encryptedRefresh = refreshEncToken;
      }
      if (tokenExchange.accessToken) {
        const accessToken = secretManagerEncryptor({
          plainText: Buffer.from(tokenExchange.accessToken)
        }).cipherTextBlob;
        updateDoc.encryptedAccess = accessToken;
      }
    } else {
      if (!botKey) throw new BadRequestError({ message: "Bot key not found" });
      if (tokenExchange.refreshToken) {
        const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenExchange.refreshToken, botKey);
        updateDoc.refreshIV = refreshEncToken.iv;
        updateDoc.refreshTag = refreshEncToken.tag;
        updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
      }
      if (tokenExchange.accessToken) {
        const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenExchange.accessToken, botKey);
        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;
      }
    }
    return integrationAuthDAL.transaction(async (tx) => {
      const doc = await integrationAuthDAL.findOne({ projectId, integration }, tx);
      if (!doc) {
        return integrationAuthDAL.create(updateDoc, tx);
      }
      return integrationAuthDAL.updateById(doc.id, updateDoc, tx);
    });
  };

  const saveIntegrationToken = async ({
    projectId,
    refreshToken,
    actorId,
    integration,
    url,
    actor,
    actorOrgId,
    actorAuthMethod,
    accessId,
    namespace,
    accessToken,
    awsAssumeIamRoleArn
  }: TSaveIntegrationAccessTokenDTO) => {
    if (!Object.values(Integrations).includes(integration as Integrations))
      throw new BadRequestError({ message: "Invalid integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);

    const updateDoc: TIntegrationAuthsInsert = {
      projectId,
      namespace,
      integration,
      url,
      algorithm: SecretEncryptionAlgo.AES_256_GCM,
      keyEncoding: SecretKeyEncoding.UTF8,
      ...(integration === Integrations.GCP_SECRET_MANAGER
        ? {
            metadata: {
              authMethod: "serviceAccount"
            }
          }
        : {})
    };

    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      if (refreshToken) {
        const tokenDetails = await exchangeRefresh(
          integration,
          refreshToken,
          url,
          updateDoc.metadata as Record<string, string>
        );
        const refreshEncToken = secretManagerEncryptor({
          plainText: Buffer.from(tokenDetails.refreshToken)
        }).cipherTextBlob;
        updateDoc.encryptedRefresh = refreshEncToken;

        const accessEncToken = secretManagerEncryptor({
          plainText: Buffer.from(tokenDetails.accessToken)
        }).cipherTextBlob;
        updateDoc.encryptedAccess = accessEncToken;
        updateDoc.accessExpiresAt = tokenDetails.accessExpiresAt;
      }

      if (!refreshToken && (accessId || accessToken || awsAssumeIamRoleArn)) {
        if (accessToken) {
          const accessEncToken = secretManagerEncryptor({
            plainText: Buffer.from(accessToken)
          }).cipherTextBlob;
          updateDoc.encryptedAccess = accessEncToken;
        }
        if (accessId) {
          const accessEncToken = secretManagerEncryptor({
            plainText: Buffer.from(accessId)
          }).cipherTextBlob;
          updateDoc.encryptedAccessId = accessEncToken;
        }
        if (awsAssumeIamRoleArn) {
          const awsAssumeIamRoleArnEncrypted = secretManagerEncryptor({
            plainText: Buffer.from(awsAssumeIamRoleArn)
          }).cipherTextBlob;
          updateDoc.encryptedAwsAssumeIamRoleArn = awsAssumeIamRoleArnEncrypted;
        }
      }
    } else {
      if (!botKey) throw new BadRequestError({ message: "Bot key not found" });
      if (refreshToken) {
        const tokenDetails = await exchangeRefresh(
          integration,
          refreshToken,
          url,
          updateDoc.metadata as Record<string, string>
        );
        const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.refreshToken, botKey);
        updateDoc.refreshIV = refreshEncToken.iv;
        updateDoc.refreshTag = refreshEncToken.tag;
        updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
        const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.accessToken, botKey);
        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;

        updateDoc.accessExpiresAt = tokenDetails.accessExpiresAt;
      }

      if (!refreshToken && (accessId || accessToken || awsAssumeIamRoleArn)) {
        if (accessToken) {
          const accessEncToken = encryptSymmetric128BitHexKeyUTF8(accessToken, botKey);
          updateDoc.accessIV = accessEncToken.iv;
          updateDoc.accessTag = accessEncToken.tag;
          updateDoc.accessCiphertext = accessEncToken.ciphertext;
        }
        if (accessId) {
          const accessEncToken = encryptSymmetric128BitHexKeyUTF8(accessId, botKey);
          updateDoc.accessIdIV = accessEncToken.iv;
          updateDoc.accessIdTag = accessEncToken.tag;
          updateDoc.accessIdCiphertext = accessEncToken.ciphertext;
        }
        if (awsAssumeIamRoleArn) {
          const awsAssumeIamRoleArnEnc = encryptSymmetric128BitHexKeyUTF8(awsAssumeIamRoleArn, botKey);
          updateDoc.awsAssumeIamRoleArnCipherText = awsAssumeIamRoleArnEnc.ciphertext;
          updateDoc.awsAssumeIamRoleArnIV = awsAssumeIamRoleArnEnc.iv;
          updateDoc.awsAssumeIamRoleArnTag = awsAssumeIamRoleArnEnc.tag;
        }
      }
    }
    return integrationAuthDAL.create(updateDoc);
  };

  // helper function
  const getIntegrationAccessToken = async (
    integrationAuth: TIntegrationAuths,
    shouldUseSecretV2Bridge: boolean,
    botKey?: string
  ) => {
    let accessToken: string | undefined;
    let accessId: string | undefined;
    // this means its not access token based
    if (
      integrationAuth.integration === Integrations.AWS_SECRET_MANAGER &&
      (shouldUseSecretV2Bridge
        ? integrationAuth.encryptedAwsAssumeIamRoleArn
        : integrationAuth.awsAssumeIamRoleArnCipherText)
    ) {
      return { accessToken: "", accessId: "" };
    }
    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor, encryptor: secretManagerEncryptor } =
        await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: integrationAuth.projectId
        });
      if (integrationAuth.encryptedAccess) {
        accessToken = secretManagerDecryptor({ cipherTextBlob: integrationAuth.encryptedAccess }).toString();
      }

      if (integrationAuth.encryptedRefresh) {
        const refreshToken = secretManagerDecryptor({ cipherTextBlob: integrationAuth.encryptedRefresh }).toString();

        if (integrationAuth.accessExpiresAt && integrationAuth.accessExpiresAt < new Date()) {
          // refer above it contains same logic except not saving
          const tokenDetails = await exchangeRefresh(
            integrationAuth.integration,
            refreshToken,
            integrationAuth?.url,
            integrationAuth.metadata as Record<string, string>
          );
          const encryptedRefresh = secretManagerEncryptor({
            plainText: Buffer.from(tokenDetails.refreshToken)
          }).cipherTextBlob;
          const encryptedAccess = secretManagerEncryptor({
            plainText: Buffer.from(tokenDetails.accessToken)
          }).cipherTextBlob;
          accessToken = tokenDetails.accessToken;
          await integrationAuthDAL.updateById(integrationAuth.id, {
            accessExpiresAt: tokenDetails.accessExpiresAt,
            encryptedRefresh,
            encryptedAccess
          });
        }
      }
      if (!accessToken) throw new BadRequestError({ message: "Missing access token" });

      if (integrationAuth.encryptedAccessId) {
        accessId = secretManagerDecryptor({
          cipherTextBlob: integrationAuth.encryptedAccessId
        }).toString();
      }

      // the old bot key is else
    } else {
      if (!botKey) throw new BadRequestError({ message: "bot key is missing" });
      if (integrationAuth.accessTag && integrationAuth.accessIV && integrationAuth.accessCiphertext) {
        accessToken = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: integrationAuth.accessCiphertext,
          iv: integrationAuth.accessIV,
          tag: integrationAuth.accessTag,
          key: botKey
        });
      }

      if (integrationAuth.refreshCiphertext && integrationAuth.refreshIV && integrationAuth.refreshTag) {
        const refreshToken = decryptSymmetric128BitHexKeyUTF8({
          key: botKey,
          ciphertext: integrationAuth.refreshCiphertext,
          iv: integrationAuth.refreshIV,
          tag: integrationAuth.refreshTag
        });

        if (integrationAuth.accessExpiresAt && integrationAuth.accessExpiresAt < new Date()) {
          // refer above it contains same logic except not saving
          const tokenDetails = await exchangeRefresh(
            integrationAuth.integration,
            refreshToken,
            integrationAuth?.url,
            integrationAuth.metadata as Record<string, string>
          );
          const refreshEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.refreshToken, botKey);
          const accessEncToken = encryptSymmetric128BitHexKeyUTF8(tokenDetails.accessToken, botKey);
          accessToken = tokenDetails.accessToken;
          await integrationAuthDAL.updateById(integrationAuth.id, {
            refreshIV: refreshEncToken.iv,
            refreshTag: refreshEncToken.tag,
            refreshCiphertext: refreshEncToken.ciphertext,
            accessExpiresAt: tokenDetails.accessExpiresAt,
            accessIV: accessEncToken.iv,
            accessTag: accessEncToken.tag,
            accessCiphertext: accessEncToken.ciphertext
          });
        }
      }
      if (!accessToken) throw new BadRequestError({ message: "Missing access token" });

      if (integrationAuth.accessIdTag && integrationAuth.accessIdIV && integrationAuth.accessIdCiphertext) {
        accessId = decryptSymmetric128BitHexKeyUTF8({
          key: botKey,
          ciphertext: integrationAuth.accessIdCiphertext,
          iv: integrationAuth.accessIdIV,
          tag: integrationAuth.accessIdTag
        });
      }
    }

    return { accessId, accessToken };
  };

  const getIntegrationApps = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    teamId,
    azureDevOpsOrgName,
    id,
    workspaceSlug
  }: TIntegrationAuthAppsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken, accessId } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const apps = await getApps({
      integration: integrationAuth.integration,
      accessToken,
      accessId,
      teamId,
      azureDevOpsOrgName,
      workspaceSlug,
      url: integrationAuth.url
    });
    return apps;
  };

  const getIntegrationAuthTeams = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    id
  }: TIntegrationAuthTeamsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const teams = await getTeams({
      integration: integrationAuth.integration,
      accessToken,
      url: integrationAuth.url || ""
    });
    return teams;
  };

  const getVercelBranches = async ({
    appId,
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIntegrationAuthVercelBranchesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    if (appId) {
      const { data } = await request.get<TVercelBranches[]>(
        `${IntegrationUrls.VERCEL_API_URL}/v1/integrations/git-branches`,
        {
          params: {
            projectId: appId,
            teamId: integrationAuth.teamId
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
      return data.map((b) => b.ref);
    }
    return [];
  };

  const getChecklyGroups = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    accountId
  }: TIntegrationAuthChecklyGroupsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (accountId) {
      const { data } = await request.get<TChecklyGroups[]>(`${IntegrationUrls.CHECKLY_API_URL}/v1/check-groups`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "X-Checkly-Account": accountId
        }
      });
      return data.map(({ name, id: groupId }) => ({ name, groupId }));
    }
    return [];
  };

  const getGithubOrgs = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TIntegrationAuthGithubOrgsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const octokit = new Octokit({
      auth: accessToken
    });

    const { data } = await octokit.request("GET /user/orgs", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!data) return [];

    return data.map(({ login: name, id: orgId }) => ({ name, orgId: String(orgId) }));
  };

  const getGithubEnvs = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    repoOwner,
    repoName
  }: TIntegrationAuthGithubEnvsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const octokit = new Octokit({
      auth: accessToken
    });

    const {
      data: { environments }
    } = await octokit.request("GET /repos/{owner}/{repo}/environments", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28"
      },
      owner: repoOwner,
      repo: repoName
    });
    if (!environments) return [];
    return environments.map(({ id: envId, name }) => ({ name, envId: String(envId) }));
  };

  const getQoveryOrgs = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TIntegrationAuthQoveryOrgsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const { data } = await request.get<{ results: Array<{ id: string; name: string }> }>(
      `${IntegrationUrls.QOVERY_API_URL}/organization`,
      {
        headers: {
          Authorization: `Token ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    return data.results.map(({ name, id: orgId }) => ({ name, orgId }));
  };

  const getAwsKmsKeys = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    region
  }: TIntegrationAuthAwsKmsKeyDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessId, accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const kms = new AWS.KMS({
      region,
      credentials: {
        accessKeyId: String(accessId),
        secretAccessKey: accessToken
      }
    });

    const aliases = await kms.listAliases({}).promise();

    const keyAliases = aliases.Aliases!.filter((alias) => {
      if (!alias.TargetKeyId) return false;

      if (integrationAuth.integration === Integrations.AWS_PARAMETER_STORE && alias.AliasName === "alias/aws/ssm")
        return true;

      if (
        integrationAuth.integration === Integrations.AWS_SECRET_MANAGER &&
        alias.AliasName === "alias/aws/secretsmanager"
      )
        return true;

      if (alias.AliasName?.includes("alias/aws/")) return false;
      return alias.TargetKeyId;
    });

    const keysWithAliases = keyAliases.map((alias) => {
      return {
        id: alias.TargetKeyId!,
        alias: alias.AliasName!
      };
    });

    return keysWithAliases;
  };

  const getQoveryProjects = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    orgId
  }: TIntegrationAuthQoveryProjectDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (orgId) {
      const { data } = await request.get<{ results: Array<{ id: string; name: string }> }>(
        `${IntegrationUrls.QOVERY_API_URL}/organization/${orgId}/project`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
      return data.results.map(({ name, id: projectId }) => ({ name, projectId }));
    }
    return [];
  };

  const getQoveryEnvs = async ({
    projectId,
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIntegrationAuthQoveryEnvironmentsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (projectId && projectId !== "none") {
      // TODO: fix
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/project/${projectId}/environment`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: environmentId, name }) => ({
        name,
        environmentId
      }));
    }
    return [];
  };

  const getQoveryApps = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/application`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getQoveryContainers = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/container`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getQoveryJobs = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environmentId
  }: TIntegrationAuthQoveryScopesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (environmentId) {
      const { data } = await request.get<{ results: { id: string; name: string }[] }>(
        `${IntegrationUrls.QOVERY_API_URL}/environment/${environmentId}/job`,
        {
          headers: {
            Authorization: `Token ${accessToken}`,
            Accept: "application/json"
          }
        }
      );

      return data.results.map(({ id: appId, name }) => ({
        name,
        appId
      }));
    }
    return [];
  };

  const getHerokuPipelines = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIntegrationAuthHerokuPipelinesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const { data } = await request.get<THerokuPipelineCoupling[]>(
      `${IntegrationUrls.HEROKU_API_URL}/pipeline-couplings`,
      {
        headers: {
          Accept: "application/vnd.heroku+json; version=3",
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    return data.map(({ app: { id: appId }, stage, pipeline: { id: pipelineId, name } }) => ({
      app: { appId },
      stage,
      pipeline: { pipelineId, name }
    }));
  };

  const getRailwayEnvironments = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    appId
  }: TIntegrationAuthRailwayEnvDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (appId) {
      const query = `
			query GetEnvironments($projectId: String!, $after: String, $before: String, $first: Int, $isEphemeral: Boolean, $last: Int) {
				environments(projectId: $projectId, after: $after, before: $before, first: $first, isEphemeral: $isEphemeral, last: $last) {
				edges {
					node {
					id
					name
					isEphemeral
					}
				}
				}
			}
			`;

      const variables = {
        projectId: appId
      };

      const {
        data: {
          data: {
            environments: { edges }
          }
        }
      } = await request.post<{
        data: {
          environments: { edges: { node: { id: string; name: string; isEphemeral: boolean } }[] };
        };
      }>(
        IntegrationUrls.RAILWAY_API_URL,
        {
          query,
          variables
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
      return edges.map(({ node: { name, id: environmentId } }) => ({ name, environmentId }));
    }
    return [];
  };

  const getRailwayServices = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    appId
  }: TIntegrationAuthRailwayServicesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    if (appId && appId !== "") {
      const query = `
        query project($id: String!) {
          project(id: $id) {
            services {
                edges {
                    node {
                        id
                        name
                    }
                }
            }
          }
        }
      `;

      const variables = {
        id: appId
      };

      const {
        data: {
          data: {
            project: {
              services: { edges }
            }
          }
        }
      } = await request.post<{
        data: {
          project: {
            services: { edges: { node: { id: string; name: string; isEphemeral: boolean } }[] };
          };
        };
      }>(
        IntegrationUrls.RAILWAY_API_URL,
        {
          query,
          variables
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
      return edges.map(({ node: { name, id: serviceId } }) => ({ name, serviceId }));
    }

    return [];
  };

  const getBitbucketWorkspaces = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TIntegrationAuthBitbucketWorkspaceDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const workspaces: TBitbucketWorkspace[] = [];
    let hasNextPage = true;
    let workspaceUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces`;

    while (hasNextPage) {
      // eslint-disable-next-line
      const { data }: { data: { values: TBitbucketWorkspace[]; next: string } } = await request.get(workspaceUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      if (data?.values.length > 0) {
        data.values.forEach((workspace) => {
          workspaces.push(workspace);
        });
      }

      if (data.next) {
        workspaceUrl = data.next;
      } else {
        hasNextPage = false;
      }
    }
    return workspaces;
  };

  const getNorthFlankSecretGroups = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    appId
  }: TIntegrationAuthNorthflankSecretGroupDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const secretGroups: { name: string; groupId: string }[] = [];

    if (appId) {
      let page = 1;
      const perPage = 10;
      let hasMorePages = true;

      while (hasMorePages) {
        const params = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
          filter: "all"
        });

        const {
          data: {
            data: { secrets }
          }
          // eslint-disable-next-line
        } = await request.get<{ data: { secrets: TNorthflankSecretGroup[] } }>(
          `${IntegrationUrls.NORTHFLANK_API_URL}/v1/projects/${appId}/secrets`,
          {
            params,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );

        secrets.forEach((a) => {
          secretGroups.push({
            name: a.name,
            groupId: a.id
          });
        });

        if (secrets.length < perPage) {
          hasMorePages = false;
        }

        page += 1;
      }
    }
    return secretGroups;
  };

  const getTeamcityBuildConfigs = async ({
    appId,
    id,
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor
  }: TGetIntegrationAuthTeamCityBuildConfigDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    if (appId) {
      const {
        data: { buildType }
      } = await request.get<{ buildType: TTeamCityBuildConfig[] }>(`${integrationAuth.url}/app/rest/buildTypes`, {
        params: {
          locator: `project:${appId}`
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });

      return buildType.map(({ name, id: buildConfigId }) => ({
        name,
        buildConfigId
      }));
    }
    return [];
  };

  const deleteIntegrationAuths = async ({
    projectId,
    integration,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteIntegrationAuthsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

    const integrations = await integrationAuthDAL.delete({ integration, projectId });
    return integrations;
  };

  const deleteIntegrationAuthById = async ({
    id,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TDeleteIntegrationAuthByIdDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new BadRequestError({ message: "Failed to find integration" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

    const delIntegrationAuth = await integrationAuthDAL.transaction(async (tx) => {
      const doc = await integrationAuthDAL.deleteById(integrationAuth.id, tx);
      if (!doc) throw new BadRequestError({ message: "Faled to find integration" });
      await integrationDAL.delete({ integrationAuthId: doc.id }, tx);
      return doc;
    });

    return delIntegrationAuth;
  };

  return {
    listIntegrationAuthByProjectId,
    getIntegrationOptions,
    getIntegrationAuth,
    oauthExchange,
    saveIntegrationToken,
    deleteIntegrationAuthById,
    deleteIntegrationAuths,
    getIntegrationAuthTeams,
    getIntegrationApps,
    getVercelBranches,
    getApps,
    getAwsKmsKeys,
    getGithubOrgs,
    getGithubEnvs,
    getChecklyGroups,
    getQoveryApps,
    getQoveryEnvs,
    getQoveryJobs,
    getHerokuPipelines,
    getQoveryOrgs,
    getQoveryProjects,
    getQoveryContainers,
    getRailwayServices,
    getRailwayEnvironments,
    getNorthFlankSecretGroups,
    getTeamcityBuildConfigs,
    getBitbucketWorkspaces,
    getIntegrationAccessToken
  };
};
