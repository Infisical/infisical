import crypto from "node:crypto";

import { ForbiddenError, subject } from "@casl/ability";
import bcrypt from "bcrypt";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TServiceTokenDALFactory } from "./service-token-dal";
import {
  TCreateServiceTokenDTO,
  TDeleteServiceTokenDTO,
  TGetServiceTokenInfoDTO,
  TProjectServiceTokensDTO
} from "./service-token-types";

type TServiceTokenServiceFactoryDep = {
  serviceTokenDAL: TServiceTokenDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findBySlugs">;
};

export type TServiceTokenServiceFactory = ReturnType<typeof serviceTokenServiceFactory>;

export const serviceTokenServiceFactory = ({
  serviceTokenDAL,
  permissionService,
  projectEnvDAL
}: TServiceTokenServiceFactoryDep) => {
  const createServiceToken = async ({
    iv,
    tag,
    name,
    actor,
    scopes,
    actorId,
    projectId,
    expiresIn,
    permissions,
    encryptedKey
  }: TCreateServiceTokenDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.ServiceTokens
    );
    
    scopes.forEach(({ environment, secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    })
    
    const appCfg = getConfig();

    // validates env
    const scopeEnvs = [...new Set(scopes.map(({ environment }) => environment))];
    const inputEnvs = await projectEnvDAL.findBySlugs(projectId, scopeEnvs);
    if (inputEnvs.length !== scopeEnvs.length)
      throw new BadRequestError({ message: "Environment not found" });

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

  const deleteServiceToken = async ({ actorId, actor, id }: TDeleteServiceTokenDTO) => {
    const serviceToken = await serviceTokenDAL.findById(id);
    if (!serviceToken) throw new BadRequestError({ message: "Token not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      serviceToken.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.ServiceTokens
    );

    const deletedServiceToken = await serviceTokenDAL.deleteById(id);
    return deletedServiceToken;
  };

  const getServiceToken = async ({ actor, actorId }: TGetServiceTokenInfoDTO) => {
    if (actor !== ActorType.SERVICE)
      throw new BadRequestError({ message: "Service token not found" });

    const serviceToken = await serviceTokenDAL.findById(actorId);
    if (!serviceToken) throw new BadRequestError({ message: "Token not found" });

    return serviceToken;
  };

  const getProjectServiceTokens = async ({
    actorId,
    actor,
    projectId
  }: TProjectServiceTokensDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.ServiceTokens
    );

    const tokens = await serviceTokenDAL.find({ projectId });
    return tokens;
  };

  const fnValidateServiceToken = async (token: string) => {
    const [, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>token.split(".", 3);
    const serviceToken = await serviceTokenDAL.findById(TOKEN_IDENTIFIER);
    if (!serviceToken) throw new UnauthorizedError();

    if (serviceToken.expiresAt && new Date(serviceToken.expiresAt) < new Date()) {
      await serviceTokenDAL.deleteById(serviceToken.id);
      throw new UnauthorizedError({ message: "failed to authenticate expired service token" });
    }

    const isMatch = await bcrypt.compare(TOKEN_SECRET, serviceToken.secretHash);
    if (!isMatch) throw new UnauthorizedError();
    const updatedToken = await serviceTokenDAL.updateById(serviceToken.id, {
      lastUsed: new Date()
    });
    return updatedToken;
  };

  return {
    createServiceToken,
    deleteServiceToken,
    getServiceToken,
    getProjectServiceTokens,
    fnValidateServiceToken
  };
};
