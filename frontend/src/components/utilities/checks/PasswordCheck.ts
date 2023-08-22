import { checkIsPasswordBreached } from "./checkIsPasswordBreached";

/* eslint-disable no-param-reassign */
interface PasswordCheckProps {
  password: string;
  errorCheck: boolean;
  setPasswordErrorTooShort: (value: boolean) => void;
  setPasswordErrorTooLong: (value: boolean) => void;
  setPasswordErrorUpperCase: (value: boolean) => void;
  setPasswordErrorLowerCase: (value: boolean) => void;
  setPasswordErrorNumber: (value: boolean) => void;
  setPasswordErrorSpecialChar: (value: boolean) => void;
  setPasswordErrorRepeatedChar: (value: boolean) => void;
  setPasswordErrorIsBreachedPassword: (value: boolean) => void;
}

/**
 * This function checks a user password with respect to some criteria.
 */
const passwordCheck = async ({
  password,
  setPasswordErrorTooShort,
  setPasswordErrorTooLong,
  setPasswordErrorUpperCase,
  setPasswordErrorLowerCase,
  setPasswordErrorNumber,
  setPasswordErrorSpecialChar,
  setPasswordErrorRepeatedChar,
  setPasswordErrorIsBreachedPassword,
  errorCheck
}: PasswordCheckProps) => {
  // tooShort
  if (!password || password.length < 14) {
    setPasswordErrorTooShort(true);
    errorCheck = true;
  } else {
    setPasswordErrorTooShort(false);
  }

  // tooLong
  if (password.length > 100) {
    setPasswordErrorTooLong(true);
    errorCheck = true;
  } else {
    setPasswordErrorTooLong(false);
  }

  // upperCase
  if (!/[A-Z]/.test(password)) {
    setPasswordErrorUpperCase(true);
    errorCheck = true;
  } else {
    setPasswordErrorUpperCase(false);
  }

  // lowerCase
  if (!/[a-z]/.test(password)) {
    setPasswordErrorLowerCase(true);
    errorCheck = true;
  } else {
    setPasswordErrorLowerCase(false);
  }

  // number
  if (!/[0-9]/.test(password)) {
    setPasswordErrorNumber(true);
    errorCheck = true;
  } else {
    setPasswordErrorNumber(false);
  }

  // specialChar
  if (
    !/[!@#$%^&*(),.?":{}|<>\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Cyrillic_Supplement}\p{Script=Cyrillic_Extended_A}\p{Script=Cyrillic_Extended_B}\p{Script=Cyrillic_Extended_C}\p{Script=Cyrillic_Extended_D}\p{Script=Ukrainian}\p{Script=Farsi}\p{Emoji}]/u.test(
      password
    )
  ) {
    setPasswordErrorSpecialChar(true);
    errorCheck = true;
  } else {
    setPasswordErrorSpecialChar(false);
  }

  // repeatedChar
  if (/([A-Za-z0-9])\1\1\1/.test(password)) {
    setPasswordErrorRepeatedChar(true);
    errorCheck = true;
  } else {
    setPasswordErrorRepeatedChar(false);
  }

  // breachedPassword
  if (await checkIsPasswordBreached(password)) {
    setPasswordErrorIsBreachedPassword(true);
    errorCheck = true;
  } else {
    setPasswordErrorIsBreachedPassword(false);
  }

  return errorCheck;
};

export default passwordCheck;
