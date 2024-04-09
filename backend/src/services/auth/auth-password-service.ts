import jwt from "jsonwebtoken";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TAuthDALFactory } from "./auth-dal";
import { TChangePasswordDTO, TCreateBackupPrivateKeyDTO, TResetPasswordViaBackupKeyDTO } from "./auth-password-type";
import { AuthTokenType } from "./auth-type";

type TAuthPasswordServiceFactoryDep = {
  authDAL: TAuthDALFactory;
  userDAL: TUserDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAuthPasswordFactory = ReturnType<typeof authPaswordServiceFactory>;
export const authPaswordServiceFactory = ({
  authDAL,
  userDAL,
  tokenService,
  smtpService
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
    tokenVersionId
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
      clientPublicKey: null
    });

    if (tokenVersionId) {
      await tokenService.clearTokenSessionById(userEnc.userId, tokenVersionId);
    }
  };

  /*
   * Email password reset flow via email. Step 1 send email
   */
  const sendPasswordResetEmail = async (email: string) => {
    const user = await userDAL.findUserByUsername(email);
    // ignore as user is not found to avoid an outside entity to identify infisical registered accounts
    if (!user || (user && !user.isAccepted)) return;

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
  };

  /*
   * Step 2 of reset password. Verify the token and inject a temp token to reset password
   * */
  const verifyPasswordResetEmail = async (email: string, code: string) => {
    const cfg = getConfig();
    const user = await userDAL.findUserByUsername(email);
    // ignore as user is not found to avoid an outside entity to identify infisical registered accounts
    if (!user || (user && !user.isAccepted)) {
      throw new Error("Failed email verification for pass reset");
    }

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_PASSWORD_RESET,
      userId: user.id,
      code
    });

    const token = jwt.sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id
      },
      cfg.AUTH_SECRET,
      { expiresIn: cfg.JWT_SIGNUP_LIFETIME }
    );

    return { token, user };
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
    userId
  }: TResetPasswordViaBackupKeyDTO) => {
    await userDAL.updateUserEncryptionByUserId(userId, {
      encryptionVersion: 2,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      salt,
      verifier
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

  return {
    generateServerPubKey,
    changePassword,
    resetPasswordByBackupKey,
    sendPasswordResetEmail,
    verifyPasswordResetEmail,
    createBackupPrivateKey,
    getBackupPrivateKeyOfUser
  };
};
