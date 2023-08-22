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
};

interface CheckPasswordParams {
  password: string;
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
 *
 * The function returns whether or not the password [password]
 * passes the minimum requirements above. It sets errors on
 * an erorr object via [setErrors].
 *
 * @param {Object} obj
 * @param {String} obj.password - the password to check
 * @param {Function} obj.setErrors - set state function to set error object
 */
const checkPassword = async ({ password, setErrors }: CheckPasswordParams): Promise<boolean> => {
  const errors: Errors = {};

  // tooShort
  if (password.length < 14) {
    errors.tooShort = "at least 14 characters";
  }

  // tooLong
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
  if (
    !/[!@#$%^&*(),.?":{}|<>\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u05B0-\u05FF\u0980-\u09FF\u1F00-\u1FFF\u0130\u015E\u011E\u00D6\u00C7\u00FC\u00FB\u00F6\u00EB\u00E7\u00C7\p{Emoji}]/u.test(
      password
    )
  ) {
    errors.specialChar =
      'at least 1 special character (!@#$%^&*(),.?":{}|<>), Japanese, Korean, Arabic, Cyrillic, Greek, Devanagari, Turkish, or an emoji';
  }

  // repeatedChar
  if (/([A-Za-z0-9])\1\1\1/.test(password)) {
    errors.repeatedChar = "No 3 repeat, consecutive characters";
  }

  // breachedPassword
  if (await checkIsPasswordBreached(password)) {
    errors.isBreachedPassword =
      "The provided password is in a list of passwords commonly used on other websites. Please try again with a stronger password.";
  }

  setErrors(errors);
  return Object.keys(errors).length > 0;
};

export default checkPassword;
