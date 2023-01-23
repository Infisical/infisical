/* eslint-disable @typescript-eslint/no-var-requires */
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import * as bigintConversion from 'bigint-conversion';
const jsrp = require('jsrp');
import { User } from '../../models';
import { issueTokens } from '../../helpers/auth';
import { sendMail } from '../../helpers/nodemailer';
import { TokenService } from '../../services';
import {
  NODE_ENV
} from '../../config';
import {
  TOKEN_EMAIL_MFA
} from '../../variables';

declare module 'jsonwebtoken' {
  export interface UserIDJwtPayload extends jwt.JwtPayload {
    userId: string;
  }
}

const clientPublicKeys: any = {};

/**
 * Log in user step 1: Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const login1 = async (req: Request, res: Response) => {
  try {
    const {
      email,
      clientPublicKey
    }: { email: string; clientPublicKey: string } = req.body;

    const user = await User.findOne({
      email
    }).select('+salt +verifier');

    if (!user) throw new Error('Failed to find user');

    const server = new jsrp.server();
    server.init(
      {
        salt: user.salt,
        verifier: user.verifier
      },
      () => {
        // generate server-side public key
        const serverPublicKey = server.getPublicKey();
        clientPublicKeys[email] = {
          clientPublicKey,
          serverBInt: bigintConversion.bigintToBuf(server.bInt)
        };

        return res.status(200).send({
          serverPublicKey,
          salt: user.salt
        });
      }
    );
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to start authentication process'
    });
  }
};

/**
 * Log in user step 2: complete step 2 of SRP protocol and return token and their (encrypted)
 * private key
 * @param req
 * @param res
 * @returns
 */
export const login2 = async (req: Request, res: Response) => {

    // check to see if user has MFA enabled; if yes then issue MFA-token
    // TODO: may have to figure out a better token system for tokens with varying expirations
    // (e.g. for org-invitations vs. auth etc.)
  try {
    const { email, clientProof } = req.body;
    const user = await User.findOne({
      email
    }).select('+salt +verifier +publicKey +encryptedPrivateKey +iv +tag');

    if (!user) throw new Error('Failed to find user');

    const server = new jsrp.server();
    server.init(
      {
        salt: user.salt,
        verifier: user.verifier,
        b: clientPublicKeys[email].serverBInt
      },
      async () => {
        server.setClientPublicKey(clientPublicKeys[email].clientPublicKey);

        // compare server and client shared keys
        if (server.checkClientProof(clientProof)) {

          if (user.isMfaEnabled) {
            // case: user has MFA enabled
          
            const code = await TokenService.createToken({
              type: TOKEN_EMAIL_MFA,
              email
            });
            
            // send MFA code [code] to [email]
            await sendMail({
              template: 'emailMfa.handlebars',
              subjectLine: 'Infisical MFA code',
              recipients: [email],
              substitutions: {
                code
              }
            });
            
            return res.status(200).send({
              mfaEnabled: true
            });
          }

          // issue tokens
          const tokens = await issueTokens({ userId: user._id.toString() });

          // store (refresh) token in httpOnly cookie
          res.cookie('jid', tokens.refreshToken, {
            httpOnly: true,
            path: '/',
            sameSite: 'strict',
            secure: NODE_ENV === 'production' ? true : false
          });

          // case: user does not have MFA enabled
          // return (access) token in response
          return res.status(200).send({
            mfaEnabled: false,
            token: tokens.token,
            publicKey: user.publicKey,
            encryptedPrivateKey: user.encryptedPrivateKey,
            iv: user.iv,
            tag: user.tag
          });
        }

        return res.status(400).send({
          message: 'Failed to authenticate. Try again?'
        });
      }
    );
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to authenticate. Try again?'
    });
  }
};

/**
 * Verify MFA token [mfaToken] and issue JWT and refresh tokens if the
 * MFA token [mfaToken] is valid
 * @param req 
 * @param res 
 */
export const verifyMfaToken = async (req: Request, res: Response) => {
  try {
    const { email, mfaToken } = req.body;

    await TokenService.validateToken({
      type: TOKEN_EMAIL_MFA,
      email,
      token: mfaToken
    });

    const user = await User.findOne({
      email
    }).select('+salt +verifier +publicKey +encryptedPrivateKey +iv +tag');

    if (!user) throw new Error('Failed to find user'); 

    // issue tokens
    const tokens = await issueTokens({ userId: user._id.toString() });

    // store (refresh) token in httpOnly cookie
    res.cookie('jid', tokens.refreshToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
      secure: NODE_ENV === 'production' ? true : false
    });

    // case: user does not have MFA enabled
    // return (access) token in response
    return res.status(200).send({
      token: tokens.token,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      iv: user.iv,
      tag: user.tag
    }); 
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to authenticate. Try again?'
    });
  }
}