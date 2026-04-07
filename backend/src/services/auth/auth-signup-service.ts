import { AccessScope, OrgMembershipStatus } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { isDisposableEmail, sanitizeEmail, validateEmail } from "@app/lib/validator";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TAuthDALFactory } from "./auth-dal";
import { extractBearerToken } from "./auth-fns";
import { TAuthLoginFactory } from "./auth-login-service";
import { CompleteAccountType, TCompleteAccountDTO } from "./auth-signup-type";
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
    const sanitizedEmail = sanitizeEmail(email);
    validateEmail(email);
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
    const sanitizedEmail = sanitizeEmail(email);
    validateEmail(email);
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

  /*
   * Unified account completion for both email signup and SSO/OAuth alias verification.
   *
   * Shared: signup token validation, user lookup, org creation if no membership, session token issuance.
   *
   * Email: sets password + user profile, creates user account.
   * Alias: verifies email code against alias, marks alias + user flags as verified.
   */
  const completeAccount = async (dto: TCompleteAccountDTO) => {
    const appCfg = getConfig();
    const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";

    // Step 1: Extract and validate the signup token
    const tokenValue = extractBearerToken(dto.authorization);
    const decodedToken = crypto.jwt().verify(tokenValue, appCfg.AUTH_SECRET) as AuthModeSignUpTokenPayload;

    if (decodedToken.authTokenType !== AuthTokenType.SIGNUP_TOKEN) {
      throw new UnauthorizedError({ message: "Invalid token type" });
    }

    // Step 2: Find the user
    let user = await userDAL.findById(decodedToken.userId);

    // Step 3: Type-specific validation and user updates
    // All branches perform their expensive work (bcrypt hash / token validation) before
    // checking rejection conditions, so the response time is constant regardless of
    // whether the request is valid. This prevents timing-based user/alias enumeration.
    let authMethod: AuthMethod;
    let organizationId: string | undefined;
    if (dto.type === CompleteAccountType.Email) {
      // Determine rejection before hashing, but don't throw yet
      const shouldReject = !user || user.isAccepted;

      // Always hash the password so bcrypt cost is incurred regardless of validity
      const hashedPassword = await crypto.hashing().createHash(dto.password, appCfg.SALT_ROUNDS);

      if (shouldReject) {
        throw new BadRequestError({ message: "Invalid or expired verification code" });
      }

      const updatedUser = await authDAL.transaction(async (tx) => {
        const us = await userDAL.updateById(
          user.id,
          { firstName: dto.firstName, lastName: dto.lastName, isAccepted: true, hashedPassword },
          tx
        );

        // Step 4: Check org membership — create org if self-signup with no existing membership
        const existingMemberships = await orgDAL.findMembership(
          {
            actorUserId: user.id,
            scope: AccessScope.Organization
          },
          { tx }
        );
        const isInvitedUser = existingMemberships.length > 0;
        if (!isInvitedUser && dto.organizationName) {
          const org = await orgService.createOrganization(
            {
              userId: user.id,
              userEmail: user.email ?? user.username,
              orgName: dto.organizationName
            },
            tx
          );

          organizationId = org.id;
        }

        return { ...us, hashedPassword: null };
      });
      user = updatedUser;
      authMethod = AuthMethod.EMAIL;
    } else {
      // Alias verification
      const userAlias = decodedToken.aliasId
        ? await userAliasDAL.findOne({
            id: decodedToken.aliasId,
            userId: user?.id ?? DUMMY_USER_ID
          })
        : null;

      // Determine rejection before token validation, but don't throw yet
      const shouldReject = !user || !decodedToken.aliasId || !userAlias;

      // Always validate the verification code so the bcrypt cost is incurred
      // Use dummy userId when rejecting so the work is still performed
      try {
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_VERIFICATION,
          userId: shouldReject ? DUMMY_USER_ID : user.id,
          code: dto.code
        });
      } catch {
        throw new BadRequestError({ message: "Invalid or expired verification code" });
      }

      if (shouldReject) {
        throw new BadRequestError({ message: "Invalid or expired verification code" });
      }

      // Mark alias as verified
      await userAliasDAL.updateById(userAlias.id, { isEmailVerified: true });

      // Update user-level verification flags based on auth method
      const userUpdates: Record<string, boolean> = { isEmailVerified: true };
      if (decodedToken.authMethod === AuthMethod.GOOGLE) {
        userUpdates.isGoogleVerified = true;
      } else if (decodedToken.authMethod === AuthMethod.GITHUB) {
        userUpdates.isGitHubVerified = true;
      } else if (decodedToken.authMethod === AuthMethod.GITLAB) {
        userUpdates.isGitLabVerified = true;
      }
      if (!user.isAccepted) {
        userUpdates.isAccepted = true;
      }

      if (userAlias?.orgId) {
        await orgDAL.updateMembership(
          {
            actorUserId: user.id,
            scope: AccessScope.Organization,
            scopeOrgId: userAlias.orgId
          },
          {
            status: OrgMembershipStatus.Accepted
          }
        );
      }

      user = await userDAL.updateById(user.id, userUpdates);
      authMethod = decodedToken.authMethod;
    }

    // Step 5: Issue session tokens
    const tokens = await loginService.generateUserTokens({
      userId: user.id,
      ip: dto.ip,
      userAgent: dto.userAgent,
      authMethod,
      organizationId
    });

    return {
      user,
      accessToken: tokens.access,
      refreshToken: tokens.refresh,
      authMethod,
      organizationId
    };
  };

  return {
    beginEmailSignupProcess,
    verifyEmailSignup,
    completeAccount
  };
};
