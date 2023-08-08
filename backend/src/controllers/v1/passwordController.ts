import { Request, Response } from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsrp = require("jsrp");
import * as bigintConversion from "bigint-conversion";
import { BackupPrivateKey, LoginSRPDetail, User } from "../../models";
import { clearTokens, createToken, sendMail } from "../../helpers";
import { TokenService } from "../../services";
import { TOKEN_EMAIL_PASSWORD_RESET } from "../../variables";
import { BadRequestError } from "../../utils/errors";
import {
  getHttpsEnabled,
  getJwtSignupLifetime,
  getJwtSignupSecret,
  getSiteURL
} from "../../config";
import { ActorType } from "../../ee/models";

/**
 * Password reset step 1: Send email verification link to email [email]
 * for account recovery.
 * @param req
 * @param res
 * @returns
 */
export const emailPasswordReset = async (req: Request, res: Response) => {
  const email: string = req.body.email;

  const user = await User.findOne({ email }).select("+publicKey");
  if (!user || !user?.publicKey) {
    // case: user has already completed account

    return res.status(200).send({
      message: "If an account exists with this email, a password reset link has been sent"
    });
  }

  const token = await TokenService.createToken({
    type: TOKEN_EMAIL_PASSWORD_RESET,
    email
  });

  await sendMail({
    template: "passwordReset.handlebars",
    subjectLine: "Infisical password reset",
    recipients: [email],
    substitutions: {
      email,
      token,
      callback_url: (await getSiteURL()) + "/password-reset"
    }
  });

  return res.status(200).send({
    message: "If an account exists with this email, a password reset link has been sent"
  });
};

/**
 * Password reset step 2: Verify email verification link sent to email [email]
 * @param req
 * @param res
 * @returns
 */
export const emailPasswordResetVerify = async (req: Request, res: Response) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email }).select("+publicKey");
  if (!user || !user?.publicKey) {
    // case: user doesn't exist with email [email] or
    // hasn't even completed their account
    return res.status(403).send({
      error: "Failed email verification for password reset"
    });
  }

  await TokenService.validateToken({
    type: TOKEN_EMAIL_PASSWORD_RESET,
    email,
    token: code
  });

  // generate temporary password-reset token
  const token = createToken({
    payload: {
      userId: user._id.toString()
    },
    expiresIn: await getJwtSignupLifetime(),
    secret: await getJwtSignupSecret()
  });

  return res.status(200).send({
    message: "Successfully verified email",
    user,
    token
  });
};

/**
 * Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const srp1 = async (req: Request, res: Response) => {
  // return salt, serverPublicKey as part of first step of SRP protocol

  const { clientPublicKey } = req.body;
  const user = await User.findOne({
    email: req.user.email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier
    },
    async () => {
      // generate server-side public key
      const serverPublicKey = server.getPublicKey();

      await LoginSRPDetail.findOneAndReplace(
        { email: req.user.email },
        {
          email: req.user.email,
          clientPublicKey: clientPublicKey,
          serverBInt: bigintConversion.bigintToBuf(server.bInt)
        },
        { upsert: true, returnNewDocument: false }
      );

      return res.status(200).send({
        serverPublicKey,
        salt: user.salt
      });
    }
  );
};

/**
 * Change account SRP authentication information for user
 * Requires verifying [clientProof] as part of step 2 of SRP protocol
 * as initiated in POST /srp1
 * @param req
 * @param res
 * @returns
 */
export const changePassword = async (req: Request, res: Response) => {
  const {
    clientProof,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier
  } = req.body;

  const user = await User.findOne({
    email: req.user.email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  const loginSRPDetailFromDB = await LoginSRPDetail.findOneAndDelete({ email: req.user.email });

  if (!loginSRPDetailFromDB) {
    return BadRequestError(
      Error(
        "It looks like some details from the first login are not found. Please try login one again"
      )
    );
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetailFromDB.serverBInt
    },
    async () => {
      server.setClientPublicKey(loginSRPDetailFromDB.clientPublicKey);

      // compare server and client shared keys
      if (server.checkClientProof(clientProof)) {
        // change password

        await User.findByIdAndUpdate(
          req.user._id.toString(),
          {
            encryptionVersion: 2,
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
            encryptedPrivateKey,
            iv: encryptedPrivateKeyIV,
            tag: encryptedPrivateKeyTag,
            salt,
            verifier
          },
          {
            new: true
          }
        );

        if (
          req.authData.actor.type === ActorType.USER &&
          req.authData.tokenVersionId
        ) {
          await clearTokens(req.authData.tokenVersionId);
        }

        // clear httpOnly cookie

        res.cookie("jid", "", {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: (await getHttpsEnabled()) as boolean
        });

        return res.status(200).send({
          message: "Successfully changed password"
        });
      }

      return res.status(400).send({
        error: "Failed to change password. Try again?"
      });
    }
  );
};

/**
 * Create or change backup private key for user
 * @param req
 * @param res
 * @returns
 */
export const createBackupPrivateKey = async (req: Request, res: Response) => {
  // create/change backup private key
  // requires verifying [clientProof] as part of second step of SRP protocol
  // as initiated in /srp1

  const { clientProof, encryptedPrivateKey, iv, tag, salt, verifier } = req.body;
  const user = await User.findOne({
    email: req.user.email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  const loginSRPDetailFromDB = await LoginSRPDetail.findOneAndDelete({ email: req.user.email });

  if (!loginSRPDetailFromDB) {
    return BadRequestError(
      Error(
        "It looks like some details from the first login are not found. Please try login one again"
      )
    );
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetailFromDB.serverBInt
    },
    async () => {
      server.setClientPublicKey(loginSRPDetailFromDB.clientPublicKey);

      // compare server and client shared keys
      if (server.checkClientProof(clientProof)) {
        // create new or replace backup private key

        const backupPrivateKey = await BackupPrivateKey.findOneAndUpdate(
          { user: req.user._id },
          {
            user: req.user._id,
            encryptedPrivateKey,
            iv,
            tag,
            salt,
            verifier
          },
          { upsert: true, new: true }
        ).select("+user, encryptedPrivateKey");

        // issue tokens
        return res.status(200).send({
          message: "Successfully updated backup private key",
          backupPrivateKey
        });
      }

      return res.status(400).send({
        message: "Failed to update backup private key"
      });
    }
  );
};

/**
 * Return backup private key for user
 * @param req
 * @param res
 * @returns
 */
export const getBackupPrivateKey = async (req: Request, res: Response) => {
  const backupPrivateKey = await BackupPrivateKey.findOne({
    user: req.user._id
  }).select("+encryptedPrivateKey +iv +tag");

  if (!backupPrivateKey) throw new Error("Failed to find backup private key");

  return res.status(200).send({
    backupPrivateKey
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const {
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier
  } = req.body;

  await User.findByIdAndUpdate(
    req.user._id.toString(),
    {
      encryptionVersion: 2,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      iv: encryptedPrivateKeyIV,
      tag: encryptedPrivateKeyTag,
      salt,
      verifier
    },
    {
      new: true
    }
  );

  return res.status(200).send({
    message: "Successfully reset password"
  });
};
