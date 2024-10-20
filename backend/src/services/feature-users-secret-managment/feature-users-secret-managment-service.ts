import bcrypt from "bcrypt";

import { TUserSecretsInsert, UserSecretsSchema } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ForbiddenRequestError } from "@app/lib/errors";

import { TFeatureUsersSecretManagementDALFactory } from "./feature-users-secret-managment-dal";
import { TGetAllSecretsDTO } from "./feature-users-secret-managment-types";

type TUserSecretServiceFactoryDep = {
  userSecretsDAL: TFeatureUsersSecretManagementDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TFeatureUsersSecretManagmentServiceFactory = ReturnType<typeof featureUsersSecretManagmentServiceFactory>;

export const featureUsersSecretManagmentServiceFactory = ({
  userSecretsDAL,
  permissionService
}: TUserSecretServiceFactoryDep) => {
  const createUserSecret = async ({ secretData }: TCreateUserSecretDTO) => {
    const parsedSecretData = UserSecretsSchema.parse(secretData);

    const hashedPassword = parsedSecretData.password ? await bcrypt.hash(parsedSecretData.password, 10) : null;

    const newUserSecret = await userSecretsDAL.createUserSecret({
      ...parsedSecretData,
      password: hashedPassword
    });

    return newUserSecret;
  };

  const getAllUserSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit
  }: TGetAllSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError("Organization ID is required.");

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const secrets = await userSecretsDAL.find(
      {
        organization_id: actorOrgId,
        user_id: actorId
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    const totalCount = await userSecretsDAL.countAllUserSecrets({
      organization_id: actorOrgId,
      user_id: actorId
    });

    return {
      secrets,
      totalCount
    };
  };

  return {
    createUserSecret,
    getAllUserSecrets
  };
};

export type TCreateUserSecretDTO = {
  secretData: TUserSecretsInsert;
};
