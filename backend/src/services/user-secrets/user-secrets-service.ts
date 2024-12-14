import { ForbiddenRequestError } from "@app/lib/errors";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TDecryptedUserSecret } from "@app/db/schemas";
import { z } from "zod";
import { TCreateUserSecretDTO, TDeleteUserSecretDTO, TUserSecretPermission, TUserSecretUpdateDTO } from "./user-secrets-types";

type TUserSecretsServiceFactoryDep = {
  userSecretsDAL: TUserSecretsDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: TKmsServiceFactory;
};

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;

export const userSecretsServiceFactory = ({ 
  userSecretsDAL,
  permissionService,
  kmsService
}: TUserSecretsServiceFactoryDep) => {
  const createUserSecrets = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    title,
    content,
    username,
    password,
    cardNumber,
    expiryDate,
    cvv
  }: TCreateUserSecretDTO) => {
    // get permission for the Org
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId); 
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    // encrypt data
    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedTitle = !title ? null : encryptWithRoot(Buffer.from(title));
    const encryptedContent = !content ? null : encryptWithRoot(Buffer.from(content));
    const encryptedUsername = !username ? null : encryptWithRoot(Buffer.from(username));
    const encryptedPassword = !password ? null : encryptWithRoot(Buffer.from(password));
    const encryptedCardNumber = !cardNumber ? null : encryptWithRoot(Buffer.from(cardNumber));
    const encryptedExpiryDate = !expiryDate ? null : encryptWithRoot(Buffer.from(expiryDate));
    const encryptedCVV = !cvv ? null : encryptWithRoot(Buffer.from(cvv));

    const newUserSecret = await userSecretsDAL.create({
      userId: actorId,
      orgId,
      encryptedTitle,
      encryptedContent,
      encryptedUsername,
      encryptedPassword,
      encryptedCardNumber,
      encryptedExpiryDate,
      encryptedCVV
    });

    const idToReturn = `${Buffer.from(newUserSecret.id, "hex").toString("base64url")}`;

    return { id: idToReturn };
  };

  const getUserSecrets = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    actorAuthMethod
  }: TUserSecretPermission) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const secrets = await userSecretsDAL.find(
      {
        userId: actorId,
        orgId: actorOrgId
      },
    );

    let decryptedSecrets: TDecryptedUserSecret[] = [];
    for (const secret of secrets) {
      let decrypted: TDecryptedUserSecret = { id: secret.id, userId: secret.userId, orgId: secret.orgId };
      if (secret.encryptedTitle) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedTitle);
        decrypted.title = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedContent) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedContent);
        decrypted.content = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedUsername) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedUsername);
        decrypted.username = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedPassword) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedPassword);
        decrypted.password = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedCardNumber) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedCardNumber);
        decrypted.cardNumber = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedExpiryDate) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedExpiryDate);
        decrypted.expiryDate = Buffer.from(decryptedSecretValue).toString() 
      }
      if (secret.encryptedCVV) {
        let decryptedSecretValue: Buffer | undefined;
        const decryptWithRoot = kmsService.decryptWithRootKey();
        decryptedSecretValue = decryptWithRoot(secret.encryptedCVV);
        decrypted.cvv = Buffer.from(decryptedSecretValue).toString() 
      }

      decryptedSecrets.push(decrypted);
    }

    return { secrets: decryptedSecrets }
  }

  const updateUserSecretById = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    actorAuthMethod,
    userSecretId,
    title,
    content,
    username,
    password,
    cardNumber,
    expiryDate,
    cvv
  }: TUserSecretUpdateDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    // encrypt data
    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedTitle = !title ? null : encryptWithRoot(Buffer.from(title));
    const encryptedContent = !content ? null : encryptWithRoot(Buffer.from(content));
    const encryptedUsername = !username ? null : encryptWithRoot(Buffer.from(username));
    const encryptedPassword = !password ? null : encryptWithRoot(Buffer.from(password));
    const encryptedCardNumber = !cardNumber ? null : encryptWithRoot(Buffer.from(cardNumber));
    const encryptedExpiryDate = !expiryDate ? null : encryptWithRoot(Buffer.from(expiryDate));
    const encryptedCVV = !cvv ? null : encryptWithRoot(Buffer.from(cvv));


    const newUserSecret = await userSecretsDAL.updateById(id, {
      encryptedTitle,
      encryptedContent,
      encryptedUsername,
      encryptedPassword,
      encryptedCardNumber,
      encryptedExpiryDate,
      encryptedCVV
    });

    const idToReturn = `${Buffer.from(newUserSecret.id, "hex").toString("base64url")}`;

    return { id: idToReturn };

  };

  const deleteUserSecretById = async ({ 
    actor,
    actorId,
    orgId,
    actorOrgId,
    actorAuthMethod,
    userSecretId
  }: TDeleteUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const userSecret = isUuidV4(userSecretId) && await userSecretsDAL.findById(userSecretId);

    if (userSecret && userSecret.orgId && userSecret.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "User does not have permission to delete shared secret" });
    }

    const deletedUserSecret = await userSecretsDAL.deleteById(userSecretId);

    return deletedUserSecret;
  };

  return {
    createUserSecrets,
    getUserSecrets,
    updateUserSecretById,
    deleteUserSecretById
  };
};
