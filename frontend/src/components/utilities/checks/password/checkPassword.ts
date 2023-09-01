import { checkIsPasswordBreached } from "./checkIsPasswordBreached";
import { escapeCharRegex, letterCharRegex, lowEntropyRegexes,numAndSpecialCharRegex, repeatedCharRegex } from "./passwordRegexes";

type Errors = {
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
  setErrors: (value: Errors) => void;
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

  const isBreached = await checkIsPasswordBreached(password);

  if (isBreached) {
    errors.breached = "Password was found in a data breach.";
  }

  tests.forEach((test) => {
    if (test.validator && !test.validator(password)) {
      errors[test.name as keyof Errors] = test.errorText;
    }
  });

  setErrors(errors);
  return Object.keys(errors).length > 0;
};

export default checkPassword;