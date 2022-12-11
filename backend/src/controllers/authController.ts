/* eslint-disable @typescript-eslint/no-var-requires */
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import * as bigintConversion from 'bigint-conversion';
const jsrp = require('jsrp');
import { User } from '../models';
import { createToken, issueTokens, clearTokens } from '../helpers/auth';
import {
  NODE_ENV,
  JWT_AUTH_LIFETIME,
  JWT_AUTH_SECRET,
  JWT_REFRESH_SECRET
} from '../config';

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
          // issue tokens
          const tokens = await issueTokens({ userId: user._id.toString() });

          // store (refresh) token in httpOnly cookie
          res.cookie('jid', tokens.refreshToken, {
            httpOnly: true,
            path: '/token',
            sameSite: 'strict',
            secure: NODE_ENV === 'production' ? true : false
          });

          // return (access) token in response
          return res.status(200).send({
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
 * Log out user
 * @param req
 * @param res
 * @returns
 */
export const logout = async (req: Request, res: Response) => {
  try {
    await clearTokens({
      userId: req.user._id.toString()
    });

    // clear httpOnly cookie
    res.cookie('jid', '', {
      httpOnly: true,
      path: '/token',
      sameSite: 'strict',
      secure: NODE_ENV === 'production' ? true : false
    });
  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to logout'
    });
  }

  return res.status(200).send({
    message: 'Successfully logged out.'
  });
};

/**
 * Return user is authenticated
 * @param req
 * @param res
 * @returns
 */
export const checkAuth = async (req: Request, res: Response) =>
  res.status(200).send({
    message: 'Authenticated'
  });

/**
 * Return new token by redeeming refresh token
 * @param req
 * @param res
 * @returns
 */
export const getNewToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.jid;

    if (!refreshToken) {
      throw new Error('Failed to find token in request cookies');
    }

    const decodedToken = <jwt.UserIDJwtPayload>(
      jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    );

    const user = await User.findOne({
      _id: decodedToken.userId
    }).select('+publicKey');

    if (!user) throw new Error('Failed to authenticate unfound user');
    if (!user?.publicKey)
      throw new Error('Failed to authenticate not fully set up account');

    const token = createToken({
      payload: {
        userId: decodedToken.userId
      },
      expiresIn: JWT_AUTH_LIFETIME,
      secret: JWT_AUTH_SECRET
    });

    return res.status(200).send({
      token
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Invalid request'
    });
  }
};
