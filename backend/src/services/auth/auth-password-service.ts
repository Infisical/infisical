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
import { TAuthDALFactory } from "./auth-dal";
import { ResetPasswordV2Type, TResetPasswordV2DTO, TSetupPasswordViaBackupKeyDTO } from "./auth-password-type";
import { ActorType, AuthMethod } from "./auth-type";

type TAuthPasswordServiceFactoryDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  totpConfigDAL: Pick<TTotpConfigDALFactory, "delete">;
};

export type TAuthPasswordFactory = ReturnType<typeof authPaswordServiceFactory>;
export const authPaswordServiceFactory = ({ userDAL, tokenService, smtpService }: TAuthPasswordServiceFactoryDep) => {
  const resetPasswordV2 = async ({ userId, newPassword, oldPassword, type }: TResetPasswordV2DTO) => {
    const cfg = getConfig();

    const user = await userDAL.findById(userId);
    if (!user || !user.isAccepted || !user.isEmailVerified) {
      throw new BadRequestError({ message: `Invalid token` });
    }

    if (!user.authMethods?.includes(AuthMethod.EMAIL)) {
      logger.error(
        { authMethods: user.authMethods },
        "Unable to reset password, no email authentication method is configured"
      );
      throw new BadRequestError({ message: "Unable to reset password, no email authentication method is configured" });
    }

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

    const newHashedPassword = await crypto.hashing().createHash(newPassword, cfg.SALT_ROUNDS);

    await userDAL.updateById(userId, {
      hashedPassword: newHashedPassword
    });

    await tokenService.revokeAllMySessions(userId);
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

      await userDAL.updateById(
        actor.id,
        {
          hashedPassword
        },
        tx
      );
    });

    await tokenService.revokeAllMySessions(actor.id);
  };

  return {
    sendPasswordSetupEmail,
    setupPassword,
    resetPasswordV2
  };
};
