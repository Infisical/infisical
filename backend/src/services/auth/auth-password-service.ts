import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { crypto } from "@app/lib/crypto/cryptography";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
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
  TChangePasswordDTO,
  TCreateBackupPrivateKeyDTO,
  TResetPasswordV2DTO,
  TResetPasswordViaBackupKeyDTO,
  TSetupPasswordViaBackupKeyDTO
} from "./auth-password-type";
import { ActorType, AuthMethod, AuthTokenType } from "./auth-type";

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
  /*
   * Pre setup for pass change with srp protocol
   * Gets srp server user salt and server public key
   */
  const generateServerPubKey = async (userId: string, clientPublicKey: string) => {
    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to find user");

    const serverSrpKey = await generateSrpServerKey(userEnc.salt, userEnc.verifier);
    const userEncKeys = await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      clientPublicKey,
      serverPrivateKey: serverSrpKey.privateKey
    });
    if (!userEncKeys) throw new Error("Failed  to update encryption key");
    return { salt: userEncKeys.salt, serverPublicKey: serverSrpKey.pubKey };
  };

  /*
   * Change password to new pass
   * */
  const changePassword = async ({
    userId,
    clientProof,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier,
    tokenVersionId,
    password
  }: TChangePasswordDTO) => {
    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to find user");

    await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      serverPrivateKey: null,
      clientPublicKey: null
    });
    if (!userEnc.serverPrivateKey || !userEnc.clientPublicKey) throw new Error("Failed to authenticate. Try again?");
    const isValidClientProof = await srpCheckClientProof(
      userEnc.salt,
      userEnc.verifier,
      userEnc.serverPrivateKey,
      userEnc.clientPublicKey,
      clientProof
    );
    if (!isValidClientProof) throw new Error("Failed to authenticate. Try again?");

    const appCfg = getConfig();
    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);
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
      serverPrivateKey: null,
      clientPublicKey: null,
      hashedPassword
    });

    if (tokenVersionId) {
      await tokenService.clearTokenSessionById(userEnc.userId, tokenVersionId);
    }
  };

  /*
   * Email password reset flow via email. Step 1 send email
   */
  const sendPasswordResetEmail = async (email: string) => {
    const sendEmail = async () => {
      const users = await userDAL.findUserByUsername(email);
      // akhilmhdh: case sensitive email resolution
      const user = users?.length > 1 ? users.find((el) => el.username === email) : users?.[0];
      if (!user) throw new BadRequestError({ message: "Failed to find user data" });

      if (user && user.isAccepted) {
        const cfg = getConfig();
        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_PASSWORD_RESET,
          userId: user.id
        });

        await smtpService.sendMail({
          template: SmtpTemplates.ResetPassword,
          recipients: [email],
          subjectLine: "Infisical password reset",
          substitutions: {
            email,
            token,
            callback_url: cfg.SITE_URL ? `${cfg.SITE_URL}/password-reset` : ""
          }
        });
      }
    };

    // note(daniel): run in background to prevent timing attacks
    void sendEmail().catch((err) => logger.error(err, "Failed to send password reset email"));
  };

  /*
   * Step 2 of reset password. Verify the token and inject a temp token to reset password
   * */
  const verifyPasswordResetEmail = async (email: string, code: string) => {
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

  const resetPasswordV2 = async ({ userId, newPassword, type, oldPassword }: TResetPasswordV2DTO) => {
    const cfg = getConfig();

    const user = await userDAL.findUserEncKeyByUserId(userId);
    if (!user) {
      throw new BadRequestError({ message: `User encryption key not found for user with ID '${userId}'` });
    }

    if (!user.authMethods?.includes(AuthMethod.EMAIL)) {
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

    const newHashedPassword = await crypto.hashing().createHash(newPassword, cfg.SALT_ROUNDS);

    // we need to get the original private key first for v2
    let privateKey: string;
    if (
      user.serverEncryptedPrivateKey &&
      user.serverEncryptedPrivateKeyTag &&
      user.serverEncryptedPrivateKeyIV &&
      user.serverEncryptedPrivateKeyEncoding &&
      user.encryptionVersion === UserEncryption.V2
    ) {
      privateKey = crypto
        .encryption()
        .symmetric()
        .decryptWithRootEncryptionKey({
          iv: user.serverEncryptedPrivateKeyIV,
          tag: user.serverEncryptedPrivateKeyTag,
          ciphertext: user.serverEncryptedPrivateKey,
          keyEncoding: user.serverEncryptedPrivateKeyEncoding as SecretKeyEncoding
        });
    } else {
      throw new BadRequestError({
        message: "Cannot reset password without current credentials or recovery method",
        name: "Reset password"
      });
    }

    const encKeys = await generateUserSrpKeys(user.username, newPassword, {
      publicKey: user.publicKey,
      privateKey
    });

    const { tag, iv, ciphertext, encoding } = crypto.encryption().symmetric().encryptWithRootEncryptionKey(privateKey);

    await userDAL.updateUserEncryptionByUserId(userId, {
      hashedPassword: newHashedPassword,

      // srp params
      salt: encKeys.salt,
      verifier: encKeys.verifier,

      protectedKey: encKeys.protectedKey,
      protectedKeyIV: encKeys.protectedKeyIV,
      protectedKeyTag: encKeys.protectedKeyTag,
      encryptedPrivateKey: encKeys.encryptedPrivateKey,
      iv: encKeys.encryptedPrivateKeyIV,
      tag: encKeys.encryptedPrivateKeyTag,

      serverEncryptedPrivateKey: ciphertext,
      serverEncryptedPrivateKeyIV: iv,
      serverEncryptedPrivateKeyTag: tag,
      serverEncryptedPrivateKeyEncoding: encoding
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

  /*
   * backup key creation to give user's their access back when lost their password
   * this also needs to do the generateServerPubKey function to be executed first
   * then only client proof can be verified
   * */
  const createBackupPrivateKey = async ({
    clientProof,
    encryptedPrivateKey,
    salt,
    verifier,
    iv,
    tag,
    userId
  }: TCreateBackupPrivateKeyDTO) => {
    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc || (userEnc && !userEnc.isAccepted)) {
      throw new Error("Failed to find user");
    }

    if (!userEnc.clientPublicKey || !userEnc.serverPrivateKey) throw new Error("failed to create backup key");
    const isValidClientProff = await srpCheckClientProof(
      userEnc.salt,
      userEnc.verifier,
      userEnc.serverPrivateKey,
      userEnc.clientPublicKey,
      clientProof
    );
    if (!isValidClientProff) throw new Error("failed to create backup key");
    const backup = await authDAL.transaction(async (tx) => {
      const backupKey = await authDAL.upsertBackupKey(
        userEnc.userId,
        {
          encryptedPrivateKey,
          iv,
          tag,
          salt,
          verifier,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8
        },
        tx
      );

      await userDAL.updateUserEncryptionByUserId(
        userEnc.userId,
        {
          serverPrivateKey: null,
          clientPublicKey: null
        },
        tx
      );
      return backupKey;
    });

    return backup;
  };

  /*
   * Return user back up
   * */
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

  const setupPassword = async (
    {
      encryptedPrivateKey,
      protectedKeyTag,
      protectedKey,
      protectedKeyIV,
      salt,
      verifier,
      encryptedPrivateKeyIV,
      encryptedPrivateKeyTag,
      password,
      token
    }: TSetupPasswordViaBackupKeyDTO,
    actor: OrgServiceActor
  ) => {
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
          encryptionVersion: 2,
          protectedKey,
          protectedKeyIV,
          protectedKeyTag,
          encryptedPrivateKey,
          iv: encryptedPrivateKeyIV,
          tag: encryptedPrivateKeyTag,
          salt,
          verifier,
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
    generateServerPubKey,
    changePassword,
    resetPasswordByBackupKey,
    sendPasswordResetEmail,
    verifyPasswordResetEmail,
    createBackupPrivateKey,
    getBackupPrivateKeyOfUser,
    sendPasswordSetupEmail,
    setupPassword,
    resetPasswordV2
  };
};
