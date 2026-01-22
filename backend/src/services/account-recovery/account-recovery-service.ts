import { AccessScope } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TMembershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { UserEncryption } from "@app/services/user/user-types";

type TAccountRecoveryServiceFactoryDep = {
  userDAL: TUserDALFactory;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAccountRecoveryServiceFactory = ReturnType<typeof accountRecoveryServiceFactory>;

export const accountRecoveryServiceFactory = ({
  userDAL,
  membershipUserDAL,
  tokenService,
  smtpService
}: TAccountRecoveryServiceFactoryDep) => {
  /*
   * Account recovery flow via email. Step 1: send recovery email
   */
  const sendRecoveryEmail = async (email: string) => {
    const sendEmail = async () => {
      const users = await userDAL.findUserByUsername(email);
      // akhilmhdh: case sensitive email resolution
      const user = users?.length > 1 ? users.find((el) => el.username === email) : users?.[0];
      if (!user) throw new BadRequestError({ message: "Failed to find user data" });

      if (user && user.isAccepted) {
        const cfg = getConfig();

        const hasEmailAuth = user.authMethods?.includes(AuthMethod.EMAIL);
        const substitutions: Record<string, unknown> = {
          email,
          isCloud: cfg.isCloud,
          siteUrl: cfg.SITE_URL || "",
          hasEmailAuth
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
  const verifyRecoveryEmail = async (email: string, code: string) => {
    const cfg = getConfig();
    const users = await userDAL.findUserByUsername(email);
    // akhilmhdh: case sensitive email resolution
    const user = users?.length > 1 ? users.find((el) => el.username === email) : users?.[0];
    if (!user) throw new BadRequestError({ message: "Failed to find user data" });

    const userEnc = await userDAL.findUserEncKeyByUserId(user.id);

    if (!userEnc) throw new BadRequestError({ message: "Failed to find user encryption data" });

    // ignore as user is not found to avoid an outside entity to identify infisical registered accounts
    if (!user || (user && !user.isAccepted)) {
      throw new Error("Failed email verification for pass reset");
    }

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_PASSWORD_RESET,
      userId: user.id,
      code
    });

    const token = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id
      },
      cfg.AUTH_SECRET,
      { expiresIn: cfg.JWT_SIGNUP_LIFETIME }
    );

    return { token, user, userEncryptionVersion: userEnc.encryptionVersion as UserEncryption };
  };

  return {
    sendRecoveryEmail,
    verifyRecoveryEmail
  };
};
