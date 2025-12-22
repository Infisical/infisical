import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TAccessTokenQueueServiceFactory } from "../access-token-queue/access-token-queue";
import { ActorType } from "../auth/auth-type";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TServiceTokenDALFactory } from "./service-token-dal";
import {
  TCreateServiceTokenDTO,
  TDeleteServiceTokenDTO,
  TGetServiceTokenInfoDTO,
  TProjectServiceTokensDTO
} from "./service-token-types";

type TServiceTokenServiceFactoryDep = {
  serviceTokenDAL: TServiceTokenDALFactory;
  userDAL: TUserDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findBySlugs">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  accessTokenQueue: Pick<TAccessTokenQueueServiceFactory, "updateServiceTokenStatus">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TServiceTokenServiceFactory = ReturnType<typeof serviceTokenServiceFactory>;

export const serviceTokenServiceFactory = ({
  serviceTokenDAL,
  userDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  accessTokenQueue,
  smtpService,
  orgDAL
}: TServiceTokenServiceFactoryDep) => {
  const createServiceToken = async ({
    iv,
    tag,
    name,
    actor,
    actorOrgId,
    actorAuthMethod,
    scopes,
    actorId,
    projectId,
    expiresIn,
    permissions,
    encryptedKey
  }: TCreateServiceTokenDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);

    scopes.forEach(({ environment, secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    });

    const appCfg = getConfig();

    // validates env
    const scopeEnvs = [...new Set(scopes.map(({ environment }) => environment))];
    const inputEnvs = await projectEnvDAL.findBySlugs(projectId, scopeEnvs);
    if (inputEnvs.length !== scopeEnvs.length)
      throw new NotFoundError({ message: `One or more selected environments not found` });

    const secret = crypto.randomBytes(16).toString("hex");
    const secretHash = await crypto.hashing().createHash(secret, appCfg.SALT_ROUNDS);
    let expiresAt: Date | null = null;
    if (expiresIn) {
      expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    const createdBy = actorId;

    const serviceToken = await serviceTokenDAL.create({
      name,
      createdBy,
      encryptedKey,
      iv,
      tag,
      expiresAt,
      secretHash,
      permissions,
      scopes: JSON.stringify(scopes),
      projectId
    });

    const token = `st.${serviceToken.id.toString()}.${secret}`;

    return { token, serviceToken };
  };

  const deleteServiceToken = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TDeleteServiceTokenDTO) => {
    const serviceToken = await serviceTokenDAL.findById(id);
    if (!serviceToken) throw new NotFoundError({ message: `Service token with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: serviceToken.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

    const deletedServiceToken = await serviceTokenDAL.deleteById(id);
    return deletedServiceToken;
  };

  const getServiceToken = async ({ actor, actorId }: TGetServiceTokenInfoDTO) => {
    if (actor !== ActorType.SERVICE)
      throw new NotFoundError({ message: `Service token with ID '${actorId}' not found` });

    const serviceToken = await serviceTokenDAL.findById(actorId);
    if (!serviceToken) throw new NotFoundError({ message: `Service token with ID '${actorId}' not found` });

    const serviceTokenUser = await userDAL.findById(serviceToken.createdBy);
    if (!serviceTokenUser)
      throw new NotFoundError({ message: `Service token with ID ${serviceToken.id} has no associated creator` });

    return { serviceToken, user: serviceTokenUser };
  };

  const getProjectServiceTokens = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectServiceTokensDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);

    const tokens = await serviceTokenDAL.find({ projectId }, { sort: [["createdAt", "desc"]] });
    return tokens;
  };

  const fnValidateServiceToken = async (token: string) => {
    const [, tokenIdentifier, tokenSecret] = <[string, string, string]>token.split(".", 3);
    const serviceToken = await serviceTokenDAL.findById(tokenIdentifier);

    if (!serviceToken) throw new NotFoundError({ message: `Service token with ID '${tokenIdentifier}' not found` });
    const project = await projectDAL.findById(serviceToken.projectId);

    if (!project) throw new NotFoundError({ message: `Project with ID '${serviceToken.projectId}' not found` });

    if (serviceToken.expiresAt && new Date(serviceToken.expiresAt) < new Date()) {
      await serviceTokenDAL.deleteById(serviceToken.id);
      throw new ForbiddenRequestError({ message: "Service token has expired" });
    }

    const isMatch = await crypto.hashing().compareHash(tokenSecret, serviceToken.secretHash);
    if (!isMatch) throw new UnauthorizedError({ message: "Invalid service token" });
    await accessTokenQueue.updateServiceTokenStatus(serviceToken.id);

    const serviceTokenOrgDetails = await orgDAL.findById(project.orgId);

    return {
      ...serviceToken,
      lastUsed: new Date(),
      orgId: project.orgId,
      parentOrgId: serviceTokenOrgDetails.parentOrgId || serviceTokenOrgDetails.id,
      rootOrgId: serviceTokenOrgDetails.rootOrgId || serviceTokenOrgDetails.id
    };
  };

  const notifyExpiringTokens = async () => {
    const appCfg = getConfig();
    let processedCount = 0;
    let hasMoreRecords = true;
    let offset = 0;
    const batchSize = 500;

    while (hasMoreRecords) {
      // eslint-disable-next-line no-await-in-loop
      const expiringTokens = await serviceTokenDAL.findExpiringTokens(undefined, batchSize, offset);

      if (expiringTokens.length === 0) {
        hasMoreRecords = false;
        break;
      }

      const successfullyNotifiedTokenIds: string[] = [];

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        expiringTokens.map(async (token) => {
          try {
            await smtpService.sendMail({
              recipients: [token.createdByEmail],
              subjectLine: "Service Token Expiry Notice",
              template: SmtpTemplates.ServiceTokenExpired,
              substitutions: {
                tokenName: token.name,
                projectName: token.projectName,
                url: `${appCfg.SITE_URL}/organizations/${token.orgId}/projects/secret-management/${token.projectId}/access-management?selectedTab=service-tokens`
              }
            });
            successfullyNotifiedTokenIds.push(token.id);
          } catch (error) {
            logger.error(error, `Failed to send expiration notification for token ${token.id}:`);
          }
        })
      );

      // Batch update all successfully notified tokens in a single query
      if (successfullyNotifiedTokenIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await serviceTokenDAL.update({ $in: { id: successfullyNotifiedTokenIds } }, { expiryNotificationSent: true });
      }

      processedCount += expiringTokens.length;
      offset += batchSize;
    }

    return processedCount;
  };

  return {
    createServiceToken,
    deleteServiceToken,
    getServiceToken,
    getProjectServiceTokens,
    fnValidateServiceToken,
    notifyExpiringTokens
  };
};
