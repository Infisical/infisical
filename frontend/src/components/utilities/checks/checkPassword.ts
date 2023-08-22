import isEmail from "validator/lib/isEmail";
import { checkIsPasswordBreached } from "./checkIsPasswordBreached";

type Errors = {
  tooShort?: string;
  tooLong?: string;
  upperCase?: string;
  lowerCase?: string;
  number?: string;
  specialChar?: string;
  repeatedChar?: string;
  isEmail?: string;
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
 * - Is not an email address
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
  // this adds support for the user to select an uppercase character from many major languages
  // NB. ES2018 is required to run this
  if (!/[A-Z\u0041-\u005A\u00C0-\u00D6\u00D8-\u00DE]/.test(password)) {
    errors.upperCase = "at least 1 uppercase character"; // most major langauges supported
  }

  // lowerCase
  // this adds support for the user to select a lowercase character from many major languages
  // NB. ES2018 is required to run this
  if (!/[a-z\u0061-\u007A\u00DF-\u00F6\u00F8-\u00FF]/.test(password)) {
    errors.lowerCase = "at least 1 lowercase character"; // most major langauges supported
  }

  // number
  if (!/[0-9]/.test(password)) {
    errors.number = "at least 1 number";
  }

  // specialChar
  // this adds support for the user to select a special character from many major languages and emojis
  // NB. ES2018 is required to run this
  if (
    !/[!@#$%^&*(),.?":{}|<>\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u05B0-\u05FF\u0980-\u09FF\u1F00-\u1FFF\u0130\u015E\u011E\u00D6\u00C7\u00FC\u00FB\u00F6\u00EB\u00E7\u00C7\p{Emoji}]/u.test(
      password
    )
  ) {
    errors.specialChar =
      "at least 1 special character (emojis and many langauge scripts supported)";
  }

  // repeatedChar
  // this prevents the user from selecting repeated characters from many major languages, emojis as well as numbers and symbols
  // NB. ES2018 is required to run this
  if (
    /([!@#$%^&*(),.?":{}|<>0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u05B0-\u05FF\u0980-\u09FF\u1F00-\u1FFF\u0130\u015E\u011E\u00D6\u00C7\u00FC\u00FB\u00F6\u00EB\u00E7\u00C7\u003a-\u003f\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\p{Emoji}])\1\1/.test(
      password
    )
  ) {
    errors.repeatedChar = "at most 2 repeated, consecutive characters";
  }

  // isEmail
  if (isEmail(password)) {
    errors.isEmail = "The password cannot be an email address";
  }

  // breachedPassword
  if (await checkIsPasswordBreached(password)) {
    errors.isBreachedPassword =
      "The new password is in a list of passwords commonly used on other websites. Please try again with a stronger password.";
  }

  setErrors(errors);
  return Object.keys(errors).length > 0;
};

export default checkPassword;
