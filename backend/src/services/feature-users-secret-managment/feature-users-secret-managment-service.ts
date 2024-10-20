import bcrypt from "bcrypt";
import { z } from "zod";

import { TUserSecretsInsert, UserSecretsSchema } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { DatabaseError, ForbiddenRequestError } from "@app/lib/errors";

import { TFeatureUsersSecretManagementDALFactory } from "./feature-users-secret-managment-dal";
import { TDeleteUserSecretDTO, TGetAllSecretsDTO, TUpdateUserSecretDTO } from "./feature-users-secret-managment-types";

type TUserSecretServiceFactoryDep = {
  userSecretsDAL: TFeatureUsersSecretManagementDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TFeatureUsersSecretManagmentServiceFactory = ReturnType<typeof featureUsersSecretManagmentServiceFactory>;

const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;

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

  const updateUserSecret = async ({ id, updateData }: TUpdateUserSecretDTO) => {
    const existingSecret = await userSecretsDAL.findById(id);
    if (!existingSecret) throw new ForbiddenRequestError("User secret not found.");

    const parsedUpdateData = UserSecretsSchema.partial().parse(updateData);

    if (parsedUpdateData.password) {
      parsedUpdateData.password = await bcrypt.hash(parsedUpdateData.password, 10);
    }

    const updatedUserSecret = await userSecretsDAL.updateById(id, {
      ...existingSecret,
      ...parsedUpdateData,
    });

    return updatedUserSecret;
  };

  
  const deleteUserSecretById = async (deleteUserSecretInput: TDeleteUserSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, secretId } = deleteUserSecretInput;

    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const userSecret = isUuidV4(secretId)
      ? await userSecretsDAL.findById(secretId)
      : await userSecretsDAL.findOne({ id: secretId });

    if (!userSecret) throw new ForbiddenRequestError({ name: "Secret not found" });

    if (userSecret.organization_id && userSecret.organization_id !== orgId)
      throw new ForbiddenRequestError({ message: "User does not have permission to delete this secret" });

    const deletedSecret = await userSecretsDAL.deleteById(secretId);

    return deletedSecret;
  };



  return {
    createUserSecret,
    getAllUserSecrets,
    updateUserSecret,
    deleteUserSecretById
  };
};

export type TCreateUserSecretDTO = {
  secretData: TUserSecretsInsert;
};
