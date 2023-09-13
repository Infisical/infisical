import { Request, Response } from "express";
import { User, MfaMethod } from "../../models";
import { generateSecretKey } from "../../utils/mfa/generateSecretKey";
import { verifyTotp, createRecoveryCodes } from "../../utils/mfa";
import { UnauthorizedRequestError, BadRequestError } from "../../utils/errors";
import { sendEmailDownloadRecoveryCodes } from "../../helpers/mfa";

/**
 * Enable authenticator app - Step 1: return [authAppSecret] (base32)
 * Generate a random 20 byte buffer, encode as base32 str, save in db & send to user
 * This is then embedded into a QR code on the frontend
 * The user scans this with their authenticator app to get the TOTP for Step 2
 * Alternatively, the user can configure their authenticator app manually with this secret
 * @param req 
 * @param res 
 */
export const enableAuthAppMfaStep1 = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.body.userId);

    if (!user) throw new Error("Failed to find user");

    const authAppSecretKey = await generateSecretKey();

    user.authAppSecretKey = authAppSecretKey;
    await user.save();

    return res.status(200).send({ authAppSecretKey });
  } catch (err) {
    console.error("Error configuring authenticator app:", err);
    throw BadRequestError({
       message: "Failed to configure MFA auth app. Please try again later or contact Infisical."
    })
  }
};

/**
 * Enable authenticator app - Step 2: after successfully verifying the user's TOTP from the authenticator app with the server's calculation, we update isMfaAuthAppEnabled to true
 * @param req 
 * @param res 
 */
export const enableAuthAppMfaStep2 = async (req: Request, res: Response) => {
  try {
    const { userTotp, userId } = req.body;

    if (userTotp.length !== 6 || !/^\d+$/.test(userTotp)) {
      throw UnauthorizedRequestError({
        message: "Two-factor code verification failed. Please try again."
      });
    }

    const user = await User.findById(userId).select("+authAppSecretKey");

    if (!user) throw new Error("Failed to find user");

    const dbSecretKey = user.authAppSecretKey;

    if (!dbSecretKey) {
      throw UnauthorizedRequestError({
        message: "Two-factor code verification failed. Please try again."
      })
    }

    const isTotpCorrect = await verifyTotp({ userTotp, dbSecretKey });

    if (!isTotpCorrect) {
      console.log("wrong code")
      throw UnauthorizedRequestError({
        message: "Two-factor code verification failed. Please try again."
      });
    }

    if (!user.isMfaEnabled) {
      user.isMfaEnabled = true;
      user.mfaPreference = MfaMethod.AUTH_APP;
    };

    user.mfaMethods?.push(MfaMethod.AUTH_APP);
    await user.save();

    return res.status(200).send({ enabled: true });

  } catch (err) {
    console.error("Error enabling MFA with authenticator app:", err);
    throw UnauthorizedRequestError({
      message: "Two-factor code verification failed. Please try again."
    })  
  }
};

/**
 * Disable multi-factor authentication using the authenticator app.
 * @param req 
 * @param res 
 */
export const disableMfaAuthApp = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.body.userId);

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaMethods || !user.mfaMethods?.includes(MfaMethod.AUTH_APP)) {
      throw BadRequestError({
        message: "Failed to disable MFA auth app. Please try again."
      })
    };

    delete user.authAppSecretKey;
    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.AUTH_APP);
    await user.save();

    if (user.mfaMethods.length === 1) {
      user.mfaPreference = MfaMethod.EMAIL;
      await user.save();
    };

    if (user.mfaMethods.length === 0) {
      user.isMfaEnabled = false;
      delete user.mfaPreference;
      await user.save();
    };

    return res.status(200).send({ disabled: true });

  } catch (err) {
    console.error("Error disabling MFA with authenticator app:", err);
    throw BadRequestError({
      message: "Failed to disable MFA auth app. Please try again later or contact Infisical."
    });  
  }
}

/**
 * Enable multi-factor authentication using email.
 * @param req 
 * @param res 
 */
export const enableMfaEmail = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.body.userId);

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled) {
      user.isMfaEnabled = true;
      user.mfaPreference = MfaMethod.EMAIL;
    };

    user.mfaMethods?.push(MfaMethod.EMAIL);
    await user.save();

    return res.status(200).send({ enabled: true });

  } catch (err) {
    console.error("Error enabling MFA with email:", err);
    throw UnauthorizedRequestError({
      message: "Error enabling MFA with email. Please try again."
    })  
  }
};

/**
 * Disable multi-factor authentication using email.
 * @param req 
 * @param res 
 */
export const disableMfaEmail = async (req: Request, res: Response) => {
  const errMsg = "Failed to disable MFA with email. Please try again.";
  try {
    const user = await User.findById(req.body.userId);

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaMethods || !user.mfaMethods?.includes(MfaMethod.EMAIL)) {
      throw BadRequestError({
        message: errMsg
      })
    };

    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.EMAIL);
    await user.save();

    if (user.mfaMethods.length === 1) {
      user.mfaPreference = MfaMethod.AUTH_APP;
      await user.save();
    };

    if (user.mfaMethods.length === 0) {
      user.isMfaEnabled = false;
      delete user.mfaPreference;
      await user.save();
    };

    return res.status(200).send({ disabled: true });
  } catch (err) {
    console.error("Error disabling MFA with email:", err);
    throw BadRequestError({
      message: errMsg
    });  
  }
}

/**
 * Update the user's MFA preference so it is shown as priority
 * after login. NB. the user should still be able to select any
 * other MFA options they have configured.
 * @param req 
 * @param res 
 */
export const updateMfaPreference = async (req: Request, res: Response) => {
  try {
    const { userId, mfaPreference } = req.body;
    const user = await User.findById({ userId });

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled) {
      throw BadRequestError({
        message: "Please enable MFA first."
      })
    };

    if (!Object.values(MfaMethod).includes(mfaPreference)) {
      throw BadRequestError({
        message: "Invalid MFA preference."
      });
    };

    user.mfaPreference = mfaPreference;
    await user.save();

    return res.status(200).send({message: "MFA preference successfully updated"});

  } catch (err) {
    console.error("Error updating MFA preference:", err);
    throw UnauthorizedRequestError({
      message: "Error updating MFA preference. Please try again."
    })  
  }
};

/**
 * Disable all multi-factor authentication for the user.
 * @param req 
 * @param res 
 */
export const disableMfaAll = async (req: Request, res: Response) => {
  const errMsg = "Failed to disable MFA. Please try again."
  try {
    const user = await User.findById(req.body.userId);
    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaMethods) {
      throw BadRequestError({
        message: errMsg
      });
    }

    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.EMAIL);
    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.AUTH_APP);
    
    delete user.mfaPreference;
    delete user.authAppSecretKey;
    delete user.mfaRecoveryCodes;

    user.isMfaEnabled = false;
    await user.save();
    console.log("user:", user);

    return res.status(200).send({ disabled: true });

  } catch (err) {
    console.error("Error disabling MFA:", err);
    throw BadRequestError({
      message: errMsg
    });
  }
};

/**
 * Generate backup codes (specific to MFA) - prevents user being locked out of their account
 * @param req 
 * @param res 
 */
export const generateRecoveryCodes = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.body.userId);

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled) {
      throw BadRequestError({
        message: "Error generating recovery codes"
      });
    };

    const recoveryCodesArr = await createRecoveryCodes();

    user.mfaRecoveryCodes = recoveryCodesArr;
    await user.save();

    // remind the user to download the MFA recovery codes to avoid account lockout
    await sendEmailDownloadRecoveryCodes({ email: user.email });

    return res.status(200).send({ recoveryCodesArr });

  } catch (err) {
    console.error("Error generating recovery codes:", err);
    throw UnauthorizedRequestError({
      message: "Error generating recovery codes. Please try again."
    })  
  }
};

/**
 * Generate backup codes (specific to MFA) - prevents user being locked out of their account
 * @param req 
 * @param res 
 */
export const verifyRecoveryCode = async (req: Request, res: Response) => {
  try {
    const { userRecoveryCode, userId } = req.body;

    // fix me!
    const recoveryCodeValidator = async (str: string) => {
      const newStr = userRecoveryCode.slice(0, 5).concat(userRecoveryCode.slice(6, 11));
      if (
        str.length === 11 &&
        typeof str === "string" &&
        str.indexOf("-") === 5 &&
        /^[a-z0-9]*$/.test(newStr) === true
      )
        return;
      else {
        throw UnauthorizedRequestError({
          message: "Invalid credentials. Please try again."
        });
      }
    };

    await recoveryCodeValidator(userRecoveryCode);

    const user = await User.findById(userId).select("+mfaRecoveryCodes");

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaRecoveryCodes || user.mfaRecoveryCodes.length < 1) {
      throw UnauthorizedRequestError({
        message: "Invalid credentials. Please try again."
      });
    };

    const recoveryCodesArr = user.mfaRecoveryCodes;
    const index = recoveryCodesArr.indexOf(userRecoveryCode);
    const isMatch = index !== -1;

    if (!isMatch) {
      throw UnauthorizedRequestError({
        message: "Invalid credentials. Please try again."
      });
    }

    delete recoveryCodesArr[index];
    await user.save();

    const getCount = (arr: string[], val: null) => {
      let count = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] === val) count++;
      return count;
    };

    const numStartingCodes = Object.keys(recoveryCodesArr).length;

    const numCodesLeft =
      numStartingCodes - getCount(Object.values(recoveryCodesArr), null);

    if (numCodesLeft === 0 || numCodesLeft >= numStartingCodes) {
      throw UnauthorizedRequestError({
        message: "Invalid credentials. Please try again."
      });
    }

    const codesLeftMsg = () => {
      if (numCodesLeft > 1 && numCodesLeft < numStartingCodes)
        return `You have ${numCodesLeft} MFA recovery codes remaining.`;
      else if (numCodesLeft === 1) return `You have 1 MFA recovery code remaining. Please generate more to prevent losing access to your Infisical account.`;
      else return `You have no MFA recovery codes left. Please generate more to prevent losing access to your Infisical account.`;
    };

    const msg = codesLeftMsg();

    console.log("msg:", msg);

    // Notiy the user that a MFA recovery code was used to access their account.
    // Notify the user how many codes they have remaining.
    // Rremind the user to generate more MFA recovery codes if they have 1 or 0 remaining to avoid account lockout.
    // await sendEmailARecoveryCodeWasUsedToAccessYourAccount({ email: user.email, codesLeftMsg: msg });

    return res.status(200).send({ verified: true });

  } catch (err) {
    console.error("Error using recovery code:", err);
    throw UnauthorizedRequestError({
      message: "Invalid credentials. Please try again."
    })  
  }
};