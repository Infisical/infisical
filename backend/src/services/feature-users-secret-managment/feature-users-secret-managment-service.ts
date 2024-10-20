import bcrypt from "bcrypt";

import { TUserSecretsInsert, UserSecretsSchema } from "@app/db/schemas";

import { TFeatureUsersSecretManagementDALFactory } from "./feature-users-secret-managment-dal"; // Adjust the import based on your project structure

type TUserSecretServiceFactoryDep = {
  userSecretsDAL: TFeatureUsersSecretManagementDALFactory;
};

export type TFeatureUsersSecretManagmentServiceFactory = ReturnType<typeof featureUsersSecretManagmentServiceFactory>;

export const featureUsersSecretManagmentServiceFactory = ({ userSecretsDAL }: TUserSecretServiceFactoryDep) => {
  const createUserSecret = async ({ secretData }) => {
    // Validate the secret data against the schema
    const parsedSecretData = UserSecretsSchema.parse(secretData);

    const hashedPassword = parsedSecretData.password ? await bcrypt.hash(parsedSecretData.password, 10) : null;

    const newUserSecret = await userSecretsDAL.createUserSecret({
      ...parsedSecretData,
      password: hashedPassword
    });

    return newUserSecret;
  };

  return {
    createUserSecret
  };
};

export type TCreateUserSecretDTO = {
  secretData: TUserSecretsInsert;
};
