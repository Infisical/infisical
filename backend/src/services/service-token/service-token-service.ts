import crypto from "node:crypto";

import { ForbiddenError, subject } from "@casl/ability";
import bcrypt from "bcrypt";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TAccessTokenQueueServiceFactory } from "../access-token-queue/access-token-queue";
import { ActorType } from "../auth/auth-type";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findBySlugs">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  accessTokenQueue: Pick<TAccessTokenQueueServiceFactory, "updateServiceTokenStatus">;
};

export type TServiceTokenServiceFactory = ReturnType<typeof serviceTokenServiceFactory>;

export const serviceTokenServiceFactory = ({
  serviceTokenDAL,
  userDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  accessTokenQueue
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);

    scopes.forEach(({ environment, secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    });

    const appCfg = getConfig();

    // validates env
    const scopeEnvs = [...new Set(scopes.map(({ environment }) => environment))];
    const inputEnvs = await projectEnvDAL.findBySlugs(projectId, scopeEnvs);
    if (inputEnvs.length !== scopeEnvs.length) throw new BadRequestError({ message: "Environment not found" });

    const secret = crypto.randomBytes(16).toString("hex");
    const secretHash = await bcrypt.hash(secret, appCfg.SALT_ROUNDS);
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
    if (!serviceToken) throw new BadRequestError({ message: "Token not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      serviceToken.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

    const deletedServiceToken = await serviceTokenDAL.deleteById(id);
    return deletedServiceToken;
  };

  const getServiceToken = async ({ actor, actorId }: TGetServiceTokenInfoDTO) => {
    if (actor !== ActorType.SERVICE) throw new BadRequestError({ message: "Service token not found" });

    const serviceToken = await serviceTokenDAL.findById(actorId);
    if (!serviceToken) throw new BadRequestError({ message: "Token not found" });

    const serviceTokenUser = await userDAL.findById(serviceToken.createdBy);
    if (!serviceTokenUser) throw new BadRequestError({ message: "Service token user not found" });

    return { serviceToken, user: serviceTokenUser };
  };

  const getProjectServiceTokens = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectServiceTokensDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);

    const tokens = await serviceTokenDAL.find({ projectId }, { sort: [["createdAt", "desc"]] });
    return tokens;
  };

  const fnValidateServiceToken = async (token: string) => {
    const [, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>token.split(".", 3);
    const serviceToken = await serviceTokenDAL.findById(TOKEN_IDENTIFIER);

    if (!serviceToken) throw new UnauthorizedError();
    const project = await projectDAL.findById(serviceToken.projectId);

    if (!project) throw new UnauthorizedError({ message: "Service token project not found" });

    if (serviceToken.expiresAt && new Date(serviceToken.expiresAt) < new Date()) {
      await serviceTokenDAL.deleteById(serviceToken.id);
      throw new UnauthorizedError({ message: "failed to authenticate expired service token" });
    }

    const isMatch = await bcrypt.compare(TOKEN_SECRET, serviceToken.secretHash);
    if (!isMatch) throw new UnauthorizedError();
    await accessTokenQueue.updateServiceTokenStatus(serviceToken.id);

    return { ...serviceToken, lastUsed: new Date(), orgId: project.orgId };
  };

  return {
    createServiceToken,
    deleteServiceToken,
    getServiceToken,
    getProjectServiceTokens,
    fnValidateServiceToken
  };
};
