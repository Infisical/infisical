import { AccessScope } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { sanitizeEmail } from "@app/lib/validator";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TMembershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { validatePasswordResetAuthorization } from "../auth/auth-fns";

type TAccountRecoveryServiceFactoryDep = {
  userDAL: TUserDALFactory;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAccountRecoveryServiceFactory = ReturnType<typeof accountRecoveryServiceFactory>;
const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";

export const accountRecoveryServiceFactory = ({
  userDAL,
  membershipUserDAL,
  tokenService,
  smtpService
}: TAccountRecoveryServiceFactoryDep) => {
  /*
   * Account recovery flow via email. Step 1: send recovery email
   */
  const sendRecoveryEmail = async (unsanitizedEmail: string) => {
    const sendEmail = async () => {
      const email = sanitizeEmail(unsanitizedEmail);
      const user = await userDAL.findOne({ username: email });
      if (!user) throw new BadRequestError({ message: "Failed to find user data" });

      if (user && user.isAccepted) {
        const cfg = getConfig();

        const hasEmailAuth = user.authMethods?.includes(AuthMethod.EMAIL);
        const substitutions: Record<string, unknown> = {
          email,
          isCloud: cfg.isCloud,
          siteUrl: cfg.SITE_URL || "",
          hasEmailAuth,
          callback_url: cfg.SITE_URL ? `${cfg.SITE_URL}/account-recovery-reset` : ""
        };

        if (!hasEmailAuth) {
          const orgMemberships = await membershipUserDAL.find({
            actorUserId: user.id,
            scope: AccessScope.Organization
          });
          const lastLoginMethod =
            orgMemberships
              .filter((membership) => membership.lastLoginAuthMethod)
              .sort((a, b) => (b.updatedAt || new Date(0)).getTime() - (a.updatedAt || new Date(0)).getTime())[0]
              ?.lastLoginAuthMethod || null;
          substitutions.lastLoginMethod = lastLoginMethod;
        }

        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_PASSWORD_RESET,
          userId: user.id
        });

        substitutions.token = token;
        await smtpService.sendMail({
          template: SmtpTemplates.ResetPassword,
          recipients: [email],
          subjectLine: "Infisical account recovery",
          substitutions
        });
      }
    };

    // note(daniel): run in background to prevent timing attacks
    void sendEmail().catch((err) => logger.error(err, "Failed to send account recovery email"));
  };

  /*
   * Account recovery flow via email. Step 2: verify the token and inject a temp token to reset password
   */
  const verifyRecoveryEmail = async (unsanitizedEmail: string, code: string) => {
    const cfg = getConfig();
    const email = sanitizeEmail(unsanitizedEmail);
    const user = await userDAL.findOne({ username: email });

    // Use a dummy userId when there's no valid user.
    const shouldReject = !user || (user && !user.isAccepted);

    try {
      await tokenService.validateTokenForUser({
        type: TokenType.TOKEN_EMAIL_PASSWORD_RESET,
        userId: shouldReject ? DUMMY_USER_ID : user.id,
        code
      });
    } catch {
      // If we were going to reject anyway, throw the generic message.
      // If the user was valid but the token failed, same generic message.
      throw new Error("Invalid or expired verification request");
    }

    // Reject *after* the constant-time token validation work.
    if (shouldReject) {
      throw new Error("Invalid or expired verification request");
    }

    const token = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id
      },
      cfg.AUTH_SECRET,
      { expiresIn: cfg.JWT_SIGNUP_LIFETIME }
    );

    return { token, user, userEncryptionVersion: 2 };
  };

  const enableEmailAuthForUser = async (token: string) => {
    const validatedToken = validatePasswordResetAuthorization(token);
    const user = await userDAL.findById(validatedToken.userId);
    if (!user) {
      throw new BadRequestError({ message: "Failed to find user" });
    }

    if (!user.authMethods?.includes(AuthMethod.EMAIL)) {
      const updatedAuthMethods = user.authMethods ? [...user.authMethods, AuthMethod.EMAIL] : [AuthMethod.EMAIL];
      await userDAL.updateById(user.id, {
        authMethods: updatedAuthMethods
      });
    }
  };

  return {
    sendRecoveryEmail,
    verifyRecoveryEmail,
    enableEmailAuthForUser
  };
};
