import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { sanitizeEmail, validateEmail } from "@app/lib/validator";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { getRequiredMfaMethod } from "../auth/auth-fns";
import { ActorType, AuthMethod, AuthModeSignUpTokenPayload, AuthTokenType, MfaMethod } from "../auth/auth-type";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TMfaRecoveryCodeServiceFactory } from "../mfa-recovery-code/mfa-recovery-code-service";
import { TTotpConfigDALFactory } from "../totp/totp-config-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TWebAuthnCredentialDALFactory } from "../webauthn/webauthn-credential-dal";
import { TUserDALFactory } from "./user-dal";
import {
  TActivateUserMfaDTO,
  TDeactivateUserMfaDTO,
  TListUserGroupsDTO,
  TSetSelectedMfaMethodDTO,
  TUpdateUserEmailDTO,
  TVerifyCurrentEmailOTPDTO
} from "./user-types";

type TUserServiceFactoryDep = {
  userDAL: Pick<
    TUserDALFactory,
    | "find"
    | "findOne"
    | "findById"
    | "transaction"
    | "updateById"
    | "update"
    | "deleteById"
    | "findOneUserAction"
    | "createUserAction"
    | "findUserEncKeyByUserId"
    | "delete"
    | "findAllMyAccounts"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "findByUserId">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "find" | "findEffectiveOrgMembership" | "findEffectiveOrgMemberships">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find" | "insertMany" | "findOne" | "updateById">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser" | "revokeAllMySessions">;
  smtpService: Pick<TSmtpService, "sendMail">;
  permissionService: TPermissionServiceFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "find" | "updateById" | "delete">;
  totpConfigDAL: Pick<TTotpConfigDALFactory, "findOne">;
  webAuthnCredentialDAL: Pick<TWebAuthnCredentialDALFactory, "find">;
  mfaRecoveryCodeService: Pick<TMfaRecoveryCodeServiceFactory, "rotateRecoveryCodes" | "deleteRecoveryCodes">;
};

export type TUserServiceFactory = ReturnType<typeof userServiceFactory>;

export const userServiceFactory = ({
  userDAL,
  orgDAL,
  membershipUserDAL,
  groupProjectDAL,
  tokenService,
  smtpService,
  permissionService,
  userAliasDAL,
  totpConfigDAL,
  webAuthnCredentialDAL,
  mfaRecoveryCodeService
}: TUserServiceFactoryDep) => {
  const sendEmailVerificationCode = async (token: string) => {
    const config = getConfig();

    const { aliasId, userId, authTokenType } = crypto
      .jwt()
      .verify(token, config.AUTH_SECRET) as AuthModeSignUpTokenPayload;
    if (authTokenType !== AuthTokenType.SIGNUP_TOKEN) throw new BadRequestError({ name: "Invalid auth token type" });

    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ message: "Invalid token" });

    let { isEmailVerified } = user;
    if (aliasId) {
      const userAlias = await userAliasDAL.findOne({ userId: user.id, id: aliasId });
      if (!userAlias) throw new NotFoundError({ name: `User alias with ID '${aliasId}' not found` });
      isEmailVerified = userAlias.isEmailVerified;
    }

    if (!user.email) throw new BadRequestError({ message: "Invalid token" });
    if (isEmailVerified) throw new BadRequestError({ name: "Invalid token" });

    const userToken = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_VERIFICATION,
      userId: user.id,
      aliasId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: `Infisical confirmation code: ${userToken}`,
      recipients: [user.email],
      substitutions: {
        code: userToken
      }
    });
  };

  // A method can only be selected/activated once the user has actually configured
  // that factor. EMAIL uses the account email, so it needs no enrollment, but it
  // delivers codes over SMTP — which self-hosted instances may not have configured.
  const assertMfaMethodConfigured = async (userId: string, method: MfaMethod) => {
    if (method === MfaMethod.EMAIL) {
      if (!getConfig().isSmtpConfigured) {
        throw new BadRequestError({
          message: "Cannot use email two-factor authentication because SMTP is not configured for this instance"
        });
      }
    } else if (method === MfaMethod.TOTP) {
      const totpConfig = await totpConfigDAL.findOne({ userId, isVerified: true });
      if (!totpConfig) {
        throw new BadRequestError({
          message: "Cannot select an authenticator app without a verified authenticator configured"
        });
      }
    } else if (method === MfaMethod.WEBAUTHN) {
      const credentials = await webAuthnCredentialDAL.find({ userId });
      if (credentials.length === 0) {
        throw new BadRequestError({
          message: "Cannot select a passkey without a registered passkey"
        });
      }
    }
  };

  // Enables MFA for the account. Enabling always issues a fresh recovery-code pool
  // (invalidating any prior codes) and returns it so the caller can surface the
  // codes to the user once. EMAIL requires no prior enrollment, so this doubles as
  // first-time setup; other methods must already be configured (asserted below).
  const activateMfa = async ({ userId, selectedMfaMethod }: TActivateUserMfaDTO) => {
    const user = await userDAL.findById(userId);
    if (!user || !user.email || user.isMfaEnabled) throw new BadRequestError({ name: "Failed to enable MFA" });

    const method = selectedMfaMethod ?? (user.selectedMfaMethod as MfaMethod | null) ?? MfaMethod.EMAIL;
    await assertMfaMethodConfigured(userId, method);

    const { recoveryCodes, updatedUser } = await userDAL.transaction(async (tx) => {
      const codes = await mfaRecoveryCodeService.rotateRecoveryCodes({
        userId,
        skipMfaEnabledCheck: true,
        tx
      });

      const updated = await userDAL.updateById(
        userId,
        {
          isMfaEnabled: true,
          selectedMfaMethod: method
        },
        tx
      );

      return { recoveryCodes: codes, updatedUser: updated };
    });

    return { user: updatedUser, recoveryCodes };
  };

  // MFA cannot be turned off while any organization the user belongs to enforces it,
  // since doing so would lock them out of that org on the next login. This is the
  // authoritative backend rule (the UI only greys out the button as a hint) and is
  // enforced both up front in the disable route — so the user isn't put through a
  // step-up challenge only to be rejected — and again here in deactivateMfa as the
  // single source of truth that actually gates the state change.
  const assertMfaDisableAllowed = async (userId: string) => {
    const userOrgMemberships = await membershipUserDAL.find({
      actorUserId: userId,
      scope: AccessScope.Organization
    });
    if (!userOrgMemberships.length) return;

    const orgIds = userOrgMemberships.map((membership) => membership.scopeOrgId);
    const organizations = await orgDAL.find({ $in: { id: orgIds } });
    if (organizations.some((org) => org.enforceMfa)) {
      throw new ForbiddenRequestError({
        message: "Two-factor authentication is required by your organization and cannot be disabled"
      });
    }
  };

  // Disables MFA. Enrolled factors are preserved so re-enabling does not require
  // re-enrollment, but the recovery-code pool is wiped so codes never outlive the
  // enabled state; a fresh pool is issued on the next enable.
  const deactivateMfa = async ({ userId }: TDeactivateUserMfaDTO) => {
    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ name: "Failed to disable MFA" });

    await assertMfaDisableAllowed(userId);

    const updatedUser = await userDAL.transaction(async (tx) => {
      const updated = await userDAL.updateById(userId, { isMfaEnabled: false }, tx);
      await mfaRecoveryCodeService.deleteRecoveryCodes({ userId, tx });
      return updated;
    });

    return updatedUser;
  };

  // Updates only the preferred challenge method among already-configured factors.
  const setSelectedMfaMethod = async ({ userId, selectedMfaMethod }: TSetSelectedMfaMethodDTO) => {
    const user = await userDAL.findById(userId);
    if (!user) throw new BadRequestError({ name: "Failed to update MFA method" });

    await assertMfaMethodConfigured(userId, selectedMfaMethod);

    return userDAL.updateById(userId, { selectedMfaMethod });
  };

  const updateUserName = async (userId: string, firstName: string, lastName: string) => {
    const updatedUser = await userDAL.updateById(userId, {
      firstName,
      lastName
    });
    return updatedUser;
  };

  const updateAuthMethods = async (userId: string, authMethods: AuthMethod[]) => {
    const user = await userDAL.findById(userId);
    if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "UpdateAuthMethods" });

    if (user.authMethods?.includes(AuthMethod.LDAP) || authMethods.includes(AuthMethod.LDAP)) {
      throw new BadRequestError({ message: "LDAP auth method cannot be updated", name: "UpdateAuthMethods" });
    }

    // When email auth is removed, clear the stored password so no stale credential lingers.
    // Re-enabling email auth later requires a fresh password via the setup flow.
    const isRemovingEmailAuth = user.authMethods?.includes(AuthMethod.EMAIL) && !authMethods.includes(AuthMethod.EMAIL);

    const updatedUser = await userDAL.updateById(userId, {
      authMethods,
      ...(isRemovingEmailAuth ? { hashedPassword: null } : {})
    });
    return updatedUser;
  };

  const checkUserScimRestriction = async (userId: string, tx?: Knex) => {
    const userOrgs = await membershipUserDAL.find(
      {
        actorUserId: userId,
        scope: AccessScope.Organization
      },
      { tx }
    );

    if (userOrgs.length === 0) {
      return false;
    }

    const orgIds = userOrgs.map((membership) => membership.scopeOrgId);
    const organizations = await orgDAL.find({ $in: { id: orgIds } }, { tx });

    return organizations.some((org) => org.scimEnabled);
  };

  const requestEmailChangeOTP = async ({ userId, newEmail }: TUpdateUserEmailDTO) => {
    const startTime = new Date();
    const normalizedNewEmail = sanitizeEmail(newEmail);
    validateEmail(normalizedNewEmail);
    const changeEmailOTP = await userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(userId, tx);
      if (!user)
        throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "RequestEmailChangeOTP" });

      if (user.authMethods?.includes(AuthMethod.LDAP)) {
        throw new BadRequestError({ message: "Cannot update email for LDAP users", name: "RequestEmailChangeOTP" });
      }

      if (!user.email) {
        throw new BadRequestError({
          message: "Cannot change email: no current email address is set on this account.",
          name: "RequestEmailChangeOTP"
        });
      }

      const hasScimRestriction = await checkUserScimRestriction(userId, tx);
      if (hasScimRestriction) {
        throw new BadRequestError({
          message: "Email changes are disabled because SCIM is enabled for one or more of your organizations",
          name: "RequestEmailChangeOTP"
        });
      }

      // Silently check if another user already has this email - don't send OTP if email is taken
      const existingUser = await userDAL.findOne({ username: normalizedNewEmail }, tx);
      if (!existingUser) {
        // Step 1 of 2: send OTP to the CURRENT email so the legitimate owner must approve
        // the change before any code is sent to the new address.
        const otpCode = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_CHANGE_CURRENT_OTP,
          userId,
          payload: newEmail.toLowerCase()
        });

        await smtpService.sendMail({
          template: SmtpTemplates.EmailChangeRequestNotification,
          subjectLine: "Confirm your Infisical email change",
          recipients: [user.email],
          substitutions: {
            currentEmail: user.email,
            requestedEmail: newEmail.toLowerCase(),
            code: otpCode
          }
        });
      }

      return { success: true, message: "Verification code sent to current email address" };
    });
    // Force this function to have a minimum execution time of 2 seconds to avoid possible information disclosure about existing users
    const endTime = new Date();
    const timeDiff = endTime.getTime() - startTime.getTime();
    if (timeDiff < 2000) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000 - timeDiff);
      });
    }
    return changeEmailOTP;
  };

  const verifyCurrentEmailOTP = async ({ userId, otpCode }: TVerifyCurrentEmailOTPDTO) => {
    return userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(userId, tx);
      if (!user)
        throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "VerifyCurrentEmailOTP" });

      if (user.authMethods?.includes(AuthMethod.LDAP)) {
        throw new BadRequestError({ message: "Cannot update email for LDAP users", name: "VerifyCurrentEmailOTP" });
      }

      const hasScimRestriction = await checkUserScimRestriction(userId, tx);
      if (hasScimRestriction) {
        throw new BadRequestError({
          message: "Email changes are disabled because SCIM is enabled for one or more of your organizations",
          name: "VerifyCurrentEmailOTP"
        });
      }

      let tokenData;
      try {
        tokenData = await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_CHANGE_CURRENT_OTP,
          userId,
          code: otpCode
        });
      } catch (error) {
        throw new BadRequestError({ message: "Invalid verification code", name: "VerifyCurrentEmailOTP" });
      }

      const newEmail = tokenData?.payload;
      if (!newEmail) {
        throw new BadRequestError({ message: "Invalid verification code", name: "VerifyCurrentEmailOTP" });
      }

      // Re-check availability — someone else may have claimed this email since the request was issued
      const existingUser = await userDAL.findOne({ username: newEmail }, tx);
      if (existingUser) {
        throw new BadRequestError({ message: "Email is no longer available", name: "VerifyCurrentEmailOTP" });
      }

      // Step 2 of 2: now that current-email control is proven, send OTP to the NEW address
      const newEmailOtpCode = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_CHANGE_OTP,
        userId,
        payload: newEmail
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: "Infisical email change verification",
        recipients: [newEmail],
        substitutions: {
          code: newEmailOtpCode
        }
      });

      return { success: true, newEmail };
    });
  };

  const updateUserEmail = async ({
    userId,
    newEmail: unsanitizedEmail,
    otpCode
  }: TUpdateUserEmailDTO & { otpCode: string }) => {
    const newEmail = sanitizeEmail(unsanitizedEmail);
    validateEmail(newEmail);

    const changedUser = await userDAL.transaction(async (tx) => {
      const user = await userDAL.findById(userId, tx);
      if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "UpdateUserEmail" });

      if (user.authMethods?.includes(AuthMethod.LDAP)) {
        throw new BadRequestError({ message: "Cannot update email for LDAP users", name: "UpdateUserEmail" });
      }

      const hasScimRestriction = await checkUserScimRestriction(userId, tx);
      if (hasScimRestriction) {
        throw new BadRequestError({
          message: "You are part of an organization that has SCIM enabled, and email changes are not allowed",
          name: "UpdateUserEmail"
        });
      }

      // Validate OTP and get the new email from token aliasId field
      let tokenData;
      try {
        tokenData = await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_CHANGE_OTP,
          userId,
          code: otpCode
        });
      } catch (error) {
        throw new BadRequestError({ message: "Invalid verification code", name: "UpdateUserEmail" });
      }

      // Verify the new email matches what was stored in payload
      const tokenNewEmail = tokenData?.payload;
      if (!tokenNewEmail || tokenNewEmail !== newEmail.toLowerCase()) {
        throw new BadRequestError({ message: "Invalid verification code", name: "UpdateUserEmail" });
      }

      // Final check if another user has this email
      const existingUser = await userDAL.findOne({ username: newEmail }, tx);
      if (existingUser) {
        throw new BadRequestError({ message: "Email is no longer available", name: "UpdateUserEmail" });
      }

      // Delete all user aliases since the email is changing
      await userAliasDAL.delete({ userId }, tx);

      // Ensure EMAIL auth method is included if not already present
      const currentAuthMethods = user.authMethods || [];
      const updatedAuthMethods = currentAuthMethods.includes(AuthMethod.EMAIL)
        ? currentAuthMethods
        : [...currentAuthMethods, AuthMethod.EMAIL];

      const updatedUser = await userDAL.updateById(
        userId,
        {
          email: newEmail.toLowerCase(),
          username: newEmail.toLowerCase(),
          authMethods: updatedAuthMethods
        },
        tx
      );

      // Revoke all sessions to force re-login
      await tokenService.revokeAllMySessions(userId);

      return updatedUser;
    });
    return changedUser;
  };

  const getAllMyAccounts = async (email: string, userId: string) => {
    const users = await userDAL.findAllMyAccounts(email);
    return users?.map((el) => ({ ...el, isMyAccount: el.id === userId }));
  };

  const removeMyDuplicateAccounts = async (email: string, userId: string) => {
    const users = await userDAL.find({ email });
    const duplicatedAccounts = users?.filter((el) => el.id !== userId);
    const myAccount = users?.find((el) => el.id === userId);
    if (duplicatedAccounts.length && myAccount) {
      await userDAL.transaction(async (tx) => {
        await userDAL.delete({ $in: { id: duplicatedAccounts?.map((el) => el.id) } }, tx);
        await userDAL.updateById(userId, { username: (myAccount.email || myAccount.username).toLowerCase() }, tx);
      });
    }
  };

  const getMe = async (userId: string) => {
    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) throw new NotFoundError({ message: `User with ID '${userId}' not found`, name: "GetMe" });

    return {
      ...user,
      hashedPassword: null,
      encryptionVersion: 2
    };
  };

  // Resolves the MFA method a step-up challenge must use, from the current org
  // context. Recovery codes bypass the org-required method at login, so the step-up
  // that gates them must challenge that same method rather than the user's personal
  // preference (which could be weaker, e.g. email while the org enforces passkeys).
  // Mirrors login via the shared getRequiredMfaMethod: an org enforcing MFA dictates
  // the method, otherwise the user's own preference applies. Reaching a step-up-gated
  // route already proves membership of this org, so no permission check is needed.
  const getStepUpMfaMethod = async (userId: string, orgId: string): Promise<MfaMethod> => {
    const [user, org] = await Promise.all([userDAL.findById(userId), orgDAL.findById(orgId)]);
    const { requiredMfaMethod } = getRequiredMfaMethod(org ?? {}, user ?? {});
    return requiredMfaMethod;
  };

  const deleteUser = async (userId: string) => {
    // If the deleting user is the only remaining server admin, block self-deletion.
    // The super_admin table's `initialized` flag is not reset on user delete, so
    // letting the last super admin self-delete leaves /admin/signup permanently
    // redirecting to /login — the instance becomes unrecoverable without direct
    // DB intervention (#6091). The super-admin-service.deleteUser path enforces
    // the same guard for admin-initiated deletes; this mirrors it for self-delete.
    const userToDelete = await userDAL.findById(userId);

    if (userToDelete?.superAdmin) {
      const superAdmins = await userDAL.find({ superAdmin: true });
      if (superAdmins.length === 1 && superAdmins[0].id === userId) {
        throw new BadRequestError({
          message:
            "Cannot delete the only server admin on this instance. Promote another user to server admin before deleting this account."
        });
      }
    }

    const user = await userDAL.deleteById(userId);

    try {
      if (user?.email) {
        // Send email to user to confirm account deletion
        await smtpService.sendMail({
          template: SmtpTemplates.AccountDeletionConfirmation,
          subjectLine: "Your Infisical account has been deleted",
          recipients: [user.email],
          substitutions: {
            email: user.email
          }
        });
      }
    } catch (error) {
      logger.error(error, `Failed to send account deletion confirmation email to ${user.email}`);
    }

    return user;
  };

  // user actions operations
  const createUserAction = async (userId: string, action: string) => {
    const userAction = await userDAL.transaction(async (tx) => {
      const existingAction = await userDAL.findOneUserAction({ action, userId }, tx);
      if (existingAction) return existingAction;
      return userDAL.createUserAction({ action, userId }, tx);
    });

    return userAction;
  };

  const getUserAction = async (userId: string, action: string) => {
    const userAction = await userDAL.findOneUserAction({ action, userId });
    return userAction;
  };

  const unlockUser = async (userId: string, token: string) => {
    await tokenService.validateTokenForUser({
      userId,
      code: token,
      type: TokenType.TOKEN_USER_UNLOCK
    });

    await userDAL.update(
      { id: userId },
      { consecutiveFailedMfaAttempts: 0, isLocked: false, temporaryLockDateEnd: null }
    );
  };

  const getUserProjectFavorites = async (userId: string, orgId: string) => {
    const orgMemberships = await orgDAL.findEffectiveOrgMemberships({
      actorType: ActorType.USER,
      actorId: userId,
      orgId
    });

    if (!orgMemberships.length) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    // Project favorites are stored on the user's direct membership row; group-only members have no favorites
    const directMembership = orgMemberships.find((m) => m.actorUserId === userId);
    const projectFavorites = directMembership?.projectFavorites ?? [];
    return { projectFavorites };
  };

  const updateUserProjectFavorites = async (userId: string, orgId: string, projectIds: string[]) => {
    const orgMemberships = await orgDAL.findEffectiveOrgMemberships({
      actorType: ActorType.USER,
      actorId: userId,
      orgId
    });

    if (!orgMemberships.length) {
      throw new ForbiddenRequestError({
        message: "User does not belong in the organization."
      });
    }

    const directMembership = orgMemberships.find((m) => m.actorUserId === userId);
    if (!directMembership) {
      throw new ForbiddenRequestError({
        message: "Project favorites can only be updated when you have direct membership in the organization."
      });
    }

    const matchingUserProjectMemberships = await membershipUserDAL.find({
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      actorUserId: userId,
      $in: {
        scopeProjectId: projectIds
      }
    });

    const memberProjectFavorites = matchingUserProjectMemberships.map(
      (projectMembership) => projectMembership.scopeProjectId as string
    );

    const updatedOrgMembership = await membershipUserDAL.updateById(directMembership.id, {
      projectFavorites: memberProjectFavorites
    });

    return updatedOrgMembership.projectFavorites;
  };

  const listUserGroups = async ({ username, actorOrgId, actor, actorId, actorAuthMethod }: TListUserGroupsDTO) => {
    // akhilmhdh: case sensitive email resolution
    const user = await userDAL.findOne({ username });

    if (!user) throw new NotFoundError({ name: `User with username '${username}' not found` });

    // This makes it so the user can always read information about themselves, but no one else if they don't have the Members Read permission.
    if (user.id !== actorId) {
      const { permission } = await permissionService.getOrgPermission({
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
    }

    const memberships = await groupProjectDAL.findByUserId(user.id, actorOrgId);
    return memberships;
  };

  return {
    sendEmailVerificationCode,
    activateMfa,
    deactivateMfa,
    assertMfaDisableAllowed,
    setSelectedMfaMethod,
    updateUserName,
    updateAuthMethods,
    requestEmailChangeOTP,
    verifyCurrentEmailOTP,
    updateUserEmail,
    deleteUser,
    getMe,
    getStepUpMfaMethod,
    createUserAction,
    listUserGroups,
    getUserAction,
    unlockUser,
    getAllMyAccounts,
    getUserProjectFavorites,
    removeMyDuplicateAccounts,
    updateUserProjectFavorites
  };
};
