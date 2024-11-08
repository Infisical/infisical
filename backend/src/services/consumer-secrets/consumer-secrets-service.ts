import { ForbiddenError } from '@casl/ability';

import { TPermissionServiceFactory } from '@app/ee/services/permission/permission-service';
import {
  ProjectPermissionCmekActions,
  ProjectPermissionSub,
} from '@app/ee/services/permission/project-permission';
import { BadRequestError, NotFoundError } from '@app/lib/errors';
import { ProjectServiceActor } from '@app/lib/types';
import {
  TConsumerSecretDecryptDTO,
  TConsumerSecretEncryptDTO,
  TCreateConsumerSecretDTO,
  TListConsumerSecretsByProjectIdDTO,
  TUpdabteConsumerSecretByIdDTO,
} from '@app/services/consumer-secrets/consumer-secrets-types';
import { TConsumerSecretsKmsKeyDALFactory } from '@app/services/consumer-secrets-kms/kms-key-dal';
import { TConsumerSecretsKmsServiceFactory } from '@app/services/consumer-secrets-kms/kms-service';

type TConsumerSecretServiceFactoryDep = {
  kmsService: TConsumerSecretsKmsServiceFactory;
  consumerSecretsKmsDAL: TConsumerSecretsKmsKeyDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TConsumerSecretServiceFactory = ReturnType<
  typeof consumerSecretsServiceFactory
>;

export const consumerSecretsServiceFactory = ({
  kmsService,
  consumerSecretsKmsDAL,
  permissionService,
}: TConsumerSecretServiceFactoryDep) => {
  const createConsumerSecret = async (
    { projectId, ...dto }: TCreateConsumerSecretDTO,
    actor: ProjectServiceActor,
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Create,
      ProjectPermissionSub.Cmek,
    );

    const consumerSecrets = await kmsService.generateKmsKey({
      ...dto,
      projectId,
      isReserved: false,
    });

    return consumerSecrets;
  };

  const updateConsumerSecretById = async (
    { keyId, ...data }: TUpdabteConsumerSecretByIdDTO,
    actor: ProjectServiceActor,
  ) => {
    const key = await consumerSecretsKmsDAL.findById(keyId);

    if (!key)
      throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved)
      throw new BadRequestError({ message: 'Key is not customer managed' });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionSub.Cmek,
    );

    const consumerSecrets = await consumerSecretsKmsDAL.updateById(keyId, data);

    return consumerSecrets;
  };

  const deleteConsumerSecretById = async (
    keyId: string,
    actor: ProjectServiceActor,
  ) => {
    const key = await consumerSecretsKmsDAL.findById(keyId);

    if (!key)
      throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved)
      throw new BadRequestError({ message: 'Key is not customer managed' });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionSub.Cmek,
    );

    const consumerSecrets = consumerSecretsKmsDAL.deleteById(keyId);

    return consumerSecrets;
  };

  const listConsumerSecretsByProjectId = async (
    { projectId, ...filters }: TListConsumerSecretsByProjectIdDTO,
    actor: ProjectServiceActor,
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Read,
      ProjectPermissionSub.Cmek,
    );

    const { keys: consumerSecretss, totalCount } =
      await consumerSecretsKmsDAL.findKmsKeysByProjectId({
        projectId,
        ...filters,
      });

    return { consumerSecretss, totalCount };
  };

  const consumerSecretsEncrypt = async (
    { keyId, plaintext }: TConsumerSecretEncryptDTO,
    actor: ProjectServiceActor,
  ) => {
    const key = await consumerSecretsKmsDAL.findById(keyId);

    if (!key)
      throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved)
      throw new BadRequestError({ message: 'Key is not customer managed' });

    if (key.isDisabled)
      throw new BadRequestError({ message: 'Key is disabled' });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionSub.Cmek,
    );

    const encrypt = await kmsService.encryptWithKmsKey({ kmsId: keyId });

    const { cipherTextBlob } = await encrypt({
      plainText: Buffer.from(plaintext, 'base64'),
    });

    return cipherTextBlob.toString('base64');
  };

  const consumerSecretsDecrypt = async (
    { keyId, ciphertext }: TConsumerSecretDecryptDTO,
    actor: ProjectServiceActor,
  ) => {
    const key = await consumerSecretsKmsDAL.findById(keyId);

    if (!key)
      throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved)
      throw new BadRequestError({ message: 'Key is not customer managed' });

    if (key.isDisabled)
      throw new BadRequestError({ message: 'Key is disabled' });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId,
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionSub.Cmek,
    );

    const decrypt = await kmsService.decryptWithKmsKey({ kmsId: keyId });

    const plaintextBlob = await decrypt({
      cipherTextBlob: Buffer.from(ciphertext, 'base64'),
    });

    return plaintextBlob.toString('base64');
  };

  return {
    createConsumerSecret,
    updateConsumerSecretById,
    deleteConsumerSecretById,
    listConsumerSecretsByProjectId,
    consumerSecretsEncrypt,
    consumerSecretsDecrypt,
  };
};
