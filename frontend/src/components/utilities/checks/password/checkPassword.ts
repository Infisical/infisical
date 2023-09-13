import { checkIsPasswordBreached } from "./checkIsPasswordBreached";
import { escapeCharRegex, letterCharRegex, lowEntropyRegexes,numAndSpecialCharRegex, repeatedCharRegex } from "./passwordRegexes";

export type PasswordErrors = {
  tooShort?: string;
  tooLong?: string;
  noLetterChar?: string;
  noNumOrSpecialChar?: string;
  repeatedChar?: string;
  escapeChar?: string;
  lowEntropy?: string;
  breached?: string;
};

interface CheckPasswordParams {
  password: string;
  setPrimaryPasswordErrors: (value: Omit<PasswordErrors, "breached">) => void;
}

/**
 * Validate that the password [password]:
 * - Contains at least 14 characters
 * - Contains at most 100 characters
 * - Contains at least 1 letter character (many languages supported) (case insensitive)
 * - Contains at least 1 number (0-9) or special character (emojis included)
 * - Does not contain 3 repeat, consecutive characters
 * - Does not contain any escape characters/sequences
 * - Does not contain PII and/or low entropy data (eg. email address, URL, phone number, DoB, SSN, driver's license, passport)
 *
 * The function returns whether or not the password [password]
 * passes the minimum requirements above. It sets errors on
 * an error object via [setPrimaryPasswordErrors].
 *
 * @param {Object} obj
 * @param {String} obj.password - the password to check
 * @param {Function} obj.setPrimaryPasswordErrors - set state function to set error object
 */

export const primaryPasswordCheck = async ({ password, setPrimaryPasswordErrors }: CheckPasswordParams): Promise<boolean> => {
  const errors: Omit<PasswordErrors, "breached"> = {};

  const tests = [
    {
      name: "tooShort",
      validator: (pwd: string) => pwd.length >= 14,
      errorText: "at least 14 characters",
    },
    {
      name: "tooLong",
      validator: (pwd: string) => pwd.length < 101,
      errorText: "at most 100 characters",
    },
    {
      name: "noLetterChar",
      validator: (pwd: string) => letterCharRegex.test(pwd),
      errorText: "at least 1 letter character",
    },
    {
      name: "noNumOrSpecialChar",
      validator: (pwd: string) => numAndSpecialCharRegex.test(pwd),
      errorText: "at least 1 number or special character",
    },
    {
      name: "repeatedChar",
      validator: (pwd: string) => !repeatedCharRegex.test(pwd),
      errorText: "at most 3 repeated, consecutive characters",
    },
    {
      name: "escapeChar",
      validator: (pwd: string) => !escapeCharRegex.test(pwd),
      errorText: "No escape characters allowed.",
    },
    {
      name: "lowEntropy",
      validator: (pwd: string) => (
        !lowEntropyRegexes.some(regex => regex.test(pwd))
      ),
      errorText: "Password contains personal info.",
    },
  ];
  
  tests.forEach((test) => {
    if (test.validator && !test.validator(password)) {
      errors[test.name as keyof Omit<PasswordErrors, "breached">] = test.errorText;
    }
  });

  setPrimaryPasswordErrors(errors);
  return Object.keys(errors).length > 0;
};

interface BreachedPasswordCheckResult {
  isBreached: boolean;
  errorMessage?: string;
}

/**
 * Validate that the password [password]:
 * - Is not in a database of breached passwords (call to haveIBeenPwnd password API)
 *
 * The function returns whether or not the password [password]
 * passes the minimum requirements above. It sets errors on
 * an error object via [setSecondaryPasswordErrors].
 *
 * @param {Object} obj
 * @param {String} obj.password - the password to check
 * @param {Function} obj.setBreachedPasswordError - set state function to set error object
 */

export const breachedPasswordCheck = async ({ password }: { password: string }): Promise<BreachedPasswordCheckResult> => {
  const isBreached = await checkIsPasswordBreached(password);
 
  if (isBreached) {
    // TODO: add translations (kept PasswordError.breached)
    const errorMessage = "New password has previously appeared in a data breach and should never be used. Please choose a stronger password.";
    return { isBreached: true, errorMessage };
  }

  return { isBreached: false };
};