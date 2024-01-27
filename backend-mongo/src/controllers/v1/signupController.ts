import { Request, Response } from "express";
import { AuthMethod, User } from "../../models";
import { checkEmailVerification, sendEmailVerification } from "../../helpers/signup";
import { createToken } from "../../helpers/auth";
import {
  getAuthSecret,
  getJwtSignupLifetime,
  getSmtpConfigured
} from "../../config";
import { validateUserEmail } from "../../validation";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/auth";
import { AuthTokenType } from "../../variables";

/**
 * Signup step 1: Initialize account for user under email [email] and send a verification code
 * to that email
 * @param req
 * @param res
 * @returns
 */
export const beginEmailSignup = async (req: Request, res: Response) => {
  const {
    body: { email }
  } = await validateRequest(reqValidator.BeginEmailSignUpV1, req);

  // validate that email is not disposable
  validateUserEmail(email);

  const user = await User.findOne({ email }).select("+publicKey");
  if (user && user?.publicKey) {
    // case: user has already completed account

    return res.status(403).send({
      error: "Failed to send email verification code for complete account"
    });
  }

  // send send verification email
  await sendEmailVerification({ email });

  return res.status(200).send({
    message: `Sent an email verification code to ${email}`
  });
};

/**
 * Signup step 2: Verify that code [code] was sent to email [email] and issue
 * a temporary signup token for user to complete setting up their account
 * @param req
 * @param res
 * @returns
 */
export const verifyEmailSignup = async (req: Request, res: Response) => {
  let user;
  const {
    body: { email, code }
  } = await validateRequest(reqValidator.VerifyEmailSignUpV1, req);

  // initialize user account
  user = await User.findOne({ email }).select("+publicKey");
  if (user && user?.publicKey) {
    // case: user has already completed account
    return res.status(403).send({
      error: "Failed email verification for complete user"
    });
  }

  // verify email
  if (await getSmtpConfigured()) {
    await checkEmailVerification({
      email,
      code
    });
  }

  if (!user) {
    user = await new User({
      email,
      authMethods: [AuthMethod.EMAIL]
    }).save();
  }

  // generate temporary signup token
  const token = createToken({
    payload: {
      authTokenType: AuthTokenType.SIGNUP_TOKEN,
      userId: user._id.toString()
    },
    expiresIn: await getJwtSignupLifetime(),
    secret: await getAuthSecret()
  });

  return res.status(200).send({
    message: "Successfuly verified email",
    user,
    token
  });
};
