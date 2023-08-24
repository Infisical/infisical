import { letterCharRegex, numAndSpecialCharRegex, repeatedCharRegex, escapeCharRegex, lowEntropyRegexes } from "./passwordRegexes";
import { checkIsPasswordBreached } from "./checkIsPasswordBreached";

interface PasswordCheckProps {
  password: string;
  errorCheck: boolean;
  setPasswordErrorTooShort: (value: boolean) => void;
  setPasswordErrorTooLong: (value: boolean) => void;
  setPasswordErrorNoLetterChar: (value: boolean) => void;
  setPasswordErrorNoNumOrSpecialChar: (value: boolean) => void;
  setPasswordErrorRepeatedChar: (value: boolean) => void;
  setPasswordErrorEscapeChar: (value: boolean) => void;
  setPasswordErrorLowEntropy: (value: boolean) => void;
  setPasswordErrorBreached: (value: boolean) => void;
}

const passwordCheck = async ({
  password,
  setPasswordErrorTooShort,
  setPasswordErrorTooLong,
  setPasswordErrorNoLetterChar,
  setPasswordErrorNoNumOrSpecialChar,
  setPasswordErrorRepeatedChar,
  setPasswordErrorEscapeChar,
  setPasswordErrorLowEntropy,
  setPasswordErrorBreached,
  errorCheck
}: PasswordCheckProps) => {
  const tests = [
    {
      name: "tooShort",
      validator: (pwd: string) => pwd.length >= 14,
      setError: setPasswordErrorTooShort,
    },
    {
      name: "tooLong",
      validator: (pwd: string) => pwd.length < 101,
      setError: setPasswordErrorTooLong,
    },
    {
      name: "noLetterChar",
      validator: (pwd: string) => letterCharRegex.test(pwd),
      setError: setPasswordErrorNoLetterChar,
    },
    {
      name: "noNumOrSpecialChar",
      validator: (pwd: string) => numAndSpecialCharRegex.test(pwd),
      setError: setPasswordErrorNoNumOrSpecialChar,
    },
    {
      name: "repeatedChar",
      validator: (pwd: string) => !repeatedCharRegex.test(pwd),
      setError: setPasswordErrorRepeatedChar,
    },
    {
      name: "escapeChar",
      validator: (pwd: string) => !escapeCharRegex.test(pwd),
      setError: setPasswordErrorEscapeChar,
    },
    {
      name: "lowEntropy",
      validator: (pwd: string) => (
        !lowEntropyRegexes.some(regex => regex.test(pwd))
      ),
       setError: setPasswordErrorLowEntropy,
    },
  ];

  const isBreached = await checkIsPasswordBreached(password);

  if (isBreached) {
    errorCheck = true;
    setPasswordErrorBreached(true);
  } else {
    setPasswordErrorBreached(false);
  }

  for (const test of tests) {
    if (!test.validator(password)) {
      errorCheck = true;
      test.setError(true);
    } else {
      test.setError(false);
    }
  }

  return errorCheck;
};

export default passwordCheck;
