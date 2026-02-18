import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TTotpConfigDALFactory } from "../totp/totp-config-dal";
import { TUserDALFactory } from "../user/user-dal";
import { UserEncryption } from "../user/user-types";
import { TAuthDALFactory } from "./auth-dal";
import {
  ResetPasswordV2Type,
  TResetPasswordV2DTO,
  TResetPasswordViaBackupKeyDTO,
  TSetupPasswordViaBackupKeyDTO
} from "./auth-password-type";
import { ActorType, AuthMethod } from "./auth-type";

type TAuthPasswordServiceFactoryDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  totpConfigDAL: Pick<TTotpConfigDALFactory, "delete">;
};

export type TAuthPasswordFactory = ReturnType<typeof authPaswordServiceFactory>;
export const authPaswordServiceFactory = ({
  authDAL,
  userDAL,
  tokenService,
  smtpService,
  totpConfigDAL
}: TAuthPasswordServiceFactoryDep) => {
  const resetPasswordV2 = async ({ userId, newPassword, type, oldPassword }: TResetPasswordV2DTO) => {
    const cfg = getConfig();

    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) {
      throw new BadRequestError({ message: `User encryption key not found for user with ID '${userId}'` });
    }

    if (!user.authMethods?.includes(AuthMethod.EMAIL)) {
      logger.error(
        { authMethods: user.authMethods },
        "Unable to reset password, no email authentication method is configured"
      );
      throw new BadRequestError({ message: "Unable to reset password, no email authentication method is configured" });
    }

    // we check the old password if the user is resetting their password while logged in
    if (type === ResetPasswordV2Type.LoggedInReset) {
      if (!user.hashedPassword) {
        throw new BadRequestError({ message: "Unable to change password, no password is set" });
      }
      if (!oldPassword) {
        throw new BadRequestError({ message: "Current password is required." });
      }

      const isValid = await crypto.hashing().compareHash(oldPassword, user.hashedPassword);
      if (!isValid) {
        throw new BadRequestError({ message: "Incorrect current password." });
      }
    }

    if (user.encryptionVersion !== UserEncryption.V2) {
      throw new BadRequestError({
        message: "Cannot reset password without current credentials or recovery method",
        name: "Reset password"
      });
    }

    const newHashedPassword = await crypto.hashing().createHash(newPassword, cfg.SALT_ROUNDS);

    await userDAL.updateUserEncryptionByUserId(userId, {
      hashedPassword: newHashedPassword
    });

    await tokenService.revokeAllMySessions(userId);
  };

  /*
   * Reset password of a user via backup key
   * */
  const resetPasswordByBackupKey = async ({
    encryptedPrivateKey,
    protectedKeyTag,
    protectedKey,
    protectedKeyIV,
    salt,
    verifier,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    userId,
    password
  }: TResetPasswordViaBackupKeyDTO) => {
    const cfg = getConfig();

    const hashedPassword = await crypto.hashing().createHash(password, cfg.SALT_ROUNDS);

    await userDAL.updateUserEncryptionByUserId(userId, {
      encryptionVersion: 2,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      salt,
      verifier,
      hashedPassword
    });

    await userDAL.updateById(userId, {
      isLocked: false,
      temporaryLockDateEnd: null,
      consecutiveFailedMfaAttempts: 0
    });

    /* we reset the mobile authenticator configs of the user
    because we want this to be one of the recovery modes from account lockout */
    await totpConfigDAL.delete({
      userId
    });
  };

  const getBackupPrivateKeyOfUser = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user || (user && !user.isAccepted)) {
      throw new Error("Failed to find user");
    }
    const backupKey = await authDAL.getBackupPrivateKeyByUserId(userId);
    if (!backupKey) throw new Error("Failed to find user backup key");

    return backupKey;
  };

  const sendPasswordSetupEmail = async (actor: OrgServiceActor) => {
    if (actor.type !== ActorType.USER)
      throw new BadRequestError({ message: `Actor of type ${actor.type} cannot set password` });

    const user = await userDAL.findById(actor.id);

    if (!user) throw new BadRequestError({ message: `Could not find user with ID ${actor.id}` });

    if (!user.isAccepted || !user.authMethods)
      throw new BadRequestError({ message: `You must complete signup to set a password` });

    const cfg = getConfig();

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_PASSWORD_SETUP,
      userId: user.id
    });

    const email = user.email ?? user.username;

    await smtpService.sendMail({
      template: SmtpTemplates.SetupPassword,
      recipients: [email],
      subjectLine: "Infisical Password Setup",
      substitutions: {
        email,
        token,
        callback_url: cfg.SITE_URL ? `${cfg.SITE_URL}/password-setup` : ""
      }
    });
  };

  const setupPassword = async ({ password, token }: TSetupPasswordViaBackupKeyDTO, actor: OrgServiceActor) => {
    try {
      await tokenService.validateTokenForUser({
        type: TokenType.TOKEN_EMAIL_PASSWORD_SETUP,
        userId: actor.id,
        code: token
      });
    } catch (e) {
      throw new BadRequestError({ message: "Expired or invalid token. Please try again." });
    }

    await userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(actor.id, tx);

      if (!user) throw new BadRequestError({ message: `Could not find user with ID ${actor.id}` });

      if (!user.isAccepted || !user.authMethods)
        throw new BadRequestError({ message: `You must complete signup to set a password` });

      if (!user.authMethods.includes(AuthMethod.EMAIL)) {
        await userDAL.updateById(
          actor.id,
          {
            authMethods: [...user.authMethods, AuthMethod.EMAIL]
          },
          tx
        );
      }

      const cfg = getConfig();

      const hashedPassword = await crypto.hashing().createHash(password, cfg.SALT_ROUNDS);

      await userDAL.updateUserEncryptionByUserId(
        actor.id,
        {
          encryptionVersion: UserEncryption.V2,
          hashedPassword,
          serverPrivateKey: null,
          clientPublicKey: null
        },
        tx
      );
    });

    await tokenService.revokeAllMySessions(actor.id);
  };

  return {
    resetPasswordByBackupKey,
    getBackupPrivateKeyOfUser,
    sendPasswordSetupEmail,
    setupPassword,
    resetPasswordV2
  };
};
