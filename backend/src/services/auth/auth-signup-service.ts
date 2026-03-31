import { AccessScope } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { isDisposableEmail } from "@app/lib/validator";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { getServerCfg } from "../super-admin/super-admin-service";
import { TUserDALFactory } from "../user/user-dal";
import { UserEncryption } from "../user/user-types";
import { TAuthDALFactory } from "./auth-dal";
import { validateSignUpAuthorization } from "./auth-fns";
import { TCompleteAccountSignupDTO } from "./auth-signup-type";
import { AuthMethod, AuthTokenType } from "./auth-type";

type TAuthSignupDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  orgService: Pick<TOrgServiceFactory, "createOrganization" | "findOrganizationById">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDAL,
  userDAL,
  tokenService,
  smtpService,
  orgService,
  orgDAL
}: TAuthSignupDep) => {
  // first step of signup. create user and send email
  const beginEmailSignupProcess = async (email: string) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const isEmailInvalid = await isDisposableEmail(sanitizedEmail);
    if (isEmailInvalid) {
      throw new Error("Provided a disposable email");
    }

    // akhilmhdh: case sensitive email resolution
    let user = await userDAL.findOne({ username: sanitizedEmail });
    if (user && user.isAccepted) {
      // Send informational email for existing accounts instead of throwing error
      // This prevents user enumeration vulnerability
      const appCfg = getConfig();
      await smtpService.sendMail({
        template: SmtpTemplates.SignupExistingAccount,
        subjectLine: "Sign-up Request for Your Infisical Account",
        recipients: [sanitizedEmail],
        substitutions: {
          email: sanitizedEmail,
          loginUrl: `${appCfg.SITE_URL}/login`,
          resetPasswordUrl: `${appCfg.SITE_URL}/account-recovery`
        }
      });
      return;
    }

    if (!user) {
      user = await userDAL.create({
        authMethods: [AuthMethod.EMAIL],
        username: sanitizedEmail,
        email: sanitizedEmail,
        isGhost: false
      });
    }
    if (!user) throw new Error("Failed to create user");

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.SignupEmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [sanitizedEmail],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailSignup = async (email: string, code: string) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const user = await userDAL.findOne({ username: sanitizedEmail });

    // Always call validateTokenForUser so the response time includes
    // the bcrypt cost regardless of whether the user exists.
    // Use a dummy userId when there's no valid user.
    const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";
    const shouldReject = !user || user.isAccepted;

    try {
      await tokenService.validateTokenForUser({
        type: TokenType.TOKEN_EMAIL_CONFIRMATION,
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

    await userDAL.updateById(user.id, { isEmailVerified: true });

    const appCfg = getConfig();
    const jwtToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id.toString()
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    return { user, token: jwtToken };
  };

  const completeAccountSignup = async ({
    email,
    password,
    firstName,
    lastName,
    organizationName,
    ip,
    userAgent,
    authorization
  }: TCompleteAccountSignupDTO) => {
    const sanitizedEmail = email.trim().toLowerCase();
    const appCfg = getConfig();

    const user = await userDAL.findOne({ username: sanitizedEmail });

    // Always validate the authorization token to prevent timing attacks
    // that could reveal whether an email is registered.
    // Use a dummy userId when user is missing so the JWT work is still performed.
    const dummyUserId = "00000000-0000-0000-0000-000000000000";
    validateSignUpAuthorization(authorization, user?.id ?? dummyUserId);

    if (!user || (user && (user.isAccepted || !user.isEmailVerified))) {
      throw new BadRequestError({ message: "Failed to complete account for complete user" });
    }

    // Check if user has existing org memberships (i.e., they were invited)
    const existingMemberships = await orgDAL.findMembership({
      actorUserId: user.id,
      scope: AccessScope.Organization
    });
    const isInvitedUser = existingMemberships.length > 0;

    // Self-signup requires allowSignUp to be enabled
    if (!isInvitedUser) {
      const serverCfg = await getServerCfg();
      if (!serverCfg.allowSignUp) {
        throw new ForbiddenRequestError({
          message: "Signup's are disabled"
        });
      }
    }

    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);
    const updatedUser = await authDAL.transaction(async (tx) => {
      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true }, tx);
      if (!us) throw new Error("User not found");

      const userEncKey = await userDAL.upsertUserEncryptionKey(
        us.id,
        {
          encryptionVersion: UserEncryption.V2,
          hashedPassword
        },
        tx
      );

      return { info: us, key: userEncKey };
    });

    // If self-signup, create a default organization
    if (!isInvitedUser && organizationName) {
      await orgService.createOrganization({
        userId: user.id,
        userEmail: user.email ?? user.username,
        orgName: organizationName
      });
    }

    // TODO(auth-revamp): check for license count
    const tokenSessionExpiresIn = appCfg.JWT_AUTH_LIFETIME;
    const refreshTokenExpiresIn = appCfg.JWT_REFRESH_LIFETIME;

    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updatedUser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");

    const accessToken = crypto.jwt().sign(
      {
        authMethod: AuthMethod.EMAIL,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: updatedUser.info.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: tokenSessionExpiresIn }
    );

    const refreshToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updatedUser.info.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: refreshTokenExpiresIn }
    );

    return {
      user: updatedUser.info,
      accessToken,
      refreshToken,
      authMethod: AuthMethod.EMAIL
    };
  };

  return {
    beginEmailSignupProcess,
    verifyEmailSignup,
    completeAccountSignup
  };
};
