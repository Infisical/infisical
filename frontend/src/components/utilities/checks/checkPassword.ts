import { checkIsPasswordBreached } from "./checkIsPasswordBreached";

type Errors = {
  tooShort?: string;
  tooLong?: string;
  upperCase?: string;
  lowerCase?: string;
  number?: string;
  specialChar?: string;
  repeatedChar?: string;
  isBreachedPassword?: string;
  isCommonPassword?: string;
};

interface CheckPasswordParams {
  password: string;
  commonPasswords: string[];
  setErrors: (value: Errors) => void;
}

/**
 * Validate that the password [password]:
 * - Contains at least 14 characters
 * - Contains at most 100 characters
 * - Contains at least 1 uppercase character (A-Z)
 * - Contains at least 1 lowercase character (a-z)
 * - Contains at least 1 number (0-9)
 * - Contains at least 1 special character
 * - Does not contain 3 repeat, consecutive characters
 * - Is not in a database of breached passwords
 * - Is not in a list of common passwords
 *
 * The function returns whether or not the password [password]
 * passes the minimum requirements above. It sets errors on
 * an erorr object via [setErrors].
 *
 * @param {Object} obj
 * @param {String} obj.password - the password to check
 * @param {Function} obj.setErrors - set state function to set error object
 */
const checkPassword = async ({
  password,
  commonPasswords,
  setErrors
}: CheckPasswordParams): Promise<boolean> => {
  const errors: Errors = {};

  // tooShort
  if (password.length < 14) {
    errors.tooShort = "at least 14 characters";
  }

  // toolong
  if (password.length > 100) {
    errors.tooLong = "at most 100 characters";
  }

  // upperCase
  if (!/[A-Z]/.test(password)) {
    errors.upperCase = "at least 1 uppercase character (A-Z)";
  }

  // lowerCase
  if (!/[a-z]/.test(password)) {
    errors.lowerCase = "at least 1 lowercase character (a-z)";
  }

  // number
  if (!/[0-9]/.test(password)) {
    errors.number = "at least 1 number (0-9)";
  }

  // specialChar
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.specialChar = "at least 1 special character (!@#$%^&*(),.?)";
  }

  // repeatedChar
  if (/([A-Za-z0-9])\1\1\1/.test(password)) {
    errors.repeatedChar = "No 3 repeat, consecutive characters";
  }

  // breachedPassword
  if (await checkIsPasswordBreached(password)) {
    errors.isBreachedPassword =
      "The password you provided is in a list of passwords commonly used on other websites. Please try again with a stronger password.";
  }

  // commonPassword
  if (commonPasswords.includes(password)) {
    errors.isCommonPassword = "No common passwords";
  }

  setErrors(errors);
  return Object.keys(errors).length > 0;
};

export default checkPassword;
