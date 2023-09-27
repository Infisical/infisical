import { Request, Response } from "express";

import { client, getEncryptionKey, getRootEncryptionKey } from "../../config";
import { MfaMethod, User } from "../../models";
import { generateSecretKey } from "../../utils/mfa/generateSecretKey";
import { createMfaRecoveryCodes, verifyTotp } from "../../utils/mfa";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { hasMultipleMfaMethods, removeAllMfaProperites, removeMfaRecoveryCodes } from "../../helpers/mfa";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/mfa";
import { MFA_RECOVERY_CODES_PARAMS } from "../../variables";
import { decryptSymmetric128BitHexKeyUTF8, encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { sendMail } from "../../helpers";

/**
 * Enable multi-factor authentication using email.
 * @param req 
 * @param res 
 */
export const enableMfaEmail = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ _id: req.user._id });

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaMethods || !user.mfaMethods.length) {
      user.isMfaEnabled = true;
      user.mfaMethods = [];
    }

    if (!user.mfaPreference) {
      user.mfaPreference = MfaMethod.EMAIL;
    }

    user.mfaMethods.push(MfaMethod.EMAIL);

    await user.save();

    return res.status(200).send({ enabled: true });

  } catch (err) {
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
  try {
    const user = await User.findOne({ _id: req.user._id }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag +mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag");

    if (!user) throw new Error("Failed to find user")

    if (!user.isMfaEnabled || !user.mfaMethods || !user.mfaMethods.length || !user.mfaMethods.includes(MfaMethod.EMAIL)) throw new Error("Failed to disable MFA with email.")

    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.EMAIL);

    if (hasMultipleMfaMethods(user)) {
      // Case: Multiple MFA methods, set preference to the last non-EMAIL method
      for (let i = user.mfaMethods.length - 1; i >= 0; i--) {
        if (user.mfaMethods[i] !== MfaMethod.EMAIL) {
          user.mfaPreference = user.mfaMethods[i];
          break;
        }
      }

    } else {
      // Case: No MFA methods will be configured after the operation
      removeAllMfaProperites(user);
    }

    await user.save();

    return res.status(200).send({ disabled: true });
  } catch (err) {
    throw BadRequestError({
      message: "Failed to disable MFA with email. Please try again."
    });  
  }
};

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
    const user = await User.findOne({ _id: req.user._id }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag");

    if (!user) throw new Error("Failed to find user");
    
    // base32 plaintext key to embed in uri on client & render the QR code
    const authAppSecretKey = await generateSecretKey(); 

    // encrypt the two-factor secret key and save in db
    const rootEncryptionKey = await getRootEncryptionKey();
    const encryptionKey = await getEncryptionKey();

    let ciphertext;
    let iv;
    let tag;

    if (rootEncryptionKey) {
      ({
        ciphertext,
        iv,
        tag
      } = client.encryptSymmetric(authAppSecretKey, rootEncryptionKey));
    } else if (encryptionKey) {
      ({
        ciphertext,
        iv,
        tag
      } = encryptSymmetric128BitHexKeyUTF8({
          plaintext: authAppSecretKey,
          key: encryptionKey
      }));
    }

    user.authAppSecretKeyCipherText = ciphertext;
    user.authAppSecretKeyIV = iv;
    user.authAppSecretKeyTag = tag;

    await user.save();

    return res.status(200).send({ authAppSecretKey });
  } catch (err) {
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
  const {
    body: { userTotp }
  } = await validateRequest(reqValidator.EnableMfaAuthAppStep2V3, req);
  
  try {
    const user = await User.findOne({ _id: req.user._id }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag");

    if (!user) throw new Error("Failed to find user");

    const rootEncryptionKey = await getRootEncryptionKey();
    const encryptionKey = await getEncryptionKey();

    const ciphertext = user.authAppSecretKeyCipherText;
    const iv = user.authAppSecretKeyIV;
    const tag = user.authAppSecretKeyTag;

    if (!ciphertext || !iv || !tag) throw new Error("Login failed. Some encryption properties needed for the two-factor secret key are missing.");

    let decryptedKey;

    if (rootEncryptionKey) {
      decryptedKey = client.decryptSymmetric(
        ciphertext,
        rootEncryptionKey,
        iv,
        tag
      );
    } else if (encryptionKey) {
      decryptedKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext,
        key: encryptionKey,
        iv,
        tag
      });
    }

    if (!decryptedKey) throw new Error("Login failed. Could not decrypt two-factor secret key.");

    const isTotpCorrect = await verifyTotp({ userTotp, dbSecretKey: decryptedKey });

    if (!isTotpCorrect) throw new Error("Two-factor code verification failed. Please try again.");

    if (!user.isMfaEnabled || !user.mfaMethods || !user.mfaMethods.length) {
      user.isMfaEnabled = true;
      user.mfaMethods = [];
    }

    if (!user.mfaPreference) {
      user.mfaPreference = MfaMethod.AUTH_APP;
    }
   
    user.mfaMethods.push(MfaMethod.AUTH_APP);

    await user.save();

    return res.status(200).send({ enabled: true });

  } catch (err) {
    throw BadRequestError({
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
    const user = await User.findOne({ _id: req.user._id }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag +webauthnDevices +currentChallenge +mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag");

    if (!user) throw new Error("Failed to find user");

    if (
      !user.isMfaEnabled ||
      !user.mfaMethods ||
      !user.mfaMethods.includes(MfaMethod.AUTH_APP)
    )
      throw new Error("Failed to disable MFA with the authenticator app. MFA is incorrectly configured.");
   
    user.authAppSecretKeyCipherText = undefined;
    user.authAppSecretKeyIV = undefined;
    user.authAppSecretKeyTag = undefined;
    user.mfaMethods = user.mfaMethods.filter((method: MfaMethod) => method !== MfaMethod.AUTH_APP);

    if (hasMultipleMfaMethods(user)) {
      // Case: Multiple MFA methods, set preference to the last non-AUTH_APP method
      for (let i = user.mfaMethods.length - 1; i >= 0; i--) {
        if (user.mfaMethods[i] !== MfaMethod.AUTH_APP) {
          user.mfaPreference = user.mfaMethods[i];
          break;
        }
      }

      const hasEmail = user.mfaMethods.includes(MfaMethod.EMAIL);
      const hasRecoveryCodes = user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES);

      if ((user.mfaMethods.length === 1 && hasEmail) || (user.mfaMethods.length === 2 && hasEmail && hasRecoveryCodes)) {
        // Case: email will be the only MFA method configured after the operation (excluding MFA recovery codes)
        // remove the MFA recovery codes then set email as preferred
        removeMfaRecoveryCodes(user);
        user.mfaPreference = MfaMethod.EMAIL;
      }
    } else {
      // Case: No MFA methods will be configured after the operation
      removeAllMfaProperites(user);
    }

    await user.save();

    return res.status(200).send({ disabled: true });

  } catch (err) {
    throw BadRequestError({
      message: "Failed to disable MFA with the authenticator app. Please try again later or contact Infisical."
    });  
  }
};

/**
 * Generate backup codes (specific to MFA) - prevents user being locked out of their account if they lose access to their device (ie. authenticator app or security key)
 * Email-based MFA does not have associated MFA recovery codes as the user is assumed to maintain control of their email account to use Infisical
 * @param req 
 * @param res 
 */
export const createNewMfaRecoveryCodes = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ _id: req.user._id }).select("+mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag");

    if (!user) throw new Error("Failed to find user");

    if (
      !user.isMfaEnabled ||
      !user.mfaMethods ||
      !user.mfaMethods.length
    )
      throw new Error("Error generating MFA recovery codes. MFA is incorrectly configured.");

    // generate (default: 8) plaintext base32-encoded MFA recovery codes
    const mfaRecoveryCodes = await createMfaRecoveryCodes();

    const rootEncryptionKey = await getRootEncryptionKey();
    const encryptionKey = await getEncryptionKey();

    const encryptedRecoveryCodes = [];

    // encrypt each code individually
    for (const code of mfaRecoveryCodes) {
      let ciphertext;
      let iv;
      let tag;

      if (rootEncryptionKey) {
        ({
          ciphertext,
          iv,
          tag
        } = client.encryptSymmetric(code, rootEncryptionKey));
      } else if (encryptionKey) {
        ({
          ciphertext,
          iv,
          tag
        } = encryptSymmetric128BitHexKeyUTF8({
            plaintext: code,
            key: encryptionKey
        }));
      }

      encryptedRecoveryCodes.push({
        ciphertext,
        iv,
        tag,
      });
    }

     // ensure any existing codes are overwritten
    user.mfaRecoveryCodesCipherText = [];
    user.mfaRecoveryCodesIV = [];
    user.mfaRecoveryCodesTag = [];

    for (const item of encryptedRecoveryCodes) {
      user.mfaRecoveryCodesCipherText.push(item.ciphertext);
      user.mfaRecoveryCodesIV.push(item.iv);
      user.mfaRecoveryCodesTag.push(item.tag);
    }

    // set the number of codes generated to keep track of how many are left & be resilient to changes in code numbers set
    user.mfaRecoveryCodesCount = [
      {
        startCount: MFA_RECOVERY_CODES_PARAMS.number,
        currentCount: MFA_RECOVERY_CODES_PARAMS.number,
      }
    ];

    if (!user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES)) {
      user.mfaMethods.push(MfaMethod.MFA_RECOVERY_CODES);
    }

    await user.save();

    // remind the user to download the MFA recovery codes to avoid account lockout (eg. if they lose access to their MFA-configured device)
    await sendMail({
      template: "downloadRecoveryCodes.handlebars",
      subjectLine: "[Infisical] Please download your multi-factor recovery codes",
      recipients: [user.email],
      substitutions: {},
    });

    return res.status(200).send( mfaRecoveryCodes );
  } catch (err) {
    throw UnauthorizedRequestError({
      message: "Error generating MFA recovery codes. Please try again."
    })  
  }
};

/**
 * Return MFA recovery codes [mfaRecoveryCodes] belonging to user
 * @param req
 * @param res
 * @returns
 */
export const showMfaRecoveryCodes = async (req: Request, res: Response) => {
  const user = await User.findOne({ _id: req.user._id }).select("+mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag");

  if (!user) throw new Error("Failed to find user");
 
  if (
    !user.isMfaEnabled ||
    !user.mfaMethods ||
    !user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES) ||
    !user.mfaRecoveryCodesCount
  )
    throw new Error("Error fetching MFA recovery codes. Some properties are missing or MFA is incorrectly configured.");

  const rootEncryptionKey = await getRootEncryptionKey();
  const encryptionKey = await getEncryptionKey();

  const ciphertextArr = user.mfaRecoveryCodesCipherText;
  const ivArr = user.mfaRecoveryCodesIV;
  const tagArr = user.mfaRecoveryCodesTag;

  if (!ciphertextArr || !ivArr || !tagArr) throw new Error("Failed to decrypt MFA recovery codes. Some encryption properties needed for the MFA recovery codes are missing.");

  if (
    ciphertextArr.length !== ivArr.length ||
    ciphertextArr.length !== tagArr.length
  )
    throw new Error("Failed to decrypt MFA recovery codes. Encryption array lengths for the MFA recovery codes do not match.");
 
  const mfaRecoveryCodes: string[] = [];
  const decryptedCodes: string[] = [];

  for (let i = 0; i < ciphertextArr.length; i++) {
    let decryptedCode; 

    if (rootEncryptionKey) {
      decryptedCode = client.decryptSymmetric(
        ciphertextArr[i],
        rootEncryptionKey,
        ivArr[i],
        tagArr[i]
      );
    } else if (encryptionKey) {
      decryptedCode = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: ciphertextArr[i],
        key: encryptionKey,
        iv: ivArr[i],
        tag: tagArr[i]
      });
    }

    if (!decryptedCode) throw new Error("Failed to decrypt MFA recovery codes. Could not decrypt MFA recovery code.");

    decryptedCodes.push(decryptedCode)
  }

  mfaRecoveryCodes.push(...decryptedCodes);

  await user.save();

  return res.status(200).send( mfaRecoveryCodes );
};

/**
 * Update the user's MFA preference so it is shown as priority
 * after login. NB. the user should still be able to select any
 * other MFA options they have configured.
 * @param req 
 * @param res 
 */
export const updateMfaPreference = async (req: Request, res: Response) => {
  const {
    body: { mfaPreference }
  } = await validateRequest(reqValidator.UpdateMfaPreferenceV3, req);

  try {
    const user = await User.findOne({ _id: req.user._id });

    if (!user) throw new Error("Failed to find user");

    if (!user.mfaMethods || !user.mfaMethods.includes(mfaPreference)) throw new Error("Invalid MFA preference.");
  
    user.mfaPreference = mfaPreference;
    await user.save();

    return res.status(200).send({ message: "MFA preference successfully updated" });
  } catch (err) {
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
  try {
    const user = await User.findOne({ _id: req.user._id }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag +mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag");

    if (!user) throw new Error("Failed to find user");

    if (!user.isMfaEnabled || !user.mfaMethods) throw new Error("Failed to disable MFA. Please try again.");

    removeAllMfaProperites(user);
    await user.save();

    // notify the user that MFA was disabled for their account and steps to take if they didn't execute this action
    await sendMail({
      template: "mfaDisabled.handlebars",
      subjectLine: "[Infisical] multi-factor authentication (MFA) was disabled for your account",
      recipients: [user.email],
      substitutions: {},
    });

    return res.status(200).send({ disabled: true });
  } catch (err) {
    throw BadRequestError({
      message: "Failed to disable MFA. Please try again."
    });
  }
};