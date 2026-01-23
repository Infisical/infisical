import { ForbiddenError } from "@casl/ability";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Client as OctopusClient, SpaceRepository as OctopusSpaceRepository } from "@octopusdeploy/api-client";
import AWS from "aws-sdk";

import { TIntegrationAuths, TIntegrationAuthsInsert } from "@app/db/schemas/integration-auths";
import { ActionProjectType, SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TGenericPermission, TProjectPermission } from "@app/lib/types";

import { TIntegrationDALFactory } from "../integration/integration-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { getApps, getAppsVercel } from "./integration-app-list";
import { TCircleCIContext } from "./integration-app-types";
import { TIntegrationAuthDALFactory } from "./integration-auth-dal";
import { IntegrationAuthMetadataSchema, TIntegrationAuthMetadata } from "./integration-auth-schema";
import {
  GetVercelCustomEnvironmentsDTO,
  OctopusDeployScope,
  TBitbucketEnvironment,
  TBitbucketWorkspace,
  TChecklyGroups,
  TCircleCIOrganization,
  TDeleteIntegrationAuthByIdDTO,
  TDeleteIntegrationAuthsDTO,
  TDuplicateGithubIntegrationAuthDTO,
  TGetIntegrationAuthDTO,
  TGetIntegrationAuthTeamCityBuildConfigDTO,
  THerokuPipelineCoupling,
  TIntegrationAuthAppsDTO,
  TIntegrationAuthAwsKmsKeyDTO,
  TIntegrationAuthBitbucketEnvironmentsDTO,
  TIntegrationAuthBitbucketWorkspaceDTO,
  TIntegrationAuthChecklyGroupsDTO,
  TIntegrationAuthCircleCIOrganizationDTO,
  TIntegrationAuthGithubEnvsDTO,
  TIntegrationAuthGithubOrgsDTO,
  TIntegrationAuthHerokuPipelinesDTO,
  TIntegrationAuthNorthflankSecretGroupDTO,
  TIntegrationAuthOctopusDeployProjectScopeValuesDTO,
  TIntegrationAuthOctopusDeploySpacesDTO,
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
  TOctopusDeployVariableSet,
  TSaveIntegrationAccessTokenDTO,
  TTeamCityBuildConfig,
  TUpdateIntegrationAuthDTO,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const authorizations = await integrationAuthDAL.find({ projectId });
    return authorizations;
  };

  const listOrgIntegrationAuth = async ({ actorId, actor, actorOrgId, actorAuthMethod }: TGenericPermission) => {
    const authorizations = await integrationAuthDAL.getByOrg(actorOrgId);

    const filteredAuthorizations = await Promise.all(
      authorizations.map(async (auth) => {
        try {
          const { permission } = await permissionService.getProjectPermission({
            actor,
            actorId,
            projectId: auth.projectId,
            actorAuthMethod,
            actorOrgId,
            actionProjectType: ActionProjectType.SecretManager
          });

          return permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations) ? auth : null;
        } catch (error) {
          // user does not belong to the project that the integration auth belongs to
          return null;
        }
      })
    );

    return filteredAuthorizations.filter((auth): auth is NonNullable<typeof auth> => auth !== null);
  };

  const getIntegrationAuth = async ({ actor, id, actorId, actorAuthMethod, actorOrgId }: TGetIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    code,
    installationId
  }: TOauthExchangeDTO) => {
    if (!Object.values(Integrations).includes(integration as Integrations))
      throw new BadRequestError({ message: "Invalid integration" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);

    const tokenExchange = await exchangeCode({ integration, code, url, installationId });
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
    } else if (integration === Integrations.GITHUB && installationId) {
      updateDoc.metadata = {
        installationId,
        installationName: tokenExchange.installationName,
        authMethod: "app"
      };
    }

    if (installationId && integration === Integrations.GITHUB) {
      return integrationAuthDAL.create(updateDoc);
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
      if (!botKey) throw new NotFoundError({ message: `Project bot key for project with ID '${projectId}' not found` });
      if (tokenExchange.refreshToken) {
        const refreshEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenExchange.refreshToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });

        updateDoc.refreshIV = refreshEncToken.iv;
        updateDoc.refreshTag = refreshEncToken.tag;
        updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
      }
      if (tokenExchange.accessToken) {
        const accessEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenExchange.accessToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;
      }
    }

    return integrationAuthDAL.transaction(async (tx) => {
      const integrationAuths = await integrationAuthDAL.find({ projectId, integration }, { tx });
      let existingIntegrationAuth: TIntegrationAuths | undefined;

      // we need to ensure that the integration auth that we use for Github is actually Oauth
      if (integration === Integrations.GITHUB) {
        existingIntegrationAuth = integrationAuths.find((integAuth) => !integAuth.metadata);
      } else {
        [existingIntegrationAuth] = integrationAuths;
      }

      if (!existingIntegrationAuth) {
        return integrationAuthDAL.create(updateDoc, tx);
      }

      return integrationAuthDAL.updateById(existingIntegrationAuth.id, updateDoc, tx);
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
      if (!botKey) throw new NotFoundError({ message: `Project bot key for project with ID '${projectId}' not found` });
      if (refreshToken) {
        const tokenDetails = await exchangeRefresh(
          integration,
          refreshToken,
          url,
          updateDoc.metadata as Record<string, string>
        );
        const refreshEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenDetails.refreshToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
        updateDoc.refreshIV = refreshEncToken.iv;
        updateDoc.refreshTag = refreshEncToken.tag;
        updateDoc.refreshCiphertext = refreshEncToken.ciphertext;
        const accessEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenDetails.accessToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;

        updateDoc.accessExpiresAt = tokenDetails.accessExpiresAt;
      }

      if (!refreshToken && (accessId || accessToken || awsAssumeIamRoleArn)) {
        if (accessToken) {
          const accessEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: accessToken,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          updateDoc.accessIV = accessEncToken.iv;
          updateDoc.accessTag = accessEncToken.tag;
          updateDoc.accessCiphertext = accessEncToken.ciphertext;
        }
        if (accessId) {
          const accessEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: accessId,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          updateDoc.accessIdIV = accessEncToken.iv;
          updateDoc.accessIdTag = accessEncToken.tag;
          updateDoc.accessIdCiphertext = accessEncToken.ciphertext;
        }
        if (awsAssumeIamRoleArn) {
          const awsAssumeIamRoleArnEnc = crypto.encryption().symmetric().encrypt({
            plaintext: awsAssumeIamRoleArn,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          updateDoc.awsAssumeIamRoleArnCipherText = awsAssumeIamRoleArnEnc.ciphertext;
          updateDoc.awsAssumeIamRoleArnIV = awsAssumeIamRoleArnEnc.iv;
          updateDoc.awsAssumeIamRoleArnTag = awsAssumeIamRoleArnEnc.tag;
        }
      }
    }
    return integrationAuthDAL.create(updateDoc);
  };

  const updateIntegrationAuth = async ({
    integrationAuthId,
    refreshToken,
    actorId,
    integration: newIntegration,
    url,
    actor,
    actorOrgId,
    actorAuthMethod,
    accessId,
    namespace,
    accessToken,
    awsAssumeIamRoleArn
  }: TUpdateIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(integrationAuthId);
    if (!integrationAuth) {
      throw new NotFoundError({ message: `Integration auth with id ${integrationAuthId} not found.` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    const { projectId } = integrationAuth;
    const integration = newIntegration || integrationAuth.integration;

    const updateDoc: TIntegrationAuthsInsert = {
      projectId,
      integration,
      namespace,
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
          updateDoc.encryptedAwsAssumeIamRoleArn = null;
        }
        if (accessId) {
          const accessEncToken = secretManagerEncryptor({
            plainText: Buffer.from(accessId)
          }).cipherTextBlob;
          updateDoc.encryptedAccessId = accessEncToken;
          updateDoc.encryptedAwsAssumeIamRoleArn = null;
        }
        if (awsAssumeIamRoleArn) {
          const awsAssumeIamRoleArnEncrypted = secretManagerEncryptor({
            plainText: Buffer.from(awsAssumeIamRoleArn)
          }).cipherTextBlob;
          updateDoc.encryptedAwsAssumeIamRoleArn = awsAssumeIamRoleArnEncrypted;
          updateDoc.encryptedAccess = null;
          updateDoc.encryptedAccessId = null;
        }
      }
    } else {
      if (!botKey) throw new NotFoundError({ message: `Project bot key for project with ID '${projectId}' not found` });
      if (refreshToken) {
        const tokenDetails = await exchangeRefresh(
          integration,
          refreshToken,
          url,
          updateDoc.metadata as Record<string, string>
        );
        const refreshEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenDetails.refreshToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
        updateDoc.refreshIV = refreshEncToken.iv;
        updateDoc.refreshTag = refreshEncToken.tag;
        updateDoc.refreshCiphertext = refreshEncToken.ciphertext;

        const accessEncToken = crypto.encryption().symmetric().encrypt({
          plaintext: tokenDetails.accessToken,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });

        updateDoc.accessIV = accessEncToken.iv;
        updateDoc.accessTag = accessEncToken.tag;
        updateDoc.accessCiphertext = accessEncToken.ciphertext;

        updateDoc.accessExpiresAt = tokenDetails.accessExpiresAt;
      }

      if (!refreshToken && (accessId || accessToken || awsAssumeIamRoleArn)) {
        if (accessToken) {
          const accessEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: accessToken,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          updateDoc.accessIV = accessEncToken.iv;
          updateDoc.accessTag = accessEncToken.tag;
          updateDoc.accessCiphertext = accessEncToken.ciphertext;
        }
        if (accessId) {
          const accessEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: accessId,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
          updateDoc.accessIdIV = accessEncToken.iv;
          updateDoc.accessIdTag = accessEncToken.tag;
          updateDoc.accessIdCiphertext = accessEncToken.ciphertext;
        }
        if (awsAssumeIamRoleArn) {
          const awsAssumeIamRoleArnEnc = crypto.encryption().symmetric().encrypt({
            plaintext: awsAssumeIamRoleArn,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          updateDoc.awsAssumeIamRoleArnCipherText = awsAssumeIamRoleArnEnc.ciphertext;
          updateDoc.awsAssumeIamRoleArnIV = awsAssumeIamRoleArnEnc.iv;
          updateDoc.awsAssumeIamRoleArnTag = awsAssumeIamRoleArnEnc.tag;
        }
      }
    }

    return integrationAuthDAL.updateById(integrationAuthId, updateDoc);
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
      (integrationAuth.integration === Integrations.AWS_SECRET_MANAGER ||
        integrationAuth.integration === Integrations.AWS_PARAMETER_STORE) &&
      (shouldUseSecretV2Bridge
        ? integrationAuth.encryptedAwsAssumeIamRoleArn
        : integrationAuth.awsAssumeIamRoleArnCipherText)
    ) {
      return { accessToken: "", accessId: "" };
    }
    if (
      integrationAuth.integration === Integrations.GITHUB &&
      IntegrationAuthMetadataSchema.parse(integrationAuth.metadata || {}).installationId
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
      if (!botKey) throw new NotFoundError({ message: "Project bot key not found" });
      if (integrationAuth.accessTag && integrationAuth.accessIV && integrationAuth.accessCiphertext) {
        accessToken = crypto.encryption().symmetric().decrypt({
          ciphertext: integrationAuth.accessCiphertext,
          iv: integrationAuth.accessIV,
          tag: integrationAuth.accessTag,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
      }

      if (integrationAuth.refreshCiphertext && integrationAuth.refreshIV && integrationAuth.refreshTag) {
        const refreshToken = crypto.encryption().symmetric().decrypt({
          key: botKey,
          ciphertext: integrationAuth.refreshCiphertext,
          iv: integrationAuth.refreshIV,
          tag: integrationAuth.refreshTag,
          keySize: SymmetricKeySize.Bits128
        });

        if (integrationAuth.accessExpiresAt && integrationAuth.accessExpiresAt < new Date()) {
          // refer above it contains same logic except not saving
          const tokenDetails = await exchangeRefresh(
            integrationAuth.integration,
            refreshToken,
            integrationAuth?.url,
            integrationAuth.metadata as Record<string, string>
          );

          const refreshEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: tokenDetails.refreshToken,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          const accessEncToken = crypto.encryption().symmetric().encrypt({
            plaintext: tokenDetails.accessToken,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
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
        accessId = crypto.encryption().symmetric().decrypt({
          key: botKey,
          ciphertext: integrationAuth.accessIdCiphertext,
          iv: integrationAuth.accessIdIV,
          tag: integrationAuth.accessIdTag,
          keySize: SymmetricKeySize.Bits128
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken, accessId } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const apps = await getApps({
      integration: integrationAuth.integration,
      integrationAuth,
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    const appCfg = getConfig();
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);

    let octokit: Octokit;
    const { installationId } = (integrationAuth.metadata as TIntegrationAuthMetadata) || {};
    if (installationId) {
      octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: appCfg.CLIENT_APP_ID_GITHUB_APP,
          privateKey: appCfg.CLIENT_PRIVATE_KEY_GITHUB_APP,
          installationId
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const repos = await octokit.paginate("GET /installation/repositories", {
        per_page: 100
      });

      const orgSet: Set<string> = new Set();

      return repos
        .filter((repo) => repo.owner.type === "Organization")
        .map((repo) => ({
          name: repo.owner.login,
          orgId: String(repo.owner.id)
        }))
        .filter((org) => {
          const isOrgProcessed = orgSet.has(org.orgId);
          if (!isOrgProcessed) {
            orgSet.add(org.orgId);
          }

          return !isOrgProcessed;
        });
    }

    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    octokit = new Octokit({
      auth: accessToken
    });

    const { data } = await octokit.request("GET /user/orgs", {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!data) {
      return [];
    }

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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    let octokit: Octokit;
    const appCfg = getConfig();

    const authMetadata = IntegrationAuthMetadataSchema.parse(integrationAuth.metadata || {});
    if (authMetadata.installationId) {
      octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: appCfg.CLIENT_APP_ID_GITHUB_APP,
          privateKey: appCfg.CLIENT_PRIVATE_KEY_GITHUB_APP,
          installationId: authMetadata.installationId
        }
      });
    } else {
      octokit = new Octokit({
        auth: accessToken
      });
    }

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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID ${id} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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

  const getBitbucketEnvironments = async ({
    workspaceSlug,
    repoSlug,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TIntegrationAuthBitbucketEnvironmentsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);
    const environments: TBitbucketEnvironment[] = [];
    let hasNextPage = true;

    let environmentsUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${workspaceSlug}/${repoSlug}/environments`;

    while (hasNextPage) {
      // eslint-disable-next-line
      const { data }: { data: { values: TBitbucketEnvironment[]; next: string } } = await request.get(environmentsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      if (data?.values.length > 0) {
        environments.push(...data.values);
      }

      if (data.next) {
        environmentsUrl = data.next;
      } else {
        hasNextPage = false;
      }
    }
    return environments;
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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

  const getCircleCIOrganizations = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TIntegrationAuthCircleCIOrganizationDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const { data: organizations }: { data: TCircleCIOrganization[] } = await request.get(
      `${IntegrationUrls.CIRCLECI_API_URL}/v2/me/collaborations`,
      {
        headers: {
          "Circle-Token": `${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    let projects: {
      orgName: string;
      projectName: string;
      projectId?: string;
    }[] = [];

    try {
      const projectRes = (
        await request.get<{ reponame: string; username: string; vcs_url: string }[]>(
          `${IntegrationUrls.CIRCLECI_API_URL}/v1.1/projects`,
          {
            headers: {
              "Circle-Token": accessToken,
              "Accept-Encoding": "application/json"
            }
          }
        )
      ).data;

      projects = projectRes.map((a) => ({
        orgName: a.username, // username maps to unique organization name in CircleCI
        projectName: a.reponame, // reponame maps to project name within an organization in CircleCI
        projectId: a.vcs_url.split("/").pop() // vcs_url maps to the project id in CircleCI
      }));
    } catch (error) {
      logger.error(error);
    }

    const projectsByOrg = groupBy(
      projects.map((p) => ({
        orgName: p.orgName,
        name: p.projectName,
        id: p.projectId as string
      })),
      (p) => p.orgName
    );

    const getOrgContexts = async (orgSlug: string) => {
      type NextPageToken = string | null | undefined;

      try {
        const contexts: TCircleCIContext[] = [];
        let nextPageToken: NextPageToken;

        while (nextPageToken !== null) {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await request.get<{
            items: TCircleCIContext[];
            next_page_token: NextPageToken;
          }>(`${IntegrationUrls.CIRCLECI_API_URL}/v2/context`, {
            headers: {
              "Circle-Token": accessToken,
              "Accept-Encoding": "application/json"
            },
            params: new URLSearchParams({
              "owner-slug": orgSlug,
              ...(nextPageToken ? { "page-token": nextPageToken } : {})
            })
          });

          contexts.push(...data.items);
          nextPageToken = data.next_page_token;
        }

        return contexts?.map((context) => ({
          name: context.name,
          id: context.id
        }));
      } catch (error) {
        logger.error(error);
      }
    };

    return Promise.all(
      organizations.map(async (org) => ({
        name: org.name,
        slug: org.slug,
        projects: projectsByOrg[org.name] ?? [],
        contexts: (await getOrgContexts(org.slug)) ?? []
      }))
    );
  };

  const deleteIntegrationAuths = async ({
    projectId,
    integration,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteIntegrationAuthsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
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
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

    const delIntegrationAuth = await integrationAuthDAL.transaction(async (tx) => {
      const doc = await integrationAuthDAL.deleteById(integrationAuth.id, tx);
      if (!doc) throw new NotFoundError({ message: `Integration auth with ID '${integrationAuth.id}' not found` });
      await integrationDAL.delete({ integrationAuthId: doc.id }, tx);
      return doc;
    });

    return delIntegrationAuth;
  };

  // At the moment, we only use this for Github App integration as it's a special case
  const duplicateIntegrationAuth = async ({
    id,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: TDuplicateGithubIntegrationAuthDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) {
      throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });
    }

    const { permission: sourcePermission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(sourcePermission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Integrations
    );

    const { permission: targetPermission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(targetPermission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Integrations
    );

    const newIntegrationAuth: Omit<typeof integrationAuth, "id"> & { id?: string } = {
      ...integrationAuth,
      id: undefined,
      projectId
    };

    return integrationAuthDAL.create(newIntegrationAuth);
  };

  const getVercelCustomEnvironments = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    teamId,
    id
  }: GetVercelCustomEnvironmentsDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const vercelApps = await getAppsVercel({
      includeCustomEnvironments: true,
      accessToken,
      teamId
    });

    return vercelApps.map((app) => ({
      customEnvironments: app.customEnvironments,
      appId: app.appId
    }));
  };

  const getOctopusDeploySpaces = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TIntegrationAuthOctopusDeploySpacesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    const client = await OctopusClient.create({
      apiKey: accessToken,
      instanceURL: integrationAuth.url!,
      userAgentApp: "Infisical Integration"
    });

    const spaceRepository = new OctopusSpaceRepository(client);

    const spaces = await spaceRepository.list({
      partialName: "", // throws error if no string is present...
      take: 1000
    });

    return spaces.Items;
  };

  const getOctopusDeployScopeValues = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    scope,
    spaceId,
    resourceId
  }: TIntegrationAuthOctopusDeployProjectScopeValuesDTO) => {
    const integrationAuth = await integrationAuthDAL.findById(id);
    if (!integrationAuth) throw new NotFoundError({ message: `Integration auth with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: integrationAuth.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integrationAuth.projectId);
    const { accessToken } = await getIntegrationAccessToken(integrationAuth, shouldUseSecretV2Bridge, botKey);

    let url: string;
    switch (scope) {
      case OctopusDeployScope.Project:
        url = `${integrationAuth.url}/api/${spaceId}/projects/${resourceId}/variables`;
        break;
      // future support tenant, variable set etc.
      default:
        throw new InternalServerError({ message: `Unhandled Octopus Deploy scope` });
    }

    // SDK doesn't support variable set...
    const { data: variableSet } = await request.get<TOctopusDeployVariableSet>(url, {
      headers: {
        "X-NuGet-ApiKey": accessToken,
        Accept: "application/json"
      }
    });

    return variableSet.ScopeValues;
  };

  return {
    listIntegrationAuthByProjectId,
    listOrgIntegrationAuth,
    getIntegrationOptions,
    getIntegrationAuth,
    oauthExchange,
    saveIntegrationToken,
    updateIntegrationAuth,
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
    getBitbucketEnvironments,
    getCircleCIOrganizations,
    getIntegrationAccessToken,
    duplicateIntegrationAuth,
    getOctopusDeploySpaces,
    getOctopusDeployScopeValues,
    getVercelCustomEnvironments
  };
};
