import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TConsumerSecretsDALFactory } from "./consumer-secret-dal";
import { TConsumerSecretPermission, TCreateConsumerSecretDTO, TDeleteConsumerSecretDTO } from "./consumer-secret-types";

type TConsumerSecretsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  consumerSecretsDAL: TConsumerSecretsDALFactory;
};

export type TConsumerSecretsServiceFactory = ReturnType<typeof consumerSecretsServiceFactory>;

export const consumerSecretsServiceFactory = ({
  permissionService,
  consumerSecretsDAL
}: TConsumerSecretsServiceFactoryDep) => {
  const createConsumerSecret = async (createConsumerSecretInput: TCreateConsumerSecretDTO) => {
    const {
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      type,
      username,
      password,
      cardNumber,
      expiryDate,
      cvv,
      title,
      content
    } = createConsumerSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const newConsumerSecret = await consumerSecretsDAL.createSecret({
      type,
      username,
      password,
      cardNumber,
      expiryDate,
      cvv,
      title,
      content,
      userId: actorId,
      orgId
    });
    return { id: newConsumerSecret };
  };

  const getConsumerSecrets = async (getConsumerSecretsInput: TConsumerSecretPermission) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId } = getConsumerSecretsInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    const userConsumerSecrets = await consumerSecretsDAL.findAllByUser(actorId, orgId);
    return userConsumerSecrets;
  };

  const deleteConsumerSecretById = async (deleteConsumerSecretInput: TDeleteConsumerSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, consumerSecretId } = deleteConsumerSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const consumerSecret = await consumerSecretsDAL.findById(consumerSecretId);
    if (!consumerSecret) throw new BadRequestError({ message: "Consumer secret not found" });

    await consumerSecretsDAL.deleteSecret(consumerSecretId);

    return consumerSecret;
  };

  const updateConsumerSecret = async (updateConsumerSecretInput: TCreateConsumerSecretDTO & { id: string }) => {
    const {
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      id,
      type,
      username,
      password,
      cardNumber,
      expiryDate,
      cvv,
      title,
      content
    } = updateConsumerSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const existingSecret = await consumerSecretsDAL.findById(id);
    if (!existingSecret) throw new BadRequestError({ message: "Consumer secret not found" });

    await consumerSecretsDAL.updateSecret(id, {
      type,
      username,
      password,
      cardNumber,
      expiryDate,
      cvv,
      title,
      content
    });

    const updatedSecret = await consumerSecretsDAL.findById(id);
    if (!updatedSecret) throw new BadRequestError({ message: "Consumer secret not updated" });

    return updatedSecret;
  };

  return {
    createConsumerSecret,
    getConsumerSecrets,
    deleteConsumerSecretById,
    updateConsumerSecret
  };
};
