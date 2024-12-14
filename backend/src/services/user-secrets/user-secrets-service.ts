import crypto, { randomUUID } from "node:crypto";
import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";

type TUserSecretsServiceFactoryDep = {
  userSecretsDAL: TUserSecretsDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: TKmsServiceFactory;
};

type TCreateUserSecretDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  title?: string;
  content?: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
};

type TGetUserSecretsDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
}

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

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
  }: TGetUserSecretsDTO) => {
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

    return { secrets }
  }

  return {
    createUserSecrets,
    getUserSecrets
  };
};
