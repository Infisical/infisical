import { Request, Response } from "express";
import { AuthMethod, User } from "../../models";
import { checkEmailVerification, sendEmailVerification } from "../../helpers/signup";
import { createToken } from "../../helpers/auth";
import { BadRequestError } from "../../utils/errors";
import {
  getInviteOnlySignup,
  getJwtSignupLifetime,
  getJwtSignupSecret,
  getSmtpConfigured
} from "../../config";
import { validateUserEmail } from "../../validation";

/**
 * Signup step 1: Initialize account for user under email [email] and send a verification code
 * to that email
 * @param req
 * @param res
 * @returns
 */
export const beginEmailSignup = async (req: Request, res: Response) => {
  const email: string = req.body.email;

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
  const { email, code } = req.body;

  // initialize user account
  user = await User.findOne({ email }).select("+publicKey");
  if (user && user?.publicKey) {
    // case: user has already completed account
    return res.status(403).send({
      error: "Failed email verification for complete user"
    });
  }

  if (await getInviteOnlySignup()) {
    // Only one user can create an account without being invited. The rest need to be invited in order to make an account
    const userCount = await User.countDocuments({});
    if (userCount != 0) {
      throw BadRequestError({
        message: "New user sign ups are not allowed at this time. You must be invited to sign up."
      });
    }
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
      userId: user._id.toString()
    },
    expiresIn: await getJwtSignupLifetime(),
    secret: await getJwtSignupSecret()
  });

  return res.status(200).send({
    message: "Successfuly verified email",
    user,
    token
  });
};
