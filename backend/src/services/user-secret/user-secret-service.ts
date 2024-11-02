import { z } from "zod";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TUserSecretType } from "@app/lib/types";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TUserSecretDALFactory } from "./user-secret-dal";
import { TUserSecretsWebLoginDALFactory } from "./user-secrets-web-login-dal";
import { TUserSecretCreditCardDALFactory } from "@app/services/user-secret/user-secret-credit-card-dal";
import { TUserSecretSecureNoteDALFactory } from "./user-secrets-secure-note-dal";
import {
  TCreateUserSecretDTO,
  TGetUserSecretsDTO,
  TDeleteUserSecretDTO,
  TGetUserSecretByIdDTO,
  TUpdateUserSecretDTO
} from "./user-secret-types";

type TUserSecretServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  userSecretDAL: TUserSecretDALFactory;
  orgDAL: TOrgDALFactory;
  kmsService: TKmsServiceFactory;
  userSecretsWebLoginDAL: TUserSecretsWebLoginDALFactory;
  userSecretsCreditCardDAL: TUserSecretCreditCardDALFactory;
  userSecretsSecureNoteDAL: TUserSecretSecureNoteDALFactory;
};

export type TUserSecretServiceFactory = ReturnType<typeof userSecretServiceFactory>;

const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;

export const userSecretServiceFactory = ({
  permissionService,
  userSecretDAL,
  userSecretsWebLoginDAL,
  userSecretsCreditCardDAL,
  orgDAL,
  kmsService,
  userSecretsSecureNoteDAL
}: TUserSecretServiceFactoryDep) => {
  const createUserSecret = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secretType,
    name,
    description,
    password,
    website,
    userName,
    cvv,
    expiryDate,
    cardNumber,
    cardholderName,
    content,
    title
  }: TCreateUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    const encryptWithRoot = kmsService.encryptWithRootKey();

    const newUserSecret = await userSecretDAL.create({
      userId: actorId,
      orgId: actorOrgId,
      type: secretType,
      name,
      description
    });

    if (secretType === TUserSecretType.WebLogin) {
      const encryptedSecret = encryptWithRoot(Buffer.from(password || ""));

      await userSecretsWebLoginDAL.insert({
        secretId: newUserSecret.id,
        username: userName,
        password: encryptedSecret,
        website: website || ""
      });
    } else if (secretType === TUserSecretType.CreditCard) {
      console.log("cvv", cvv);
      console.log("expiryDate", expiryDate);
      console.log("cardNumber", cardNumber);
      console.log("cardHolderName", cardholderName);
      const encryptedCVV = encryptWithRoot(Buffer.from(cvv || ""));
      const encryptedExpiryDate = encryptWithRoot(Buffer.from(expiryDate || ""));
      const encryptedCardNumber = encryptWithRoot(Buffer.from(cardNumber || ""));
      await userSecretsCreditCardDAL.insert({
        secretId: newUserSecret.id,
        iv: "",
        tag: "",
        cardholderName: cardholderName || "",
        cvv: encryptedCVV,
        expiryDate: encryptedExpiryDate,
        cardNumber: encryptedCardNumber
      });
    } else if (secretType === TUserSecretType.SecureNote) {
      const encryptedContent = encryptWithRoot(Buffer.from(content || ""));
      const encryptedTitle = encryptWithRoot(Buffer.from(title || ""));
      await userSecretsSecureNoteDAL.insert({
        secretId: newUserSecret.id,
        content: encryptedContent,
        title: encryptedTitle
      });
    }

    return { id: newUserSecret.id };
  };

  const getUserSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit,
    secretType,
    searchQuery
  }: TGetUserSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const query: any = {
      userId: actorId,
      orgId: actorOrgId
    };

    if (secretType) {
      query.type = secretType;
    }
    if (searchQuery) {
      query.searchQuery = searchQuery;
    }

    const secrets = await userSecretDAL.find(query, { offset, limit, sort: [["createdAt", "desc"]] });

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedSecrets = secrets.map((secret: any) => {
      switch (secret.type) {
        case TUserSecretType.WebLogin:
          if (secret.password) {
            return {
              ...secret,
              password: decryptWithRoot(secret.password).toString()
            };
          }
          break;
        case TUserSecretType.CreditCard:
          if (secret.cvv && secret.expiryDate && secret.cardNumber) {
            //console.log("secret", secret);
            const decryptedSecret = {
              ...secret,
              cvv: decryptWithRoot(secret.cvv).toString(),
              expiryDate: decryptWithRoot(secret.expiryDate).toString(),
              cardNumber: decryptWithRoot(secret.cardNumber).toString()
            };
            return decryptedSecret;
          }
          break;
        case TUserSecretType.SecureNote:
          if (secret.content && secret.title) {
            return {
              ...secret,
              content: decryptWithRoot(secret.content).toString(),
              title: decryptWithRoot(secret.title).toString()
            };
          }
          break;
        default:
          break;
      }
      return secret;
    });

    const count = await userSecretDAL.countAllUserSecrets(query);

    return {
      secrets: decryptedSecrets,
      totalCount: count
    };
  };

  const deleteUserSecretById = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    secretId
  }: TDeleteUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const secret = await userSecretDAL.findById(secretId);
    if (!secret) throw new NotFoundError({ message: "Secret not found" });

    if (secret.userId !== actorId || secret.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "User does not have permission to delete this secret" });
    }

    await userSecretDAL.deleteById(secretId);

    if (secret.type === TUserSecretType.CreditCard) {
      await userSecretsCreditCardDAL.deleteBySecretId(secretId);
    } else if (secret.type === TUserSecretType.SecureNote) {
      await userSecretsSecureNoteDAL.deleteBySecretId(secretId);
    } else if (secret.type === TUserSecretType.WebLogin) {
      await userSecretsWebLoginDAL.deleteBySecretId(secretId);
    }
  };

  const updateUserSecret = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secretId,
    name,
    description,
    password,
    website,
    userName,
    cvv,
    expiryDate,
    cardNumber,
    cardholderName,
    content,
    title
  }: TUpdateUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    const secret = await userSecretDAL.findById(secretId);
    if (!secret) throw new NotFoundError({ message: "Secret not found" });

    if (secret.userId !== actorId || secret.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "User does not have permission to update this secret" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();

    const id = secretId;

    const updateData: { name?: string; description?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    await userSecretDAL.update(id, updateData);

    // Update type-specific details
    switch (secret.type) {
      case TUserSecretType.WebLogin:
        if (password || userName || website !== undefined) {
          const encryptedPassword = password ? encryptWithRoot(Buffer.from(password)) : undefined;
          await userSecretsWebLoginDAL.updateBySecretId(secretId, {
            username: userName,
            password: encryptedPassword,
            website: website || ""
          });
        }
        break;
      case TUserSecretType.CreditCard:
        if (cvv || expiryDate || cardNumber || cardholderName) {
          const encryptedCVV = cvv ? encryptWithRoot(Buffer.from(cvv)) : undefined;
          const encryptedExpiryDate = expiryDate ? encryptWithRoot(Buffer.from(expiryDate)) : undefined;
          const encryptedCardNumber = cardNumber ? encryptWithRoot(Buffer.from(cardNumber)) : undefined;
          await userSecretsCreditCardDAL.updateBySecretId(secretId, {
            cardholderName: cardholderName || "",
            cvv: encryptedCVV,
            expiryDate: encryptedExpiryDate,
            cardNumber: encryptedCardNumber
          });
        }
        break;
      case TUserSecretType.SecureNote:
        if (content || title) {
          const encryptedContent = content ? encryptWithRoot(Buffer.from(content)) : undefined;
          const encryptedTitle = title ? encryptWithRoot(Buffer.from(title)) : undefined;
          await userSecretsSecureNoteDAL.updateBySecretId(secretId, {
            content: encryptedContent,
            title: encryptedTitle
          });
        }
        break;
    }

    return { id: secretId };
  };

  return {
    createUserSecret,
    getUserSecrets,
    deleteUserSecretById,
    updateUserSecret
  };
};
