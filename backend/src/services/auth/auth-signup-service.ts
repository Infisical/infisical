import { AccessScope } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { isDisposableEmail } from "@app/lib/validator";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { getServerCfg } from "../super-admin/super-admin-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TAuthDALFactory } from "./auth-dal";
import { validateSignUpAuthorization } from "./auth-fns";
import { TAuthLoginFactory } from "./auth-login-service";
import { TCompleteAccountSignupDTO } from "./auth-signup-type";
import { AuthMethod, AuthModeSignUpTokenPayload, AuthTokenType } from "./auth-type";

type TAuthSignupDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "updateById">;
  orgService: Pick<TOrgServiceFactory, "createOrganization" | "findOrganizationById">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  loginService: Pick<TAuthLoginFactory, "generateUserTokens">;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDAL,
  userDAL,
  userAliasDAL,
  tokenService,
  smtpService,
  orgService,
  orgDAL,
  loginService
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

    if (!user || (user && user.isAccepted)) {
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
      const us = await userDAL.updateById(user.id, { firstName, lastName, isAccepted: true, hashedPassword }, tx);
      return { ...us, hashedPassword: null };
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
      userId: updatedUser.id
    });
    if (!tokenSession) throw new Error("Failed to create token");

    const accessToken = crypto.jwt().sign(
      {
        authMethod: AuthMethod.EMAIL,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: updatedUser.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: tokenSessionExpiresIn }
    );

    const refreshToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updatedUser.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion
      },
      appCfg.AUTH_SECRET,
      { expiresIn: refreshTokenExpiresIn }
    );

    return {
      user: updatedUser,
      isInvitedUser,
      accessToken,
      refreshToken,
      authMethod: AuthMethod.EMAIL
    };
  };

  /*
   * Verify an SSO/OAuth alias via email confirmation code.
   * Called from /signup/verify-alias with the signup token in the Authorization header.
   *
   * For org IdP (SAML/OIDC/LDAP): organizationId is in the signup token → tokens issued with org context
   * For OAuth (Google/GitHub/GitLab): no organizationId → tokens issued without org, user goes to select-org
   *
   * If the user is not yet accepted, they are automatically accepted (SSO users don't need password setup).
   */
  const verifyAlias = async ({
    code,
    authorization,
    ip,
    userAgent
  }: {
    code: string;
    authorization: string;
    ip: string;
    userAgent: string;
  }) => {
    const appCfg = getConfig();

    // Extract and validate the signup token
    const [, tokenValue] = authorization.split(" ", 2);
    if (!tokenValue) throw new UnauthorizedError({ message: "Missing authorization token" });

    const decodedToken = crypto.jwt().verify(tokenValue, appCfg.AUTH_SECRET) as AuthModeSignUpTokenPayload;

    if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) {
      throw new UnauthorizedError({ message: "Invalid token type" });
    }

    const user = await userDAL.findById(decodedToken.userId);
    if (!user) throw new BadRequestError({ message: "User not found" });

    if (!decodedToken.aliasId) {
      throw new BadRequestError({ message: "Missing alias ID in signup token" });
    }

    // Verify the alias belongs to this user
    const userAlias = await userAliasDAL.findOne({
      id: decodedToken.aliasId,
      userId: user.id
    });

    if (!userAlias) {
      throw new BadRequestError({ message: "Alias not found for this user" });
    }

    // Validate the email verification code — the code was created with this specific aliasId
    // by the EE service (saml/oidc/ldap) when the alias was first created
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      code
    });

    // Mark this specific alias as email-verified
    await userAliasDAL.updateById(userAlias.id, { isEmailVerified: true });

    // If user is not yet accepted, accept them (SSO users don't need password/account setup)
    if (!user.isAccepted) {
      await userDAL.updateById(user.id, { isAccepted: true });
    }

    // Issue session tokens
    const tokens = await loginService.generateUserTokens({
      userId: user.id,
      ip,
      userAgent,
      authMethod: decodedToken.authMethod,
      organizationId: decodedToken.organizationId
    });

    return { tokens, user };
  };

  return {
    beginEmailSignupProcess,
    verifyEmailSignup,
    completeAccountSignup,
    verifyAlias
  };
};
